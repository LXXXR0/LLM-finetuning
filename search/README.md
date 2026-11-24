# PaperWeave

本地优先的文献知识图谱工作台。导入 DOI、OpenAlex ID、论文标题或 PDF 后，自动获取论文元数据、参考文献，生成可交互关系图，并把阅读笔记导出为 Markdown。

本项目现放在 `LLM-finetuning/search/`。原 `search/` 中的 Markdown 研究笔记已原样迁移到 `library/search-notes/`，PaperWeave 生成的论文笔记位于 `library/papers/`。

## 启动

Windows 下双击 `start.bat`，或者在本目录运行：

```powershell
python app.py
```

浏览器会自动打开 <http://127.0.0.1:8765>。程序只监听本机地址，不会把本地文件暴露到局域网。

### 在 VS Code 内打开

本地安装 `vscode-extension/` 中的 PaperWeave Launcher 后，重新加载 VS Code，点击左下角状态栏的 `PaperWeave`。扩展会自动启动本地服务并使用 VS Code Simple Browser 打开工作台。

也可以按 `Ctrl+Shift+B` 只启动服务，再从命令面板运行 `Simple Browser: Show` 并输入 `http://127.0.0.1:8765`。

## 数据位置

- SQLite 数据库：`data/papers.db`
- Markdown 笔记：`library/papers/`
- 本地 PDF：`pdfs/`
- 私有设置：`config.json`

PDF、数据库和 `config.json` 默认不会进入 Git。Markdown 笔记可以正常同步。

## OpenAlex API Key

如果 OpenAlex 提示需要 API Key，把 `config.example.json` 复制为 `config.json`，填写：

```json
{
  "openalex_api_key": "你的 key"
}
```

## 当前版本

- 支持 DOI、标题、OpenAlex ID 和 PDF 导入；PDF 保存后会在后台自动补全元数据和引用
- 每篇种子论文自动获取最多 30 篇参考文献
- 可交互文献图谱、状态筛选、全文搜索
- 三栏宽度可拖动调整并自动记忆
- “我的文献”和“关系图”可分别收起；两侧同时收起时进入专注阅读视图
- 窄窗口自动切换为“文献 / 内容 / 图谱”分页视图，所有区域限制在窗口内部
- 使用本地 PDF.js 阅读 PDF，避免依赖浏览器内置 PDF 插件
- 统一通过“PDF + 阅读笔记”左右分屏阅读，阅读和记录可同时进行
- PDF 支持高亮、自由画笔、橡皮擦与撤销，标注自动保存在本地并导出 JSON
- PDF 可提取并翻译当前页文字，译文会按文献和页码缓存在本地
- PDF、中文译文与阅读笔记三栏均可拖动调整宽度，并自动记住比例
- PDF 支持选择文字后翻译选中内容或扩展翻译所在段落
- 主论文使用独立目录，参考文献保存在其 `references/` 子目录
- 主论文和参考文献均可写笔记，支持自动保存、手动保存和全屏编辑
- 摘要采用英文与中文左右对照显示
- 英文标题与摘要可按需翻译为中文并保存到 Markdown
- 笔记自动保存并导出 Markdown
- 检测到 Git 仓库和 Git 命令后，可以一键提交并推送

后续计划：被引论文展开、自定义关系、研究矩阵、AI 结构化阅读和 GitHub 首次连接向导。
