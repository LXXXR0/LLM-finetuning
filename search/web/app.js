const state = { papers: [], edges: [], selectedId: null, selectedPaper: null, status: 'all', query: '', saveTimer: null, graphSignature: '', polling: false, transform: { x: 0, y: 0, k: 1 } };
const pdfState = { module:null, document:null, url:'', paperId:null, page:1, zoom:1, renderTask:null, annotations:[], tool:'cursor', drawing:null, saveTimer:null, translationRequest:0, translationMode:'page', pageTexts:new Map(), selectedText:'' };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}
function toast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = `toast${error ? ' error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add('hidden'), 3600);
}
function loading(show) { $('#loading').classList.toggle('hidden', !show); }
function escapeHtml(value = '') { const el = document.createElement('div'); el.textContent = value; return el.innerHTML; }
function statusName(value) { return ({ unread: '未读', reading: '在读', core: '核心', done: '已读' })[value] || value; }
function isCompactLayout() { return window.matchMedia('(max-width: 900px)').matches; }
function switchMobilePanel(panel) {
  $('.workspace').dataset.mobilePanel=panel;
  $$('.mobile-tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.panel===panel));
  if(panel==='graph') setTimeout(renderGraph,0);
}

async function refresh(selectId = state.selectedId) {
  const data = await api('/api/graph'); state.papers = data.papers; state.edges = data.edges;
  state.graphSignature = graphSignature(data);
  renderList(); renderGraph();
  if (selectId && state.papers.some(p => p.id === selectId)) await selectPaper(selectId, false);
}
function graphSignature(data) {
  return `${data.edges.length}|${data.papers.map(p => `${p.id}:${p.updated_at}`).join('|')}`;
}
async function pollGraphUpdates() {
  if (state.polling) return;
  state.polling = true;
  try {
    const data = await api('/api/graph');
    const signature = graphSignature(data);
    if (signature !== state.graphSignature) {
      state.papers = data.papers; state.edges = data.edges; state.graphSignature = signature;
      renderList(); renderGraph();
      if (state.selectedId && !['note-editor','split-note-editor'].includes(document.activeElement?.id)) await selectPaper(state.selectedId, false);
      toast(`图谱已更新：${data.papers.length} 篇论文，${data.edges.length} 条关系。`);
    }
  } catch (_) {
    // The next poll will retry when the local service is available again.
  } finally { state.polling = false; }
}
function filteredPapers() {
  const q = state.query.toLowerCase();
  return state.papers.filter(p => (state.status === 'all' || p.status === state.status) && (!q || [p.title, ...(p.authors || []), ...(p.topics || [])].join(' ').toLowerCase().includes(q)));
}
function renderList() {
  const papers = filteredPapers(); $('#paper-count').textContent = state.papers.length;
  $('#paper-list').innerHTML = papers.length ? papers.map(p => `
    <div class="paper-card ${p.id === state.selectedId ? 'active' : ''}" data-id="${p.id}">
      <h3>${escapeHtml(p.title)}</h3><p><i class="status-chip ${p.status}"></i>${p.year || '年份未知'} · ${escapeHtml((p.authors || []).slice(0, 2).join(', ') || statusName(p.status))}</p>
    </div>`).join('') : '<div class="pdf-empty">没有匹配的文献</div>';
  $$('.paper-card').forEach(el => el.addEventListener('click', () => selectPaper(Number(el.dataset.id))));
}
async function selectPaper(id, rerender = true) {
  const changedPaper=state.selectedId!==id; state.selectedId = id; if (rerender) { renderList(); highlightGraph(); }
  const p = await api(`/api/papers/${id}`);
  state.selectedPaper = p;
  $('#empty-state').classList.add('hidden'); $('#paper-detail').classList.remove('hidden');
  $('#paper-title').textContent = p.title; $('#paper-year').textContent = p.year || '';
  $('#paper-venue').textContent = p.venue || ''; $('#paper-doi').textContent = p.doi || '';
  $('#paper-authors').textContent = (p.authors || []).join(' · ') || '作者信息暂缺';
  $('#paper-abstract').textContent = p.abstract || '暂时没有摘要。'; $('#note-editor').value = p.note || '';
  $('#paper-title-zh').textContent = p.title_zh || '';
  $('#paper-abstract-zh').textContent = p.abstract_zh || '';
  $('#translation-placeholder').classList.toggle('hidden', Boolean(p.abstract_zh));
  $('#translate-button').textContent = p.abstract_zh ? '已翻译' : '翻译为中文';
  if(changedPaper){$('#save-state').textContent='已保存';$('#split-save-state').textContent='已保存';}
  $('#status-select').value = p.status; $('#source-link').href = p.url || (p.doi ? `https://doi.org/${p.doi}` : '#');
  $('#topic-list').innerHTML = (p.topics || []).map(t => `<span>${escapeHtml(t)}</span>`).join('');
  const hasPdf = Boolean(p.pdf_url); $('#pdf-empty').classList.toggle('hidden', hasPdf); $('#pdf-viewer').classList.toggle('hidden', !hasPdf); if(hasPdf) { loadAnnotations(p.id); loadPdf(p.pdf_url, p.id); }
  $('#relation-list').innerHTML = (p.relations || []).length ? p.relations.map(r => `<div class="relation-item" data-id="${r.other_id}"><span class="relation-type">${r.source_id === p.id && r.type === 'cites' ? '引用' : escapeHtml(r.type)}</span><strong>${escapeHtml(r.other_title)}</strong><button class="relation-note" data-note-id="${r.other_id}">写笔记</button></div>`).join('') : '<div class="pdf-empty">暂无关系</div>';
  $$('.relation-item').forEach(el => el.addEventListener('click', () => selectPaper(Number(el.dataset.id))));
  $$('.relation-note').forEach(el => el.addEventListener('click', async event => { event.stopPropagation(); await selectPaper(Number(el.dataset.noteId)); activateTab('notes'); $('#note-editor').focus(); }));
  if(isCompactLayout()) switchMobilePanel('reader');
}

$('#import-form').addEventListener('submit', async e => {
  e.preventDefault(); const identifier = $('#import-input').value.trim(); if (!identifier) return;
  loading(true); try { const result = await api('/api/import', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({identifier}) }); $('#import-input').value=''; await refresh(result.paper.id); toast(`已加入论文，并连接 ${result.references_imported} 篇参考文献。`); } catch (err) { toast(err.message, true); } finally { loading(false); }
});
$('#pdf-input').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return; loading(true);
  try {
    const result = await api('/api/upload', { method:'POST', headers:{'Content-Type':'application/pdf', 'X-Filename':encodeURIComponent(file.name)}, body:file });
    await refresh(result.paper.id);
    toast('PDF 已保存，正在后台补全摘要和参考文献…');
    enrichPaperInBackground(result.paper);
  } catch(err) { toast(err.message, true); } finally { loading(false); e.target.value=''; }
});
async function enrichPaperInBackground(paper) {
  const identifier = paper.doi || paper.openalex_id || paper.title;
  if (!identifier) return;
  try {
    const result = await api('/api/import', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({identifier}) });
    await refresh(result.paper.id);
    toast(`资料补全完成：已连接 ${result.references_imported} 篇参考文献。`);
  } catch(err) {
    toast(`PDF 已保存，但自动补全失败：${err.message}`, true);
  }
}
$('#expand-button').addEventListener('click', async () => {
  if (!state.selectedPaper) return;
  const identifier = state.selectedPaper.doi || state.selectedPaper.openalex_id || state.selectedPaper.title;
  loading(true);
  try {
    const result = await api('/api/import', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({identifier}) });
    await refresh(result.paper.id);
    toast(`已连接 ${result.references_imported} 篇参考文献。`);
  } catch(err) { toast(err.message, true); } finally { loading(false); }
});
$('#search-input').addEventListener('input', e => { state.query = e.target.value; renderList(); });
$$('.filter').forEach(el => el.addEventListener('click', () => { $$('.filter').forEach(x=>x.classList.remove('active')); el.classList.add('active'); state.status=el.dataset.status; renderList(); }));
$('#status-select').addEventListener('change', async e => { try { await api(`/api/papers/${state.selectedId}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:e.target.value})}); await refresh(state.selectedId); toast('阅读状态已更新'); } catch(err){ toast(err.message,true); } });
function scheduleNoteSave() { clearTimeout(state.saveTimer); const paperId=state.selectedId,note=$('#note-editor').value; state.saveTimer=setTimeout(()=>saveNote(paperId,note),700); }
$('#note-editor').addEventListener('input', () => { if(!$('#split-workspace').classList.contains('hidden'))$('#split-note-editor').value=$('#note-editor').value; $('#save-state').textContent='正在输入…'; $('#split-save-state').textContent='正在输入…'; scheduleNoteSave(); });
async function saveNote(paperId=state.selectedId,note=$('#note-editor').value,announce=false) { if (!paperId) return; if(paperId===state.selectedId){$('#save-state').textContent='保存中…';$('#split-save-state').textContent='保存中…';} try { await api(`/api/papers/${paperId}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note})}); if(paperId===state.selectedId){$('#save-state').textContent='已保存并导出 Markdown';$('#split-save-state').textContent='已保存并导出 Markdown';} if(announce)toast('笔记已保存，并已导出 Markdown。'); } catch(err) { if(paperId===state.selectedId){$('#save-state').textContent='保存失败';$('#split-save-state').textContent='保存失败';} toast(err.message,true); } }
$('#note-save').addEventListener('click',()=>{clearTimeout(state.saveTimer);saveNote(state.selectedId,$('#note-editor').value,true);});
function activateTab(name) { $$('.tab').forEach(x=>x.classList.toggle('active', x.dataset.tab===name)); $$('.tab-page').forEach(x=>x.classList.add('hidden')); $(`#tab-${name}`).classList.remove('hidden'); }
$$('.tab').forEach(tab => tab.addEventListener('click', () => activateTab(tab.dataset.tab)));
$('#translate-button').addEventListener('click', async () => {
  if (!state.selectedId || !state.selectedPaper?.abstract) { toast('这篇论文暂时没有可翻译的摘要。', true); return; }
  $('#translate-button').disabled=true; $('#translate-button').textContent='翻译中…';
  try { const paper=await api(`/api/papers/${state.selectedId}/translate`,{method:'POST'}); state.selectedPaper=paper; $('#paper-title-zh').textContent=paper.title_zh||''; $('#paper-abstract-zh').textContent=paper.abstract_zh||''; $('#translation-placeholder').classList.add('hidden'); $('#translate-button').textContent='已翻译'; toast('中文翻译已保存到论文笔记。'); }
  catch(err){ $('#translate-button').textContent='重新翻译'; toast(err.message,true); }
  finally { $('#translate-button').disabled=false; }
});
function toggleNoteFocus(force) { const page=$('#tab-notes'); const active=force ?? !page.classList.contains('note-focus'); page.classList.toggle('note-focus',active); $('#note-fullscreen').textContent=active?'退出全屏 Esc':'全屏编辑 ⛶'; if(active) $('#note-editor').focus(); }
$('#note-fullscreen').addEventListener('click',()=>toggleNoteFocus());
async function openSplitWorkspace() {
  if(!state.selectedPaper?.pdf_url){toast('这篇文献还没有本地 PDF，无法进入分屏阅读。',true);return;}
  if(!pdfState.document) await loadPdf(state.selectedPaper.pdf_url,state.selectedId);
  $('#split-paper-title').textContent=state.selectedPaper.title; $('#split-note-editor').value=$('#note-editor').value; $('#split-note-editor').scrollTop=0; $('#split-workspace').classList.remove('hidden'); $('#split-pdf-host').appendChild($('#pdf-viewer')); applySplitRatio(); setTimeout(renderPdfPage,0); $('#split-note-editor').focus();
}
function closeSplitWorkspace() { if($('#split-workspace').classList.contains('hidden'))return; $('#note-editor').value=$('#split-note-editor').value; $('#pdf-storage').appendChild($('#pdf-viewer')); $('#split-workspace').classList.add('hidden'); clearTimeout(state.saveTimer); const paperId=state.selectedId,note=$('#note-editor').value;state.saveTimer=setTimeout(()=>saveNote(paperId,note),100); }
$('#note-split').addEventListener('click',openSplitWorkspace); $('#split-close').addEventListener('click',closeSplitWorkspace);
$('#split-note-editor').addEventListener('input',()=>{ $('#note-editor').value=$('#split-note-editor').value; $('#save-state').textContent='正在输入…';$('#split-save-state').textContent='正在输入…';scheduleNoteSave(); });
$('#split-note-save').addEventListener('click',()=>{clearTimeout(state.saveTimer);$('#note-editor').value=$('#split-note-editor').value;saveNote(state.selectedId,$('#split-note-editor').value,true);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!$('#split-workspace').classList.contains('hidden'))closeSplitWorkspace();else if($('#tab-notes').classList.contains('note-focus'))toggleNoteFocus(false);}});
$('#sync-button').addEventListener('click', async () => { try { const r=await api('/api/git-sync',{method:'POST'}); toast(r.message); } catch(err){ toast(err.message,true); } });
$$('.mobile-tab').forEach(tab=>tab.addEventListener('click',()=>switchMobilePanel(tab.dataset.panel)));

async function loadPdf(url, paperId=state.selectedId) {
  if(pdfState.url===url && pdfState.document) return;
  try {
    $('#pdf-status').textContent='加载阅读器…';
    if(!pdfState.module) { await loadClassicScript('/vendor/pdf.min.js'); pdfState.module=window.pdfjsLib; pdfState.module.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.min.js'; }
    pdfState.url=url; pdfState.paperId=paperId; pdfState.page=1; pdfState.zoom=1; pdfState.pageTexts.clear(); pdfState.selectedText=''; setPdfTranslationVisible(false,false);
    $('#pdf-status').textContent='读取 PDF…';
    const response=await fetch(url); if(!response.ok)throw new Error(`PDF 文件请求失败（${response.status}）`); const data=new Uint8Array(await response.arrayBuffer());
    $('#pdf-status').textContent='解析 PDF…';
    pdfState.document=await pdfState.module.getDocument({data}).promise;
    $('#pdf-pages').textContent=pdfState.document.numPages;
    $('#pdf-status').textContent=`共 ${pdfState.document.numPages} 页`;
    if(!$('#split-workspace').classList.contains('hidden')) await renderPdfPage();
  } catch(err) { $('#pdf-status').textContent='打开失败'; toast(`PDF 打开失败：${err.message}`,true); }
}
function loadClassicScript(src){return new Promise((resolve,reject)=>{const existing=document.querySelector(`script[src="${src}"]`);if(existing){if(window.pdfjsLib)resolve();else existing.addEventListener('load',resolve,{once:true});return;}const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(new Error('PDF 阅读组件加载失败'));document.head.appendChild(script);});}
function textContentToString(content){let text='';for(const item of content.items||[]){if(item.str)text+=item.str+(item.hasEOL?'\n':' ');}return text.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
async function renderPdfTextLayer(page,viewport,textContent){
  const layer=$('#pdf-text-layer');layer.innerHTML='';layer.style.width=`${Math.floor(viewport.width)}px`;layer.style.height=`${Math.floor(viewport.height)}px`;
  try{const task=pdfState.module.renderTextLayer({textContentSource:textContent,container:layer,viewport,textDivs:[]});if(task?.promise)await task.promise;}
  catch(_){layer.innerHTML='';}
}
async function renderPdfPage() {
  if(!pdfState.document) return;
  try {
    $('#pdf-status').textContent='渲染页面…';
    if(pdfState.renderTask) pdfState.renderTask.cancel();
    const page=await pdfState.document.getPage(pdfState.page); const base=page.getViewport({scale:1});
    const wrap=$('#pdf-canvas-wrap'); const fitWidth=Math.max(280,(wrap.clientWidth||$('.reader-panel').clientWidth)-34); const scale=(fitWidth/base.width)*pdfState.zoom;
    const viewport=page.getViewport({scale}); const ratio=window.devicePixelRatio||1; const canvas=$('#pdf-canvas'); const context=canvas.getContext('2d');
    canvas.width=Math.floor(viewport.width*ratio); canvas.height=Math.floor(viewport.height*ratio); canvas.style.width=`${Math.floor(viewport.width)}px`; canvas.style.height=`${Math.floor(viewport.height)}px`;
    pdfState.renderTask=page.render({canvasContext:context,viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]}); await pdfState.renderTask.promise; pdfState.renderTask=null;
    const textContent=await page.getTextContent();pdfState.pageTexts.set(pdfState.page,textContentToString(textContent));await renderPdfTextLayer(page,viewport,textContent);
    const annotationCanvas=$('#annotation-canvas'); annotationCanvas.width=canvas.width; annotationCanvas.height=canvas.height; annotationCanvas.style.width=canvas.style.width; annotationCanvas.style.height=canvas.style.height; drawAnnotations();
    $('#pdf-page').textContent=pdfState.page; $('#pdf-zoom').textContent=`${Math.round(pdfState.zoom*100)}%`; $('#pdf-prev').disabled=pdfState.page<=1; $('#pdf-next').disabled=pdfState.page>=pdfState.document.numPages; $('#pdf-status').textContent=`第 ${pdfState.page} 页`; wrap.scrollTop=0; if(!$('#pdf-translation').classList.contains('hidden')&&pdfState.translationMode==='page')loadCachedPdfTranslation(pdfState.page);
  } catch(err) { if(err?.name!=='RenderingCancelledException'){ $('#pdf-status').textContent='渲染失败'; toast(`PDF 页面渲染失败：${err.message}`,true); } }
}
$('#pdf-prev').addEventListener('click',()=>{if(pdfState.page>1){pdfState.page-=1;renderPdfPage();}});
$('#pdf-next').addEventListener('click',()=>{if(pdfState.document&&pdfState.page<pdfState.document.numPages){pdfState.page+=1;renderPdfPage();}});
$('#pdf-zoom-out').addEventListener('click',()=>{pdfState.zoom=Math.max(.5,pdfState.zoom-.15);renderPdfPage();});
$('#pdf-zoom-in').addEventListener('click',()=>{pdfState.zoom=Math.min(2.5,pdfState.zoom+.15);renderPdfPage();});

async function extractPdfPageText(pageNumber) {
  if(pdfState.pageTexts.has(pageNumber))return pdfState.pageTexts.get(pageNumber);
  const page=await pdfState.document.getPage(pageNumber),content=await page.getTextContent(),text=textContentToString(content);pdfState.pageTexts.set(pageNumber,text);return text;
}
async function loadCachedPdfTranslation(page) {
  pdfState.translationMode='page';const request=++pdfState.translationRequest;$('#pdf-translation-title').textContent=`第 ${page} 页中文`;$('#pdf-translation-text').textContent='正在查找已保存的译文…';
  try{const result=await api(`/api/papers/${pdfState.paperId}/pdf-translation?page=${page}`);if(request!==pdfState.translationRequest)return;$('#pdf-translation-text').textContent=result.translated_text||'这一页还没有翻译，点击工具栏中的“翻译本页”。';}
  catch(err){if(request===pdfState.translationRequest)$('#pdf-translation-text').textContent=`译文读取失败：${err.message}`;}
}
function setPdfTranslationVisible(visible,rerender=true){
  $('#pdf-translation').classList.toggle('hidden',!visible);$('#pdf-translation-resizer').classList.toggle('hidden',!visible);if(visible)applyTranslationRatio();else $('#pdf-selection-menu').classList.add('hidden');if(rerender&&pdfState.document&&!$('#split-workspace').classList.contains('hidden'))setTimeout(renderPdfPage,0);
}
$('#pdf-translate').addEventListener('click',async()=>{
  if(!pdfState.document||!pdfState.paperId)return;const page=pdfState.page,button=$('#pdf-translate');pdfState.translationMode='page';setPdfTranslationVisible(true);$('#pdf-translation-title').textContent=`第 ${page} 页中文`;$('#pdf-translation-text').textContent='正在提取本页文字…';button.disabled=true;button.textContent='翻译中…';
  try{const text=await extractPdfPageText(page);if(!text)throw new Error('当前页没有可提取文字，扫描版 PDF 暂时需要先做 OCR。');$('#pdf-translation-text').textContent='正在翻译，请稍候…';const result=await api(`/api/papers/${pdfState.paperId}/pdf-translation`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page,text})});if(page===pdfState.page){$('#pdf-translation-text').textContent=result.translated_text||'没有生成译文。';renderPdfPage();}}
  catch(err){$('#pdf-translation-text').textContent=`翻译失败：${err.message}`;toast(err.message,true);}finally{button.disabled=false;button.textContent='翻译本页';}
});
$('#pdf-translation-close').addEventListener('click',()=>setPdfTranslationVisible(false));

function selectedPdfText(){const selection=window.getSelection(),text=selection?.toString().replace(/\s+/g,' ').trim()||'';if(text&&selection?.anchorNode&&$('#pdf-text-layer').contains(selection.anchorNode))pdfState.selectedText=text;return pdfState.selectedText;}
function paragraphAroundSelection(fullText,selected){
  const full=fullText.replace(/\s+/g,' ').trim(),needle=selected.replace(/\s+/g,' ').trim(),index=full.toLowerCase().indexOf(needle.toLowerCase());if(index<0)return needle;
  const boundary=/[.!?。！？;]/,originStart=index,originEnd=index+needle.length;let start=originStart,end=originEnd,count=0;for(let i=originStart-1;i>=0&&originStart-i<700;i--){start=i;if(boundary.test(full[i])){count++;if(count===2){start=i+1;break;}}}count=0;for(let i=originEnd;i<full.length&&i-originEnd<1000;i++){end=i+1;if(boundary.test(full[i])){count++;if(count===2)break;}}return full.slice(start,end).trim();
}
async function translatePdfSnippet(mode){
  const selected=selectedPdfText();if(!selected){toast('请先在 PDF 中拖动选择一段英文。',true);return;}pdfState.translationMode=mode;let text=selected;if(mode==='paragraph')text=paragraphAroundSelection(await extractPdfPageText(pdfState.page),selected);setPdfTranslationVisible(true);$('#pdf-translation-title').textContent=`第 ${pdfState.page} 页 · ${mode==='paragraph'?'段落翻译':'选中翻译'}`;$('#pdf-translation-text').textContent='正在翻译，请稍候…';$('#pdf-selection-menu').classList.add('hidden');
  try{const result=await api('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});$('#pdf-translation-text').textContent=result.translated_text||'没有生成译文。';}
  catch(err){$('#pdf-translation-text').textContent=`翻译失败：${err.message}`;toast(err.message,true);}
}
$('#pdf-translate-selection').addEventListener('click',()=>translatePdfSnippet('selection'));$('#pdf-translate-paragraph').addEventListener('click',()=>translatePdfSnippet('paragraph'));
$$('#pdf-selection-menu button').forEach(button=>button.addEventListener('click',()=>translatePdfSnippet(button.dataset.translateMode)));
$('#pdf-text-layer').addEventListener('pointerup',()=>setTimeout(()=>{const selection=window.getSelection(),text=selection?.toString().replace(/\s+/g,' ').trim();if(!text||!selection.anchorNode||!$('#pdf-text-layer').contains(selection.anchorNode))return;pdfState.selectedText=text;const rect=selection.getRangeAt(0).getBoundingClientRect(),body=$('.pdf-body').getBoundingClientRect(),menu=$('#pdf-selection-menu');menu.classList.remove('hidden');const width=menu.offsetWidth||150;menu.style.left=`${Math.max(8,Math.min(body.width-width-8,rect.left-body.left))}px`;menu.style.top=`${Math.max(8,rect.top-body.top-42)}px`;},0));
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#pdf-selection-menu')&&!event.target.closest('#pdf-text-layer'))$('#pdf-selection-menu').classList.add('hidden');});

async function loadAnnotations(paperId) {
  try { const result=await api(`/api/papers/${paperId}/annotations`); if(state.selectedId===paperId){pdfState.paperId=paperId;pdfState.annotations=result.annotations||[];drawAnnotations();} }
  catch(err){toast(`标注加载失败：${err.message}`,true);}
}
function currentPageAnnotations(page=pdfState.page){return pdfState.annotations.filter(item=>item.page===page);}
function drawAnnotations(draft=pdfState.drawing) {
  const canvas=$('#annotation-canvas'); if(!canvas.width)return; const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
  const items=[...currentPageAnnotations(),...(draft?[draft]:[])];
  for(const item of items){ctx.save();ctx.strokeStyle=item.color||'#e24a2a';ctx.fillStyle=item.color||'#f0b429';ctx.lineCap='round';ctx.lineJoin='round';if(item.type==='highlight'){ctx.globalAlpha=.28;ctx.fillRect(item.x*canvas.width,item.y*canvas.height,item.w*canvas.width,item.h*canvas.height);}else if(item.type==='pen'&&item.points?.length){ctx.globalAlpha=.9;ctx.lineWidth=Math.max(2,(item.width||.003)*Math.min(canvas.width,canvas.height));ctx.beginPath();item.points.forEach((point,index)=>{const x=point[0]*canvas.width,y=point[1]*canvas.height;index?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}ctx.restore();}
}
function pointerPosition(event){const rect=$('#annotation-canvas').getBoundingClientRect();return [Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))];}
function setPdfTool(tool){pdfState.tool=tool;$$('.pdf-tool').forEach(button=>button.classList.toggle('active',button.dataset.tool===tool));$('#annotation-canvas').classList.toggle('annotating',tool!=='cursor');}
$$('.pdf-tool').forEach(button=>button.addEventListener('click',()=>setPdfTool(button.dataset.tool)));
const annotationCanvas=$('#annotation-canvas');
annotationCanvas.addEventListener('pointerdown',event=>{if(pdfState.tool==='cursor')return;event.preventDefault();annotationCanvas.setPointerCapture(event.pointerId);const [x,y]=pointerPosition(event);if(pdfState.tool==='eraser'){eraseAnnotationAt(x,y);return;}const color=$('#annotation-color').value;if(pdfState.tool==='pen')pdfState.drawing={type:'pen',color,width:.003,points:[[x,y]]};else pdfState.drawing={type:'highlight',color,x,y,w:0,h:0,startX:x,startY:y};drawAnnotations();});
annotationCanvas.addEventListener('pointermove',event=>{if(!pdfState.drawing)return;const [x,y]=pointerPosition(event);if(pdfState.drawing.type==='pen')pdfState.drawing.points.push([x,y]);else{pdfState.drawing.x=Math.min(pdfState.drawing.startX,x);pdfState.drawing.y=Math.min(pdfState.drawing.startY,y);pdfState.drawing.w=Math.abs(x-pdfState.drawing.startX);pdfState.drawing.h=Math.abs(y-pdfState.drawing.startY);}drawAnnotations();});
annotationCanvas.addEventListener('pointerup',()=>{const item=pdfState.drawing;if(!item)return;delete item.startX;delete item.startY;pdfState.drawing=null;if((item.type==='pen'&&item.points.length>1)||(item.type==='highlight'&&item.w>.005&&item.h>.005)){pdfState.annotations.push({page:pdfState.page,...item});scheduleAnnotationSave();}drawAnnotations();});
function eraseAnnotationAt(x,y){const pageItems=currentPageAnnotations();let best=-1,bestDistance=.035;pageItems.forEach(item=>{let distance=1;if(item.type==='highlight'&&x>=item.x&&x<=item.x+item.w&&y>=item.y&&y<=item.y+item.h)distance=0;else if(item.type==='pen')for(const point of item.points||[])distance=Math.min(distance,Math.hypot(x-point[0],y-point[1]));if(distance<bestDistance){bestDistance=distance;best=pdfState.annotations.indexOf(item);}});if(best>=0){pdfState.annotations.splice(best,1);drawAnnotations();scheduleAnnotationSave();}}
function scheduleAnnotationSave(){clearTimeout(pdfState.saveTimer);const page=pdfState.page;pdfState.saveTimer=setTimeout(()=>saveAnnotations(page),450);}
async function saveAnnotations(page=pdfState.page){if(!pdfState.paperId)return;const items=currentPageAnnotations(page).map(({page:_,...item})=>item);try{const result=await api(`/api/papers/${pdfState.paperId}/annotations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page,annotations:items})});pdfState.annotations=result.annotations||[];toast('PDF 标注已保存。');}catch(err){toast(`标注保存失败：${err.message}`,true);}}
$('#annotation-undo').addEventListener('click',()=>{const items=currentPageAnnotations();const last=items.at(-1);if(last){pdfState.annotations.splice(pdfState.annotations.indexOf(last),1);drawAnnotations();scheduleAnnotationSave();}});

function applySplitRatio(){const body=$('.split-body'),ratio=Math.max(.35,Math.min(.75,Number(localStorage.getItem('paperweave-split-ratio'))||.65)),available=Math.max(600,body.clientWidth-6),left=Math.max(320,Math.min(available-280,available*ratio));body.style.gridTemplateColumns=`${left}px 6px ${available-left}px`;}
function applyTranslationRatio(){const ratio=Math.max(.25,Math.min(.65,Number(localStorage.getItem('paperweave-translation-ratio'))||.42));$('#pdf-translation').style.flex=`0 0 ${ratio*100}%`;}
function initReaderResizers(){
  $('#split-divider').addEventListener('pointerdown',event=>{event.preventDefault();const body=$('.split-body'),rect=body.getBoundingClientRect(),available=rect.width-6;document.body.classList.add('resizing-split');
    const move=moveEvent=>{const left=Math.max(320,Math.min(available-280,moveEvent.clientX-rect.left));body.style.gridTemplateColumns=`${left}px 6px ${available-left}px`;};
    const up=upEvent=>{move(upEvent);const left=$('#split-pdf-host').getBoundingClientRect().width,ratio=left/available;localStorage.setItem('paperweave-split-ratio',ratio);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.body.classList.remove('resizing-split');applySplitRatio();renderPdfPage();};document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);
  });
  $('#pdf-translation-resizer').addEventListener('pointerdown',event=>{event.preventDefault();const body=$('.pdf-body'),rect=body.getBoundingClientRect(),available=rect.width-6,startWidth=$('#pdf-translation').getBoundingClientRect().width,startX=event.clientX;document.body.classList.add('resizing-split');
    const move=moveEvent=>{const minTranslation=Math.min(180,available*.35),minPdf=Math.min(240,available*.52),width=Math.max(minTranslation,Math.min(available-minPdf,startWidth-(moveEvent.clientX-startX)));$('#pdf-translation').style.flex=`0 0 ${width}px`;};
    const up=upEvent=>{move(upEvent);const ratio=$('#pdf-translation').getBoundingClientRect().width/available;localStorage.setItem('paperweave-translation-ratio',ratio);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.body.classList.remove('resizing-split');applyTranslationRatio();renderPdfPage();};document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);
  });
}

function initResizableColumns() {
  const root=document.documentElement;
  const savedLibrary=localStorage.getItem('paperweave-library-width'); const savedGraph=localStorage.getItem('paperweave-graph-width');
  if(savedLibrary) root.style.setProperty('--library-width',`${savedLibrary}px`); if(savedGraph) root.style.setProperty('--graph-width',`${savedGraph}px`);
  const bind=(element,side)=>element.addEventListener('pointerdown',event=>{
    event.preventDefault(); const startX=event.clientX; const startWidth=side==='left'?$('.library-panel').getBoundingClientRect().width:$('.graph-panel').getBoundingClientRect().width;
    document.body.classList.add('resizing');
    const move=moveEvent=>{ const delta=moveEvent.clientX-startX; const available=Math.max(260,window.innerWidth-380); const width=Math.max(side==='left'?190:280,Math.min(side==='left'?500:760,available,side==='left'?startWidth+delta:startWidth-delta)); root.style.setProperty(side==='left'?'--library-width':'--graph-width',`${width}px`); };
    const up=()=>{ document.removeEventListener('pointermove',move); document.removeEventListener('pointerup',up); document.body.classList.remove('resizing'); const width=side==='left'?$('.library-panel').getBoundingClientRect().width:$('.graph-panel').getBoundingClientRect().width; localStorage.setItem(side==='left'?'paperweave-library-width':'paperweave-graph-width',Math.round(width)); renderGraph(); };
    document.addEventListener('pointermove',move); document.addEventListener('pointerup',up);
  });
  bind($('#left-resizer'),'left'); bind($('#right-resizer'),'right');
}

function renderGraph() {
  const svg=$('#graph-svg'), nodesEl=$('#nodes'), edgesEl=$('#edges'); nodesEl.innerHTML=''; edgesEl.innerHTML='';
  const width=$('#graph').clientWidth||600, height=$('#graph').clientHeight||600;
  const visible = state.papers.slice(0, 160); const ids=new Set(visible.map(p=>p.id)); const edges=state.edges.filter(e=>ids.has(e.source_id)&&ids.has(e.target_id));
  const degree={}; edges.forEach(e=>{degree[e.source_id]=(degree[e.source_id]||0)+1;degree[e.target_id]=(degree[e.target_id]||0)+1;});
  const nodes=visible.map((p,i)=>({...p,x:width/2+Math.cos(i*2.399)*Math.sqrt(i+1)*25,y:height/2+Math.sin(i*2.399)*Math.sqrt(i+1)*25,vx:0,vy:0,r:Math.min(13,5+Math.sqrt(degree[p.id]||1)*1.6)})); const map=new Map(nodes.map(n=>[n.id,n]));
  for(let tick=0;tick<110;tick++){ for(let i=0;i<nodes.length;i++){for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j],dx=b.x-a.x||.1,dy=b.y-a.y||.1,d2=dx*dx+dy*dy,force=Math.min(1.7,750/d2);a.vx-=dx*force/Math.sqrt(d2);a.vy-=dy*force/Math.sqrt(d2);b.vx+=dx*force/Math.sqrt(d2);b.vy+=dy*force/Math.sqrt(d2);}} edges.forEach(e=>{const a=map.get(e.source_id),b=map.get(e.target_id);if(!a||!b)return;const dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy)||1,f=(d-85)*.005;a.vx+=dx/d*f;a.vy+=dy/d*f;b.vx-=dx/d*f;b.vy-=dy/d*f;}); nodes.forEach(n=>{n.vx+=(width/2-n.x)*.0008;n.vy+=(height/2-n.y)*.0008;n.vx*=.82;n.vy*=.82;n.x+=n.vx;n.y+=n.vy;}); }
  edges.forEach(e=>{const a=map.get(e.source_id),b=map.get(e.target_id); const line=document.createElementNS('http://www.w3.org/2000/svg','line'); line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.dataset.source=e.source_id;line.dataset.target=e.target_id;edgesEl.appendChild(line);});
  nodes.forEach(n=>{const g=document.createElementNS('http://www.w3.org/2000/svg','g');g.classList.add('node');g.dataset.id=n.id;g.setAttribute('transform',`translate(${n.x},${n.y})`);const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('r',n.r);c.setAttribute('fill',n.is_seed?'#d95d39':'#315b4c');const t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('y',n.r+14);t.textContent=n.title.length>25?n.title.slice(0,24)+'…':n.title;g.append(c,t);g.addEventListener('click',ev=>{ev.stopPropagation();selectPaper(n.id);});g.addEventListener('pointerenter',ev=>showTip(ev,n));g.addEventListener('pointerleave',()=>$('#graph-tip').classList.add('hidden'));nodesEl.appendChild(g);});
  $('#edge-count').textContent=`${edges.length} 条关系`; bindGraphPanZoom(svg); highlightGraph();
}
function showTip(event,n){const tip=$('#graph-tip'),box=$('#graph').getBoundingClientRect();tip.innerHTML=`<b>${escapeHtml(n.title)}</b><br>${n.year||'年份未知'} · ${escapeHtml((n.authors||[]).slice(0,2).join(', '))}`;tip.style.left=`${Math.min(event.clientX-box.left+12,box.width-260)}px`;tip.style.top=`${event.clientY-box.top+12}px`;tip.classList.remove('hidden');}
function highlightGraph(){ $$('.node').forEach(n=>n.classList.toggle('selected',Number(n.dataset.id)===state.selectedId)); $$('#edges line').forEach(e=>e.classList.toggle('edge-highlight',Number(e.dataset.source)===state.selectedId||Number(e.dataset.target)===state.selectedId)); }
function applyTransform(){const t=state.transform;$('#viewport').setAttribute('transform',`translate(${t.x} ${t.y}) scale(${t.k})`);}
function bindGraphPanZoom(svg){if(svg.dataset.bound)return;svg.dataset.bound='1';let dragging=false,last={x:0,y:0};svg.addEventListener('pointerdown',e=>{dragging=true;last={x:e.clientX,y:e.clientY};svg.setPointerCapture(e.pointerId);});svg.addEventListener('pointermove',e=>{if(!dragging)return;state.transform.x+=e.clientX-last.x;state.transform.y+=e.clientY-last.y;last={x:e.clientX,y:e.clientY};applyTransform();});svg.addEventListener('pointerup',()=>dragging=false);svg.addEventListener('wheel',e=>{e.preventDefault();const factor=e.deltaY<0?1.1:.9;state.transform.k=Math.max(.25,Math.min(3,state.transform.k*factor));applyTransform();},{passive:false});}
$('#fit-graph').addEventListener('click',async()=>{state.transform={x:0,y:0,k:1};await refresh(state.selectedId);applyTransform();});
window.addEventListener('resize',()=>{renderGraph();if(!$('#split-workspace').classList.contains('hidden'))applySplitRatio();if(pdfState.document&&!$('#split-workspace').classList.contains('hidden'))renderPdfPage();});
initResizableColumns();
initReaderResizers();
const initialParams=new URLSearchParams(location.search); const initialPaper=Number(initialParams.get('paper'))||null;
refresh(initialPaper).then(()=>{const tab=initialParams.get('tab')||location.hash.slice(1);if(tab==='pdf'&&state.selectedPaper?.pdf_url)openSplitWorkspace();else if(tab&&$(`#tab-${tab}`))activateTab(tab);}).catch(err=>toast(err.message,true));
setInterval(pollGraphUpdates, 5000);
