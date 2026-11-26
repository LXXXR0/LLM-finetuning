from __future__ import annotations

import argparse
import base64
import concurrent.futures
import datetime as dt
import hashlib
import hmac
import json
import mimetypes
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
STORAGE_DIR = Path(os.environ.get("PAPERWEAVE_STORAGE_DIR", ROOT)).resolve()
DATA_DIR = STORAGE_DIR / "data"
PDF_DIR = STORAGE_DIR / "pdfs"
LIBRARY_DIR = STORAGE_DIR / "library" / "papers"
DB_PATH = DATA_DIR / "papers.db"
CONFIG_PATH = ROOT / "config.json"
AUTH_CONFIG_PATH = DATA_DIR / ".auth.json"
MAX_AUTO_REFERENCES = 30

for directory in (DATA_DIR, PDF_DIR, LIBRARY_DIR):
    directory.mkdir(parents=True, exist_ok=True)

# A newly attached cloud volume starts empty. Seed it once with the database,
# PDFs and exported notes shipped in the deployment, then keep all later edits
# on the persistent volume.
if STORAGE_DIR != ROOT:
    seed_pairs = (
        (ROOT / "data" / "papers.db", DB_PATH),
        (ROOT / "pdfs", PDF_DIR),
        (ROOT / "library" / "papers", LIBRARY_DIR),
    )
    for source, target in seed_pairs:
        if source.is_file() and not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        elif source.is_dir() and not any(target.iterdir()):
            shutil.copytree(source, target, dirs_exist_ok=True)


def db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=20)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def init_db() -> None:
    with db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS papers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                openalex_id TEXT UNIQUE,
                doi TEXT UNIQUE,
                title TEXT NOT NULL,
                title_zh TEXT NOT NULL DEFAULT '',
                authors TEXT NOT NULL DEFAULT '[]',
                year INTEGER,
                abstract TEXT NOT NULL DEFAULT '',
                abstract_zh TEXT NOT NULL DEFAULT '',
                venue TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL DEFAULT '',
                pdf_url TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'unread',
                topics TEXT NOT NULL DEFAULT '[]',
                note TEXT NOT NULL DEFAULT '',
                is_seed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS edges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
                target_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
                type TEXT NOT NULL DEFAULT 'cites',
                note TEXT NOT NULL DEFAULT '',
                UNIQUE(source_id, target_id, type)
            );
            CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
            CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
            CREATE TABLE IF NOT EXISTS annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
                page INTEGER NOT NULL,
                data TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_annotations_paper_page ON annotations(paper_id, page);
            CREATE TABLE IF NOT EXISTS pdf_translations (
                paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
                page INTEGER NOT NULL,
                source_text TEXT NOT NULL,
                translated_text TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (paper_id, page)
            );
            """
        )
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(papers)")}
        if "title_zh" not in columns:
            connection.execute("ALTER TABLE papers ADD COLUMN title_zh TEXT NOT NULL DEFAULT ''")
        if "abstract_zh" not in columns:
            connection.execute("ALTER TABLE papers ADD COLUMN abstract_zh TEXT NOT NULL DEFAULT ''")


def config() -> dict[str, Any]:
    defaults = {"openalex_api_key": "", "github_repo": "", "auto_commit": False}
    if CONFIG_PATH.exists():
        try:
            defaults.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            pass
    return defaults


def clean_doi(value: str) -> str:
    value = urllib.parse.unquote(value).strip()
    value = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", value, flags=re.I)
    match = re.search(r"10\.\d{4,9}/[-._;()/:A-Z0-9]+", value, flags=re.I)
    return match.group(0).rstrip(".,;)]").lower() if match else ""


def reconstruct_abstract(index: Any) -> str:
    if not isinstance(index, dict):
        return ""
    positions: list[tuple[int, str]] = []
    for word, offsets in index.items():
        if isinstance(offsets, list):
            positions.extend((int(offset), str(word)) for offset in offsets)
    return " ".join(word for _, word in sorted(positions))


def translation_chunks(text: str, limit: int = 450) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    sentences = re.split(r"(?<=[.!?;])\s+", text)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if len(sentence) > limit:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(sentence[index:index + limit] for index in range(0, len(sentence), limit))
        elif not current:
            current = sentence
        elif len(current) + len(sentence) + 1 <= limit:
            current += " " + sentence
        else:
            chunks.append(current)
            current = sentence
    if current:
        chunks.append(current)
    return chunks


def translate_to_chinese(text: str) -> str:
    translated: list[str] = []
    for chunk in translation_chunks(text):
        query = urllib.parse.urlencode({"q": chunk, "langpair": "en|zh-CN"})
        try:
            payload = api_json(f"https://api.mymemory.translated.net/get?{query}", timeout=30)
        except (urllib.error.HTTPError, urllib.error.URLError) as exc:
            raise ValueError("翻译服务暂时不可用，请稍后再试。") from exc
        result = (payload.get("responseData") or {}).get("translatedText")
        if not result:
            raise ValueError("翻译服务暂时没有返回结果，请稍后再试。")
        translated.append(str(result))
    return "".join(translated)


def api_json(url: str, timeout: int = 20) -> dict[str, Any]:
    settings = config()
    if "api.openalex.org" in url and settings.get("openalex_api_key"):
        separator = "&" if "?" in url else "?"
        url += separator + "api_key=" + urllib.parse.quote(str(settings["openalex_api_key"]))
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "PaperWeave/0.1 (local research tool)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def openalex_work(identifier: str) -> dict[str, Any]:
    doi = clean_doi(identifier)
    if doi:
        key = urllib.parse.quote(f"https://doi.org/{doi}", safe="")
        return api_json(f"https://api.openalex.org/works/{key}")
    if re.fullmatch(r"W\d+", identifier, flags=re.I):
        return api_json(f"https://api.openalex.org/works/{identifier.upper()}")
    query = urllib.parse.quote(identifier)
    payload = api_json(f"https://api.openalex.org/works?search={query}&per-page=1")
    results = payload.get("results") or []
    if not results:
        raise ValueError("没有找到这篇论文，请改用 DOI 或更完整的标题。")
    return results[0]


def dehydrate(work: dict[str, Any], *, seed: bool = False) -> dict[str, Any]:
    authors = []
    for authorship in work.get("authorships") or []:
        author = authorship.get("author") or {}
        if author.get("display_name"):
            authors.append(author["display_name"])
    topics = []
    for topic in work.get("topics") or []:
        name = topic.get("display_name")
        if name:
            topics.append(name)
    primary = work.get("primary_location") or {}
    source = primary.get("source") or {}
    best_oa = work.get("best_oa_location") or {}
    doi = clean_doi(work.get("doi") or "")
    openalex_id = str(work.get("id") or "").rsplit("/", 1)[-1] or None
    return {
        "openalex_id": openalex_id,
        "doi": doi or None,
        "title": work.get("title") or work.get("display_name") or "未命名论文",
        "authors": authors,
        "year": work.get("publication_year"),
        "abstract": reconstruct_abstract(work.get("abstract_inverted_index")),
        "venue": source.get("display_name") or "",
        "url": work.get("doi") or primary.get("landing_page_url") or work.get("id") or "",
        "pdf_url": best_oa.get("pdf_url") or "",
        "topics": topics[:5],
        "is_seed": 1 if seed else 0,
    }


def upsert_paper(item: dict[str, Any]) -> int:
    now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    with db() as connection:
        row = None
        if item.get("openalex_id"):
            row = connection.execute("SELECT id FROM papers WHERE openalex_id = ?", (item["openalex_id"],)).fetchone()
        if row is None and item.get("doi"):
            row = connection.execute("SELECT id FROM papers WHERE doi = ?", (item["doi"],)).fetchone()
        if row is None and item.get("title"):
            row = connection.execute(
                "SELECT id FROM papers WHERE title = ? COLLATE NOCASE ORDER BY id LIMIT 1",
                (item["title"].strip(),),
            ).fetchone()
        if row:
            paper_id = int(row["id"])
            connection.execute(
                """UPDATE papers SET
                    openalex_id=COALESCE(openalex_id, ?), doi=COALESCE(doi, ?),
                    title=?, authors=?, year=?, abstract=CASE WHEN ? <> '' THEN ? ELSE abstract END,
                    venue=?, url=?, pdf_url=CASE WHEN ? <> '' THEN ? ELSE pdf_url END,
                    topics=?, is_seed=MAX(is_seed, ?), updated_at=? WHERE id=?""",
                (
                    item.get("openalex_id"), item.get("doi"), item["title"],
                    json.dumps(item.get("authors", []), ensure_ascii=False), item.get("year"),
                    item.get("abstract", ""), item.get("abstract", ""), item.get("venue", ""), item.get("url", ""),
                    item.get("pdf_url", ""), item.get("pdf_url", ""),
                    json.dumps(item.get("topics", []), ensure_ascii=False), item.get("is_seed", 0), now, paper_id,
                ),
            )
        else:
            cursor = connection.execute(
                """INSERT INTO papers
                    (openalex_id, doi, title, authors, year, abstract, venue, url, pdf_url, topics, is_seed, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    item.get("openalex_id"), item.get("doi"), item["title"],
                    json.dumps(item.get("authors", []), ensure_ascii=False), item.get("year"), item.get("abstract", ""),
                    item.get("venue", ""), item.get("url", ""), item.get("pdf_url", ""),
                    json.dumps(item.get("topics", []), ensure_ascii=False), item.get("is_seed", 0), now, now,
                ),
            )
            paper_id = int(cursor.lastrowid)
    export_markdown(paper_id)
    return paper_id


def add_edge(source_id: int, target_id: int, edge_type: str = "cites") -> None:
    if source_id == target_id:
        return
    with db() as connection:
        connection.execute(
            "INSERT OR IGNORE INTO edges(source_id, target_id, type) VALUES (?, ?, ?)",
            (source_id, target_id, edge_type),
        )


def paper_dict(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    result["authors"] = json.loads(result.get("authors") or "[]")
    result["topics"] = json.loads(result.get("topics") or "[]")
    return result


def get_paper(paper_id: int) -> dict[str, Any] | None:
    with db() as connection:
        row = connection.execute("SELECT * FROM papers WHERE id = ?", (paper_id,)).fetchone()
        if not row:
            return None
        paper = paper_dict(row)
        relations = connection.execute(
            """SELECT e.id, e.type, e.note, e.source_id, e.target_id,
                      p.title AS other_title, p.id AS other_id
               FROM edges e
               JOIN papers p ON p.id = CASE WHEN e.source_id = ? THEN e.target_id ELSE e.source_id END
               WHERE e.source_id = ? OR e.target_id = ? ORDER BY p.year DESC""",
            (paper_id, paper_id, paper_id),
        ).fetchall()
        paper["relations"] = [dict(item) for item in relations]
        return paper


def safe_name(title: str, paper_id: int) -> str:
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', " ", title)
    name = re.sub(r"\s+", " ", name).strip(" .")[:60]
    return f"{paper_id:04d} - {name or 'paper'}.md"


def safe_folder_name(title: str, paper_id: int) -> str:
    return safe_name(title, paper_id).removesuffix(".md")


def yaml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def paper_markdown(paper: dict[str, Any]) -> str:
    authors = "\n".join(f"  - {yaml_string(author)}" for author in paper["authors"]) or "  []"
    topics = "\n".join(f"  - {yaml_string(topic)}" for topic in paper["topics"]) or "  []"
    cited = []
    related = []
    for relation in paper.get("relations", []):
        line = f"- [[{relation['other_title']}]]"
        if relation["type"] == "cites" and relation["source_id"] == paper["id"]:
            cited.append(line)
        else:
            related.append(f"{line} · {relation['type']}")
    return f"""---
type: paper
title: {yaml_string(paper['title'])}
title_zh: {yaml_string(paper.get('title_zh') or '')}
year: {paper.get('year') or ''}
doi: {yaml_string(paper.get('doi') or '')}
openalex_id: {yaml_string(paper.get('openalex_id') or '')}
status: {paper.get('status') or 'unread'}
authors:
{authors}
topics:
{topics}
---

# {paper['title']}

> {paper.get('abstract') or '暂无摘要'}

## 中文翻译

### {paper.get('title_zh') or '尚未翻译标题'}

{paper.get('abstract_zh') or '尚未生成中文摘要。可在 PaperWeave 的“摘要”页点击“翻译为中文”。'}

## 我的笔记

{paper.get('note') or ''}

## 引用的论文

{chr(10).join(cited) if cited else '- 暂无'}

## 其他关系

{chr(10).join(related) if related else '- 暂无'}
"""


def export_markdown(paper_id: int) -> None:
    paper = get_paper(paper_id)
    if not paper:
        return
    body = paper_markdown(paper)
    old_files = list(LIBRARY_DIR.glob(f"{paper_id:04d} - *.md"))
    with db() as connection:
        seed_rows = connection.execute(
            """SELECT DISTINCT p.* FROM papers p
               JOIN edges e ON e.source_id = p.id
               WHERE e.target_id = ? AND p.is_seed = 1""",
            (paper_id,),
        ).fetchall()
    seed_parents = [paper_dict(row) for row in seed_rows]
    if paper.get("is_seed"):
        seed_dir = LIBRARY_DIR / safe_folder_name(paper["title"], paper_id)
        reference_dir = seed_dir / "references"
        reference_dir.mkdir(parents=True, exist_ok=True)
        (seed_dir / "README.md").write_text(body, encoding="utf-8")
        with db() as connection:
            targets = connection.execute(
                """SELECT p.* FROM papers p JOIN edges e ON e.target_id = p.id
                   WHERE e.source_id = ? AND e.type = 'cites' ORDER BY p.year DESC, p.title""",
                (paper_id,),
            ).fetchall()
        for row in targets:
            reference = paper_dict(row)
            reference["relations"] = get_paper(reference["id"])["relations"]
            (reference_dir / safe_name(reference["title"], reference["id"])).write_text(
                paper_markdown(reference), encoding="utf-8"
            )
    for seed in seed_parents:
        reference_dir = LIBRARY_DIR / safe_folder_name(seed["title"], seed["id"]) / "references"
        reference_dir.mkdir(parents=True, exist_ok=True)
        (reference_dir / safe_name(paper["title"], paper_id)).write_text(body, encoding="utf-8")
    if not paper.get("is_seed") and not seed_parents:
        unfiled = LIBRARY_DIR / "unfiled"
        unfiled.mkdir(parents=True, exist_ok=True)
        (unfiled / safe_name(paper["title"], paper_id)).write_text(body, encoding="utf-8")
    for old in old_files:
        old.unlink(missing_ok=True)


def rebuild_library_exports() -> None:
    with db() as connection:
        paper_ids = [int(row["id"]) for row in connection.execute("SELECT id FROM papers ORDER BY id")]
    for paper_id in paper_ids:
        export_markdown(paper_id)


def annotation_export_paths(paper: dict[str, Any]) -> list[Path]:
    paths: list[Path] = []
    if paper.get("is_seed"):
        paths.append(LIBRARY_DIR / safe_folder_name(paper["title"], paper["id"]) / "annotations.json")
    with db() as connection:
        parents = connection.execute(
            """SELECT DISTINCT p.* FROM papers p JOIN edges e ON e.source_id = p.id
               WHERE e.target_id = ? AND p.is_seed = 1""",
            (paper["id"],),
        ).fetchall()
    for row in parents:
        seed = paper_dict(row)
        filename = safe_name(paper["title"], paper["id"]).removesuffix(".md") + ".annotations.json"
        paths.append(LIBRARY_DIR / safe_folder_name(seed["title"], seed["id"]) / "references" / filename)
    return paths


def get_annotations(paper_id: int) -> list[dict[str, Any]]:
    with db() as connection:
        rows = connection.execute(
            "SELECT page, data FROM annotations WHERE paper_id = ? ORDER BY page, id", (paper_id,)
        ).fetchall()
    return [{"page": int(row["page"]), **json.loads(row["data"])} for row in rows]


def save_page_annotations(paper_id: int, page: int, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not get_paper(paper_id):
        raise ValueError("论文不存在。")
    if page < 1 or len(items) > 1000:
        raise ValueError("标注数据无效。")
    now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    with db() as connection:
        connection.execute("DELETE FROM annotations WHERE paper_id = ? AND page = ?", (paper_id, page))
        for item in items:
            connection.execute(
                "INSERT INTO annotations(paper_id, page, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (paper_id, page, json.dumps(item, ensure_ascii=False), now, now),
            )
    paper = get_paper(paper_id)
    exported = get_annotations(paper_id)
    for path in annotation_export_paths(paper):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(exported, ensure_ascii=False, indent=2), encoding="utf-8")
    return exported


def get_pdf_translation(paper_id: int, page: int) -> dict[str, Any] | None:
    with db() as connection:
        row = connection.execute(
            "SELECT page, source_text, translated_text, updated_at FROM pdf_translations WHERE paper_id = ? AND page = ?",
            (paper_id, page),
        ).fetchone()
    return dict(row) if row else None


def translate_pdf_page(paper_id: int, page: int, source_text: str) -> dict[str, Any]:
    if not get_paper(paper_id):
        raise ValueError("论文不存在。")
    source_text = re.sub(r"[ \t]+", " ", source_text).strip()
    if page < 1 or not source_text:
        raise ValueError("当前页没有提取到可翻译的英文文字。扫描版 PDF 暂时需要先做 OCR。")
    if len(source_text) > 12000:
        source_text = source_text[:12000]
    cached = get_pdf_translation(paper_id, page)
    if cached and cached["source_text"] == source_text:
        return cached
    translated_text = translate_to_chinese(source_text)
    now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    with db() as connection:
        connection.execute(
            """INSERT INTO pdf_translations(paper_id, page, source_text, translated_text, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(paper_id, page) DO UPDATE SET
                   source_text=excluded.source_text,
                   translated_text=excluded.translated_text,
                   updated_at=excluded.updated_at""",
            (paper_id, page, source_text, translated_text, now),
        )
    return get_pdf_translation(paper_id, page) or {}


def fetch_reference(ref_id: str) -> dict[str, Any] | None:
    try:
        return openalex_work(ref_id)
    except Exception:
        return None


def import_work(identifier: str, *, expand_references: bool = True) -> dict[str, Any]:
    work = openalex_work(identifier)
    paper_id = upsert_paper(dehydrate(work, seed=True))
    refs = []
    if expand_references:
        refs = [str(ref).rsplit("/", 1)[-1] for ref in (work.get("referenced_works") or [])[:MAX_AUTO_REFERENCES]]
    imported = 0
    if refs:
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            for ref_work in executor.map(fetch_reference, refs):
                if not ref_work:
                    continue
                ref_paper_id = upsert_paper(dehydrate(ref_work))
                add_edge(paper_id, ref_paper_id, "cites")
                imported += 1
    export_markdown(paper_id)
    return {"paper": get_paper(paper_id), "references_imported": imported}


def import_pdf(filename: str, content: bytes) -> dict[str, Any]:
    if not filename.lower().endswith(".pdf"):
        raise ValueError("目前只支持上传 PDF。")
    digest = hashlib.sha256(content).hexdigest()[:12]
    saved_name = f"{digest}.pdf"
    (PDF_DIR / saved_name).write_bytes(content)
    sample = content[:3_000_000].decode("latin-1", errors="ignore")
    doi = clean_doi(sample)
    if doi:
        try:
            result = import_work(doi, expand_references=False)
            paper_id = result["paper"]["id"]
            result["warning"] = "PDF 已导入并识别 DOI；需要时点击“展开引用”。"
        except Exception:
            title = Path(filename).stem.replace("_", " ")
            paper_id = upsert_paper({"title": title, "authors": [], "topics": [], "pdf_url": ""})
            result = {"paper": get_paper(paper_id), "references_imported": 0, "warning": "PDF 已导入，但自动识别的 DOI 无法匹配；已按文件名创建。"}
    else:
        title = Path(filename).stem.replace("_", " ")
        paper_id = upsert_paper({"title": title, "authors": [], "topics": [], "pdf_url": ""})
        result = {"paper": get_paper(paper_id), "references_imported": 0, "warning": "PDF 已导入；未识别到 DOI，已按文件名创建。"}
    local_url = f"/pdfs/{saved_name}"
    with db() as connection:
        connection.execute("UPDATE papers SET pdf_url = ?, updated_at = ? WHERE id = ?", (local_url, dt.datetime.now().astimezone().isoformat(timespec="seconds"), paper_id))
    export_markdown(paper_id)
    result["paper"] = get_paper(paper_id)
    return result


def git_sync() -> dict[str, Any]:
    git_executable = shutil.which("git")
    if not git_executable:
        user_git = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Git" / "cmd" / "git.exe"
        if user_git.is_file():
            git_executable = str(user_git)
    if not git_executable:
        raise ValueError("尚未找到 Git。请重新打开 PaperWeave 后再试。")
    try:
        subprocess.run([git_executable, "rev-parse", "--show-toplevel"], cwd=ROOT, check=True, capture_output=True, text=True)
        sync_paths = ["library", "config.example.json", "README.md"]
        subprocess.run([git_executable, "add", "--", *sync_paths], cwd=ROOT, check=True, capture_output=True, text=True)
        status = subprocess.run([git_executable, "status", "--porcelain", "--", *sync_paths], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()
        if not status:
            return {"message": "没有需要同步的变化。"}
        stamp = dt.datetime.now().astimezone().strftime("%Y-%m-%d %H:%M")
        subprocess.run([git_executable, "commit", "-m", f"Update paper notes {stamp}", "--", *sync_paths], cwd=ROOT, check=True, capture_output=True, text=True)
        subprocess.run([git_executable, "push"], cwd=ROOT, check=True, capture_output=True, text=True)
        return {"message": "已提交并推送到 GitHub。"}
    except FileNotFoundError as exc:
        raise ValueError("尚未安装 Git，核心功能不受影响。") from exc
    except subprocess.CalledProcessError as exc:
        raise ValueError((exc.stderr or exc.stdout or "Git 同步失败").strip()) from exc


class Handler(SimpleHTTPRequestHandler):
    server_version = "PaperWeave/0.1"

    def require_auth(self) -> bool:
        password = os.environ.get("PAPERWEAVE_PASSWORD", "")
        username = os.environ.get("PAPERWEAVE_USER", "iris")
        if not password and AUTH_CONFIG_PATH.is_file():
            try:
                auth_config = json.loads(AUTH_CONFIG_PATH.read_text(encoding="utf-8"))
                username = str(auth_config.get("username") or username)
                password = str(auth_config.get("password") or "")
            except (OSError, ValueError, json.JSONDecodeError):
                password = ""
        if not password:
            return True
        header = self.headers.get("Authorization", "")
        supplied = ""
        if header.startswith("Basic "):
            try:
                supplied = base64.b64decode(header[6:], validate=True).decode("utf-8")
            except (ValueError, UnicodeDecodeError):
                supplied = ""
        if hmac.compare_digest(supplied, f"{username}:{password}"):
            return True
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="PaperWeave", charset="UTF-8"')
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        self.send_header("Content-Length", "0")
        self.end_headers()
        return False

    def log_message(self, format: str, *args: Any) -> None:
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), format % args))

    def send_json(self, payload: Any, status: int = 200) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

    def do_HEAD(self) -> None:
        if urllib.parse.urlparse(self.path).path == "/health":
            self.send_response(200)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.require_auth():
            super().do_HEAD()

    def do_GET(self) -> None:
        if urllib.parse.urlparse(self.path).path == "/health":
            self.send_json({"status": "ok"})
            return
        if not self.require_auth():
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/api/graph":
            with db() as connection:
                papers = [paper_dict(row) for row in connection.execute("SELECT * FROM papers ORDER BY is_seed DESC, year DESC, id DESC")]
                edges = [dict(row) for row in connection.execute("SELECT * FROM edges")]
            self.send_json({"papers": papers, "edges": edges})
            return
        annotation_match = re.fullmatch(r"/api/papers/(\d+)/annotations", path)
        if annotation_match:
            self.send_json({"annotations": get_annotations(int(annotation_match.group(1)))})
            return
        pdf_translation_match = re.fullmatch(r"/api/papers/(\d+)/pdf-translation", path)
        if pdf_translation_match:
            page = int(urllib.parse.parse_qs(parsed.query).get("page", ["0"])[0])
            translation = get_pdf_translation(int(pdf_translation_match.group(1)), page)
            self.send_json(translation or {"page": page, "translated_text": ""})
            return
        match = re.fullmatch(r"/api/papers/(\d+)", path)
        if match:
            paper = get_paper(int(match.group(1)))
            self.send_json(paper if paper else {"error": "论文不存在"}, 200 if paper else 404)
            return
        if path.startswith("/pdfs/"):
            self.serve_file(PDF_DIR, path.removeprefix("/pdfs/"))
            return
        if path in ("", "/"):
            self.path = "/index.html"
        return super().do_GET()

    def serve_file(self, base: Path, relative: str) -> None:
        target = (base / urllib.parse.unquote(relative)).resolve()
        if base.resolve() not in target.parents or not target.is_file():
            self.send_error(404)
            return
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        if not self.require_auth():
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            if path == "/api/import":
                payload = self.read_json()
                identifier = str(payload.get("identifier") or "").strip()
                if not identifier:
                    raise ValueError("请输入 DOI、OpenAlex ID 或论文标题。")
                self.send_json(import_work(identifier))
                return
            if path == "/api/upload":
                length = int(self.headers.get("Content-Length", "0"))
                filename = urllib.parse.unquote(self.headers.get("X-Filename", "paper.pdf"))
                if length > 80 * 1024 * 1024:
                    raise ValueError("PDF 不能超过 80 MB。")
                self.send_json(import_pdf(filename, self.rfile.read(length)))
                return
            annotation_match = re.fullmatch(r"/api/papers/(\d+)/annotations", path)
            if annotation_match:
                payload = self.read_json()
                page = int(payload.get("page") or 0)
                items = payload.get("annotations")
                if not isinstance(items, list):
                    raise ValueError("标注数据无效。")
                saved = save_page_annotations(int(annotation_match.group(1)), page, items)
                self.send_json({"annotations": saved})
                return
            if path == "/api/translate":
                payload = self.read_json()
                source_text = str(payload.get("text") or "").strip()
                if not source_text:
                    raise ValueError("请先选择需要翻译的文字。")
                if len(source_text) > 12000:
                    source_text = source_text[:12000]
                self.send_json({"translated_text": translate_to_chinese(source_text)})
                return
            pdf_translation_match = re.fullmatch(r"/api/papers/(\d+)/pdf-translation", path)
            if pdf_translation_match:
                payload = self.read_json()
                self.send_json(translate_pdf_page(
                    int(pdf_translation_match.group(1)),
                    int(payload.get("page") or 0),
                    str(payload.get("text") or ""),
                ))
                return
            translate_match = re.fullmatch(r"/api/papers/(\d+)/translate", path)
            if translate_match:
                paper_id = int(translate_match.group(1))
                paper = get_paper(paper_id)
                if not paper:
                    raise ValueError("论文不存在。")
                title_zh = paper.get("title_zh") or translate_to_chinese(paper.get("title") or "")
                abstract_zh = paper.get("abstract_zh") or translate_to_chinese(paper.get("abstract") or "")
                if not abstract_zh:
                    raise ValueError("这篇论文暂时没有可翻译的摘要。")
                now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
                with db() as connection:
                    connection.execute(
                        "UPDATE papers SET title_zh = ?, abstract_zh = ?, updated_at = ? WHERE id = ?",
                        (title_zh, abstract_zh, now, paper_id),
                    )
                export_markdown(paper_id)
                self.send_json(get_paper(paper_id))
                return
            match = re.fullmatch(r"/api/papers/(\d+)", path)
            if match:
                paper_id = int(match.group(1))
                payload = self.read_json()
                allowed = {"note", "status"}
                updates = {key: payload[key] for key in allowed if key in payload}
                if not updates:
                    raise ValueError("没有可保存的字段。")
                sets = ", ".join(f"{key} = ?" for key in updates) + ", updated_at = ?"
                values = list(updates.values()) + [dt.datetime.now().astimezone().isoformat(timespec="seconds"), paper_id]
                with db() as connection:
                    connection.execute(f"UPDATE papers SET {sets} WHERE id = ?", values)
                export_markdown(paper_id)
                self.send_json(get_paper(paper_id))
                return
            if path == "/api/edges":
                payload = self.read_json()
                source_id = int(payload["source_id"])
                target_id = int(payload["target_id"])
                edge_type = str(payload.get("type") or "related")
                add_edge(source_id, target_id, edge_type)
                export_markdown(source_id)
                export_markdown(target_id)
                self.send_json({"ok": True})
                return
            if path == "/api/git-sync":
                self.send_json(git_sync())
                return
            self.send_json({"error": "接口不存在"}, 404)
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                message = "OpenAlex 拒绝了请求。请在 config.json 中配置 openalex_api_key。"
            elif exc.code == 404:
                message = "没有找到这篇论文，请检查 DOI。"
            else:
                message = f"文献服务请求失败（HTTP {exc.code}）。"
            self.send_json({"error": message}, 502)
        except (ValueError, KeyError, json.JSONDecodeError) as exc:
            self.send_json({"error": str(exc)}, 400)
        except Exception as exc:
            self.send_json({"error": f"处理失败：{exc}"}, 500)


def run(port: int, no_browser: bool, host: str = "127.0.0.1") -> None:
    init_db()
    os.chdir(WEB_DIR)
    server = ThreadingHTTPServer((host, port), Handler)
    display_host = "127.0.0.1" if host == "0.0.0.0" else host
    address = f"http://{display_host}:{port}"
    print(f"PaperWeave 已启动：{address}")
    print("按 Ctrl+C 停止。论文和笔记保存在当前文件夹中。")
    if not no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(address)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
    finally:
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PaperWeave local literature graph")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8765")))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    run(args.port, args.no_browser, args.host)
