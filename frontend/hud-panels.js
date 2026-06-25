/* ============================================================
   LLM WIKI — HUD Panels  (F1 / F2 / F3 / F4 / B / F5)
   ============================================================ */

const PANELS = {

  // ── F1: 個人日誌 ─────────────────────────────────────────────────────────
  async f1() {
    let notes = [], currentFile = null;
    const today = new Date().toISOString().slice(0,10);
    const defFile = `note-${today}.md`;

    renderSidebar([
      { id:'all',   icon:'📋', label:'所有筆記' },
      { id:'new',   icon:'✏️',  label:'新增筆記' },
      { id:'today', icon:'📅', label:'今日' },
    ], 'all', (id) => f1SelectCat(id));

    renderToolbar(`
      <input class="m-search" id="f1-fn" value="${defFile}" placeholder="筆記檔名 (note-YYYY-MM-DD.md)" style="max-width:280px"/>
      <button class="m-action-btn primary" style="flex:none;padding:7px 16px;font-size:11px" onclick="f1Save()">儲存 Ctrl+S</button>
      <button class="m-action-btn secondary" id="f1-del" onclick="f1Delete()" style="flex:none;padding:7px 14px;font-size:11px;display:none">🗑 刪除</button>
      <span style="font-size:10px;color:rgba(255,255,255,0.25);margin-left:6px" id="f1-saved"></span>
    `);

    async function loadNotes(renderGrid = true) {
      try {
        const d = await api('/api/notes');
        notes = d.notes || [];
        if (renderGrid) renderNoteGrid();
      } catch(e) { errGrid(e); }
    }

    function renderNoteGrid() {
      if (!notes.length) {
        renderGrid(`<div class="m-empty"><div class="m-empty-icon">📝</div><div>尚無筆記<br><span style="opacity:.4;font-size:10px">點上方「儲存」建立第一篇</span></div></div>`);
        return;
      }
      renderGrid(`<div class="m-item-grid">${notes.map(n => `
        <div class="m-item ${n.filename===currentFile?'active':''}" onclick="f1Open('${n.filename}')">
          <div class="m-item-icon">📄</div>
          <div class="m-item-name">${n.filename.replace('.md','')}</div>
          <div class="m-item-badge">${new Date(n.modified).toLocaleDateString('zh-TW',{month:'2-digit',day:'2-digit'})}</div>
        </div>`).join('')}</div>`);
    }

    window.f1Open = async (fn) => {
      currentFile = fn;
      $('f1-fn').value = fn;
      $('f1-del').style.display = '';
      try {
        const d = await api('/api/notes/' + fn);
        // 右側詳情欄顯示筆記 metadata
        renderDetail({
          icon:'📄', name:fn.replace('.md',''), tag:'Markdown 筆記',
          attrs:[
            { icon:'📅', text:'修改：' + new Date(notes.find(n=>n.filename===fn)?.modified||Date.now()).toLocaleString('zh-TW') },
            { icon:'💾', text:'Ctrl+S 快速儲存' },
          ],
          desc:'',
          actions:[{ label:'💾 儲存', cls:'primary', onclick:'f1Save()' }]
        });
        // 中間欄渲染編輯器（innerHTML 用 textContent 避免 XSS）
        const wrap = document.createElement('div');
        wrap.style.cssText = 'height:100%;display:flex;flex-direction:column;padding:14px;gap:8px';
        const ta = document.createElement('textarea');
        ta.id = 'f1-editor';
        ta.style.cssText = 'flex:1;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:16px;font-family:"JetBrains Mono",monospace;font-size:13px;color:#f0ead8;resize:none;outline:none;line-height:1.8';
        ta.value = d.content;
        ta.addEventListener('keydown', e => {
          if (e.ctrlKey && e.key === 's') { e.preventDefault(); f1Save(); }
        });
        wrap.appendChild(ta);
        const grid = $('m-grid-wrap');
        grid.innerHTML = '';
        grid.appendChild(wrap);
        ta.focus();
        // 更新 sidebar 的 active 狀態（不重繪整個 grid）
        document.querySelectorAll('.m-item').forEach(el => {
          el.classList.toggle('active', el.onclick?.toString().includes(`'${fn}'`));
        });
      } catch(e) { toast('讀取失敗：'+e.message); }
    };

    window.f1Save = async () => {
      const fn = $('f1-fn')?.value?.trim() || defFile;
      const editor = $('f1-editor');
      const content = editor ? editor.value : '';
      if (!fn.endsWith('.md')) { toast('檔名必須以 .md 結尾'); return; }
      try {
        await api('/api/notes/'+fn, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({content}) });
        currentFile = fn;
        $('f1-saved').textContent = '✓ ' + new Date().toLocaleTimeString('zh-TW');
        // 更新筆記清單但保留目前游標位置，不重繪編輯器
        const cursorStart = editor?.selectionStart;
        const cursorEnd   = editor?.selectionEnd;
        const d = await api('/api/notes');
        notes = d.notes || [];
        // 只更新 active 狀態，不整個重繪 grid（編輯器還在中間欄）
        document.querySelectorAll('.m-item').forEach(el => {
          const itemFn = el.querySelector('.m-item-name')?.textContent + '.md';
          el.classList.toggle('active', itemFn === fn);
        });
        // 還原游標
        if (editor && cursorStart != null) {
          editor.selectionStart = cursorStart;
          editor.selectionEnd   = cursorEnd;
        }
        // 更新刪除按鈕
        const delBtn = $('f1-del');
        if (delBtn) delBtn.style.display = '';
        toast('筆記已儲存：'+fn);
      } catch(e) { toast('儲存失敗：'+e.message); }
    };

    window.f1Delete = async () => {
      if (!currentFile || !confirm('確定刪除 '+currentFile+'?')) return;
      try {
        await api('/api/notes/'+currentFile, { method:'DELETE' });
        currentFile = null;
        $('f1-del').style.display = 'none';
        renderDetail({ icon:'📄', name:'選擇一個項目', tag:'—', attrs:[], desc:'' });
        // 刪除後回到列表
        await loadNotes();
        toast('已刪除');
      } catch(e) { toast('刪除失敗'); }
    };

    window.f1SelectCat = (id) => {
      if (id === 'new') {
        // 新增筆記：清空編輯器，設定今日檔名
        currentFile = null;
        $('f1-fn').value = defFile;
        $('f1-del') && ($('f1-del').style.display = 'none');
        renderDetail({
          icon:'✏️', name:'新增筆記', tag:'Markdown',
          attrs:[{ icon:'📝', text:'在左側輸入檔名後開始撰寫' }], desc:'',
          actions:[{ label:'儲存', cls:'primary', onclick:'f1Save()' }]
        });
        renderGrid(`<div style="height:100%;display:flex;flex-direction:column;padding:14px;gap:8px">
          <textarea id="f1-editor" style="flex:1;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:16px;font-family:'JetBrains Mono',monospace;font-size:13px;color:#f0ead8;resize:none;outline:none;line-height:1.8"
            onkeydown="if(event.ctrlKey&&event.key==='s'){event.preventDefault();f1Save();}"
            placeholder="# 新筆記標題\n\n開始撰寫…"></textarea>
        </div>`);
      } else if (id === 'today') {
        // 今日筆記：篩選今日
        const todayStr = new Date().toISOString().slice(0,10);
        const todayNotes = notes.filter(n => n.filename.includes(todayStr));
        if (!todayNotes.length) {
          renderGrid(`<div class="m-empty"><div class="m-empty-icon">📅</div><div>今日尚無筆記<br><span style="opacity:.4;font-size:10px">切換「新增筆記」建立</span></div></div>`);
          renderDetail({ icon:'📅', name:'今日筆記', tag:'—', attrs:[{ icon:'📝', text:'今日尚無筆記' }], desc:'' });
        } else {
          renderGrid(`<div class="m-item-grid">${todayNotes.map(n => `
            <div class="m-item" onclick="f1Open('${n.filename}')">
              <div class="m-item-icon">📄</div>
              <div class="m-item-name">${n.filename.replace('.md','')}</div>
              <div class="m-item-badge">${new Date(n.modified).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</div>
            </div>`).join('')}</div>`);
          renderDetail({ icon:'📅', name:'今日筆記', tag:todayNotes.length+' 筆', attrs:[{ icon:'📊', text:`共 ${todayNotes.length} 篇` }], desc:'' });
        }
      } else {
        // 全部筆記
        renderNoteGrid();
        renderDetail({ icon:'📋', name:'所有筆記', tag:notes.length+' 筆', attrs:[{ icon:'📊', text:`共 ${notes.length} 篇` }], desc:'' });
      }
    };

    await loadNotes();
  },

  // ── F2: 協作大廳 ──────────────────────────────────────────────────────
  async f2() {
    renderSidebar([
      { id:'commits', icon:'🔗', label:'Commit 紀錄', divider:true },
      { id:'status',  icon:'📊', label:'工作狀態' },
    ], 'commits', (id) => f2SelectCat(id));
    renderGrid(`<div class="m-empty"><div class="spin"></div></div>`);
    renderToolbar(`<span style="font-size:11px;color:rgba(255,255,255,0.35)">載入 Git 記錄…</span>`);

    try {
      const [log, status] = await Promise.all([
        api('/api/git/commits?limit=50'),
        api('/api/git/status'),
      ]);
      const commits = log.commits || [];
      const badge = $('f2-badge');
      if (badge && status.ahead > 0) { badge.textContent = status.ahead; badge.style.display = 'flex'; }

      renderToolbar(`
        <span style="font-size:11px;color:rgba(255,255,255,0.4)">分支：</span>
        <span style="font-size:13px;color:var(--accent);font-weight:700">${status.branch || 'unknown'}</span>
        ${status.ahead  ? `<span style="font-size:10px;color:#4ade80;margin-left:8px">↑ ${status.ahead} 超前</span>` : ''}
        ${status.behind ? `<span style="font-size:10px;color:#f87171;margin-left:8px">↓ ${status.behind} 落後</span>` : ''}
        ${(status.modified||[]).length ? `<span style="font-size:10px;color:var(--accent);margin-left:8px">${status.modified.length} 已修改</span>` : ''}
        <button class="m-action-btn secondary" style="margin-left:auto;flex:none;padding:6px 14px;font-size:11px" onclick="PANELS.f2()">重新整理</button>
      `);

      if (!commits.length) {
        renderGrid(`<div class="m-empty"><div class="m-empty-icon">📭</div><div>尚無 Commit 記錄</div></div>`);
        return;
      }

      renderGrid(`<div style="display:flex;flex-direction:column;gap:4px;padding:4px 0">
        ${commits.map((c,i) => `
          <div class="m-item" style="aspect-ratio:unset;flex-direction:row;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;height:auto" onclick="f2Show(${i})">
            <div style="width:8px;height:8px;border-radius:50%;background:#4fc3f7;flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;color:#f0ead8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.message}</div>
              <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:2px">${c.author} · ${new Date(c.date).toLocaleString('zh-TW')}</div>
            </div>
            <code style="font-size:10px;color:#4fc3f7;flex-shrink:0">${c.hash}</code>
          </div>`).join('')}
      </div>`);

      const allCommits = commits;
      window.f2Show = (i) => {
        const c = allCommits[i];
        renderDetail({
          icon:'🔗', name:c.hash, tag:'Git Commit',
          attrs:[
            { icon:'👤', text: c.author },
            { icon:'📅', text: new Date(c.date).toLocaleString('zh-TW') },
            { icon:'📝', text: c.message },
            { icon:'📧', text: c.email },
          ],
          desc:'', actions:[]
        });
      };
    } catch(e) { errGrid(e); renderToolbar(''); }

    window.f2SelectCat = (id) => {
      if (id === 'status') {
        api('/api/git/status').then(status => {
          const modified  = status.modified  || [];
          const staged    = status.staged    || [];
          const untracked = status.untracked || [];
          renderGrid(`<div style="display:flex;flex-direction:column;gap:8px;padding:4px 0">
            <div style="font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:.1em;text-transform:uppercase;padding:4px 0">已修改 (${modified.length})</div>
            ${modified.map(f=>`<div class="m-item" style="aspect-ratio:unset;flex-direction:row;padding:10px 14px;height:auto;gap:10px;border-radius:6px">
              <span style="font-size:14px">✏️</span>
              <span style="font-size:11px;color:#f0ead8">${f}</span>
            </div>`).join('')}
            ${staged.length ? `<div style="font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:.1em;text-transform:uppercase;padding:8px 0 4px">已暫存 (${staged.length})</div>
            ${staged.map(f=>`<div class="m-item" style="aspect-ratio:unset;flex-direction:row;padding:10px 14px;height:auto;gap:10px;border-radius:6px">
              <span style="font-size:14px">✅</span>
              <span style="font-size:11px;color:#4ade80">${f}</span>
            </div>`).join('')}` : ''}
            ${untracked.length ? `<div style="font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:.1em;text-transform:uppercase;padding:8px 0 4px">未追蹤 (${untracked.length})</div>
            ${untracked.map(f=>`<div class="m-item" style="aspect-ratio:unset;flex-direction:row;padding:10px 14px;height:auto;gap:10px;border-radius:6px">
              <span style="font-size:14px">❓</span>
              <span style="font-size:11px;color:rgba(255,255,255,0.45)">${f}</span>
            </div>`).join('')}` : ''}
            ${!modified.length && !staged.length && !untracked.length
              ? '<div class="m-empty" style="padding:40px 0"><div class="m-empty-icon">✨</div><div>工作目錄乾淨</div></div>'
              : ''}
          </div>`);
          renderDetail({
            icon:'📊', name:'工作目錄狀態', tag:status.branch||'unknown',
            attrs:[
              { icon:'🌿', text:'分支：'+(status.branch||'unknown') },
              { icon:'↑',  text:'超前 '+status.ahead+' 個 commit' },
              { icon:'↓',  text:'落後 '+status.behind+' 個 commit' },
              { icon:'✏️', text:`修改 ${modified.length} · 暫存 ${staged.length} · 未追蹤 ${untracked.length}` },
            ],
            desc:'', actions:[]
          });
        }).catch(e => errGrid(e));
      } else {
        // commits 分類 — 重新載入 git log
        PANELS.f2();
      }
    };
  },

  // ── F3: 測試套件（測試面板，全寬 iframe） ─────────────────────────────────
  async f3() {
    // openModal 已處理 fullwidth 模式和 iframe 注入，此處無需額外操作
  },

  // ── F4: 目標專案時程 ──────────────────────────────────────────────────
  async f4() {
    let msData = [];

    // 先定義 window 函數，再呼叫 renderSidebar
    window._f4RenderMs = (filter) => {
      const list = filter==='all' ? msData
        : msData.filter(m => filter==='done' ? m.completion===100 : m.completion<100);
      if (!msData.length) {
        renderGrid(`<div class="m-empty"><div class="spin"></div></div>`);
        return;
      }
      if (!list.length) {
        renderGrid(`<div class="m-empty"><div class="m-empty-icon">🏆</div><div>此分類無里程碑</div></div>`);
        return;
      }
      renderGrid(`<div class="m-item-grid">${list.map(m => {
        const pct = m.completion;
        const idx = msData.indexOf(m);
        return `<div class="m-item" onclick="window._f4Show(${idx})"
                     style="padding:12px 10px;aspect-ratio:unset;height:auto;gap:6px">
          <div style="font-size:24px">${pct===100?'🏆':pct>=60?'⚡':'📌'}</div>
          <div class="m-item-name" style="font-size:11px;font-weight:700;color:#f0ead8">${m.title}</div>
          <div style="width:100%;height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:linear-gradient(to right,var(--accent),var(--accent2));border-radius:2px"></div>
          </div>
          <div style="font-size:10px;color:${pct===100?'#4ade80':'var(--accent)'}">${pct}% · ${m.doneTasks}/${m.totalTasks}</div>
        </div>`;
      }).join('')}</div>`);
    };

    window._f4Show = (i) => {
      const m = msData[i]; if (!m) return;
      renderDetail({
        icon: m.completion===100?'🏆':m.completion>=60?'⚡':'📌',
        name: m.title, tag: m.status,
        attrs:[
          { icon:'📊', text:`完成度：${m.completion}%（${m.doneTasks}/${m.totalTasks} 任務）` },
          { icon:'📅', text: m.due ? '截止：'+m.due : '無截止日期' },
          { icon:'🏷', text: (m.tags||[]).join('、') || '無標籤' },
        ],
        desc:'', actions:[]
      });
    };

    renderSidebar([
      { id:'all',  icon:'🏆', label:'里程碑' },
      { id:'wip',  icon:'⚙️',  label:'進行中' },
      { id:'done', icon:'✅', label:'已完成' },
    ], 'all', (id) => window._f4RenderMs(id));

    renderGrid(`<div class="m-empty"><div class="spin"></div></div>`);
    renderToolbar(`<span style="font-size:11px;color:rgba(255,255,255,0.35)">載入里程碑…</span>`);

    try {
      const data = await api('/api/milestones');
      msData = data.milestones || [];
      renderToolbar(`<span style="font-size:11px;color:rgba(255,255,255,0.35)">${msData.length} 個里程碑</span>`);
      window._f4RenderMs('all');
      if (msData.length) window._f4Show(0);
    } catch(e) { errGrid(e); }
  },

  // ── B: 模組背包 ──────────────────────────────────────────────────────────
  async b() {
    const TC = { STR:'#3A7FD5',INT:'#00C97A',FLOAT:'#F5A623',FLT:'#F5A623',BOOL:'#FF8C42',ARR:'#A97FE8',OBJ:'#FF4D6A',ANY:'#8A9DC0',NUM:'#4ECDC4' };
    const SC  = { DONE:'#4ade80', WIP:'var(--accent)', BLOCKED:'#f87171' };
    let modules = [], slotA = null, slotB = null;
    let currentFilter = 'all';

    // ── helpers ──────────────────────────────────────────────────────────
    function compat(a,b) {
      if (!a||!b) return null;
      const o = a.output?.type||'', i = b.input?.type||'';
      return o===i || o==='ANY' || i==='ANY' || (i==='NUM' && (o==='INT'||o==='FLOAT'));
    }

    function updateSlotBar() {
      const sa=$('b-sa'), sb=$('b-sb'), msg=$('b-msg');
      if (sa)  { sa.textContent  = slotA ? `槽A: ${slotA.name}` : '槽A: —'; sa.style.color  = slotA ? 'var(--accent)' : 'rgba(255,255,255,0.3)'; }
      if (sb)  { sb.textContent  = slotB ? `槽B: ${slotB.name}` : '槽B: —'; sb.style.color  = slotB ? 'var(--accent)' : 'rgba(255,255,255,0.3)'; }
      if (msg) {
        if (slotA && slotB) { const c=compat(slotA,slotB); msg.textContent=c?'✓ 相容':'✗ 不符'; msg.style.color=c?'#4ade80':'#f87171'; }
        else msg.textContent = '';
      }
    }

    function doRenderMods(filter) {
      currentFilter = filter;
      const list = filter==='all' ? modules : modules.filter(m => m.status===filter);

      renderToolbar(`
        <input class="m-search" id="b-q" placeholder="搜尋模組名稱 / 標籤…"
               oninput="window._bFilter()" style="max-width:200px"/>
        <span style="font-size:10px;color:rgba(255,255,255,0.35)">${list.length} 個模組</span>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span id="b-sa" style="font-size:10px;padding:4px 10px;border-radius:4px;
                border:1px dashed rgba(232,200,115,0.3);color:rgba(255,255,255,0.3)">槽A: —</span>
          <span style="color:rgba(255,255,255,0.3);font-size:12px">→</span>
          <span id="b-sb" style="font-size:10px;padding:4px 10px;border-radius:4px;
                border:1px dashed rgba(232,200,115,0.3);color:rgba(255,255,255,0.3)">槽B: —</span>
          <span id="b-msg" style="font-size:11px;font-weight:700"></span>
          <button class="m-action-btn secondary"
                  style="flex:none;padding:4px 10px;font-size:10px"
                  onclick="window._bClear()">清除</button>
        </div>
      `);

      if (!modules.length) {
        renderGrid('<div class="m-empty"><div class="spin"></div></div>');
        return;
      }
      if (!list.length) {
        renderGrid(`<div class="m-empty"><div class="m-empty-icon">🔍</div><div>此分類無模組</div></div>`);
        return;
      }

      renderGrid(`<div class="m-item-grid" id="b-grid">${list.map(m => {
        const ti=TC[m.input?.type]||'#aaa', to=TC[m.output?.type]||'#aaa', sc=SC[m.status]||'#aaa';
        const isActive = slotA?.id===m.id || slotB?.id===m.id;
        return `<div class="m-item ${isActive?'active':''}" onclick="window._bSel(${m.id})"
                     style="padding:8px 6px;gap:3px">
          <div style="display:flex;justify-content:space-between;width:100%;
                      font-size:9px;font-family:'JetBrains Mono',monospace">
            <span style="color:${ti}">${m.input?.type||'?'}</span>
            <span style="color:${to}">${m.output?.type||'?'}</span>
          </div>
          <div class="m-item-name" style="font-size:11px;font-weight:700;color:#f0ead8">${m.name}</div>
          <div style="display:flex;justify-content:space-between;width:100%;font-size:9px">
            <span style="color:rgba(255,255,255,0.3)">${String(m.id).padStart(2,'0')}</span>
            <span style="color:${sc}">${m.status==='DONE'?'✓':m.status==='BLOCKED'?'✗':'…'}</span>
          </div>
        </div>`;
      }).join('')}</div>`);

      updateSlotBar();
    }

    // ── window globals（必須在 renderSidebar 之前定義）──────────────────
    window._bRenderMods = (filter) => doRenderMods(filter);

    window._bFilter = () => {
      const q = $('b-q')?.value?.toLowerCase() || '';
      const list = currentFilter==='all' ? modules : modules.filter(m=>m.status===currentFilter);
      document.querySelectorAll('#b-grid .m-item').forEach((el,i) => {
        const m = list[i]; if (!m) return;
        el.style.display = (!q
          || m.name.toLowerCase().includes(q)
          || (m.tags||[]).some(t => t.toLowerCase().includes(q))) ? '' : 'none';
      });
    };

    window._bSel = (id) => {
      const m = modules.find(x => x.id===id); if (!m) return;
      if (!slotA)      slotA = m;
      else if (!slotB) slotB = m;
      else             { slotA = m; slotB = null; }
      updateSlotBar();
      renderDetail({
        icon: '🧩', name: m.name+'()', tag: m.status,
        attrs: [
          { icon:'📥', text:`INPUT：${m.input?.type||'?'}` },
          { icon:'📤', text:`OUTPUT：${m.output?.type||'?'}` },
          { icon:'⚡', text:`延遲：${m.latency||'—'}` },
          { icon:'🏷', text: (m.tags||[]).join('、') || '無標籤' },
        ],
        desc: m.description || '',
        actions: [
          { label:'裝入槽 A', cls:'secondary', onclick:`window._bSlot(${m.id},'A')` },
          { label:'裝入槽 B', cls:'primary',   onclick:`window._bSlot(${m.id},'B')` },
        ]
      });
    };

    window._bSlot = (id, slot) => {
      const m = modules.find(x => x.id===id); if (!m) return;
      if (slot==='A') slotA=m; else slotB=m;
      updateSlotBar();
    };

    window._bClear = () => { slotA=null; slotB=null; updateSlotBar(); };

    // ── 渲染側欄（此時 window._bRenderMods 已定義）────────────────────
    renderSidebar([
      { id:'all',     icon:'🧪', label:'全部' },
      { id:'DONE',    icon:'✅', label:'DONE' },
      { id:'WIP',     icon:'⚙️',  label:'WIP' },
      { id:'BLOCKED', icon:'🚫', label:'BLOCKED' },
    ], 'all', (id) => window._bRenderMods(id));

    // 先顯示 loading
    renderGrid('<div class="m-empty"><div class="spin"></div></div>');
    renderToolbar('<span style="font-size:11px;color:rgba(255,255,255,0.35)">載入模組清單…</span>');

    // ── 載入資料 ──────────────────────────────────────────────────────
    try {
      const d = await api('/api/modules');
      modules = d.modules || [];
      doRenderMods('all');
    } catch(e) {
      errGrid(e);
    }
  },

  // ── F5: 知識圖鑑 ─────────────────────────────────────────────────────────
  async f5() {
    renderSidebar([
      { id:'search', icon:'🔍', label:'搜尋' },
      { id:'all',    icon:'📚', label:'全部文件' },
    ], 'search', (id) => window._f5SelectCat(id));

    renderToolbar(`
      <input class="m-search" id="f5-q" placeholder="搜尋知識庫文件…" oninput="f5Do()" style="max-width:320px"/>
      <span style="font-size:10px;color:rgba(255,255,255,0.35)" id="f5-cnt"></span>
      <span style="font-size:10px;padding:3px 10px;border-radius:12px;background:rgba(148,163,184,0.1);border:1px solid rgba(148,163,184,0.25);color:rgba(148,163,184,0.7);margin-left:auto;">🔒 唯讀 — 手動放置檔案至 docs/</span>
    `);
    renderGrid(`<div class="m-empty"><div style="font-size:12px;color:rgba(255,255,255,0.2)">輸入關鍵字開始搜尋</div></div>`);

    window._f5SelectCat = (id) => {
      if (id === 'all') {
        $('f5-q').value = '';
        $('f5-cnt').textContent = '';
        api('/api/docs/tree').then(data => {
          let allDocs = [];
          function flat(nodes) { nodes.forEach(n => { if(n.type==='file') allDocs.push(n); else if(n.children) flat(n.children); }); }
          flat(data.tree || []);
          $('f5-cnt').textContent = allDocs.length + ' 筆';
          renderGrid(`<div style="display:flex;flex-direction:column;gap:4px">${allDocs.map((d,i)=>`
            <div class="m-item" onclick="f5Open(${i},'all')" style="aspect-ratio:unset;flex-direction:row;align-items:center;gap:12px;padding:12px 16px;height:auto;border-radius:8px">
              <span style="font-size:20px">📄</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;color:#f0ead8">${d.name.replace('.md','')}</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.3)">${d.path}</div>
              </div>
            </div>`).join('')}</div>`);
          const docs = allDocs;
          window.f5Open = async (i, _src) => {
            const r = docs[i];
            renderDetail({ icon:'📄', name:r.name.replace('.md',''), tag:r.path.split('/').pop(), attrs:[{ icon:'📂', text:r.path }], desc:'' });
            try {
              const doc = await api('/api/docs/file?path='+encodeURIComponent(r.path));
              $('m-detail-body').innerHTML += `<div style="margin-top:10px;padding:10px;background:rgba(0,0,0,0.3);border-radius:6px;max-height:200px;overflow-y:auto"><pre style="font-size:10px;color:rgba(240,234,216,0.6);white-space:pre-wrap;word-break:break-all;line-height:1.55">${doc.content.replace(/</g,'&lt;').slice(0,600)}</pre></div>`;
            } catch {}
          };
        }).catch(e => errGrid(e));
      } else {
        // 搜尋分類 — 清空並 focus
        renderGrid(`<div class="m-empty"><div style="font-size:12px;color:rgba(255,255,255,0.2)">輸入關鍵字開始搜尋</div></div>`);
        setTimeout(() => $('f5-q')?.focus(), 50);
      }
    };

    window.f5Do = async () => {
      const q = $('f5-q')?.value?.trim();
      if (!q) { renderGrid(`<div class="m-empty"><div style="font-size:12px;color:rgba(255,255,255,0.2)">輸入關鍵字開始搜尋</div></div>`); return; }
      renderGrid(`<div class="m-empty"><div class="spin"></div></div>`);
      try {
        const d = await api('/api/docs/search?q='+encodeURIComponent(q));
        $('f5-cnt').textContent = d.count+' 筆';
        if (!d.results.length) { renderGrid(`<div class="m-empty"><div class="m-empty-icon">🔍</div><div>找不到符合文件</div></div>`); return; }
        const results = d.results;
        renderGrid(`<div style="display:flex;flex-direction:column;gap:4px">${results.map((r,i)=>`
          <div class="m-item" onclick="f5Open(${i})" style="aspect-ratio:unset;flex-direction:row;align-items:flex-start;gap:12px;padding:14px 16px;height:auto;border-radius:8px">
            <span style="font-size:22px;flex-shrink:0">📄</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:#f0ead8">${r.title}</div>
              <div style="font-size:10px;color:rgba(255,255,255,0.3);margin:2px 0">${r.path}</div>
              <div style="font-size:11px;color:rgba(240,234,216,0.5)">${r.excerpt}</div>
              <div style="margin-top:5px">${r.tags.map(t=>`<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(232,200,115,0.1);color:var(--accent);border:1px solid rgba(232,200,115,0.2);margin-right:4px">${t}</span>`).join('')}</div>
            </div>
          </div>`).join('')}</div>`);

        window.f5Open = async (i) => {
          const r = results[i];
          renderDetail({ icon:'📄', name:r.title, tag:r.path.split('/').pop(), attrs:[{ icon:'📂', text:r.path }], desc:r.excerpt });
          try {
            const doc = await api('/api/docs/file?path='+encodeURIComponent(r.path));
            $('m-detail-body').innerHTML += `<div style="margin-top:10px;padding:10px;background:rgba(0,0,0,0.3);border-radius:6px;max-height:200px;overflow-y:auto"><pre style="font-size:10px;color:rgba(240,234,216,0.6);white-space:pre-wrap;word-break:break-all;line-height:1.55">${doc.content.replace(/</g,'&lt;').slice(0,600)}</pre></div>`;
          } catch {}
        };
      } catch(e) { errGrid(e); }
    };
  },

  // ── M: 知識雷達（wiki/ 目錄 + AI 整理助手）───────────────────────────────
};