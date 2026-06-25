/* ============================================================
   LLM WIKI — Panel M  知識雷達 + AI 整理助手
   讀取 wiki/，透過後端 /api/wiki/generate 呼叫本地或雲端 AI
   ============================================================ */

// 注入到 PANELS（在 hud-panels.js 定義的 PANELS 物件上擴充）
PANELS.m = async function m() {
    // ── 狀態 ──
    let wikiDocs   = [];      // wiki/ 所有文件
    let wikiTree   = [];      // wiki/ 目錄樹
    let aiHistory  = [];      // AI 對話歷史
    let pendingFiles = [];    // AI 準備寫入的文件清單
    let activeDomain = '__all__';

    // ── 樣式注入（只注入一次）──
    if (!document.getElementById('wiki-ai-style')) {
      const s = document.createElement('style');
      s.id = 'wiki-ai-style';
      s.textContent = `
        .wiki-ai-panel {
          display: flex; flex-direction: column; height: 100%; overflow: hidden;
        }
        .wiki-ai-header {
          padding: 12px 16px 8px;
          border-bottom: 1px solid rgba(78,205,196,0.15);
          flex-shrink: 0;
        }
        .wiki-ai-title {
          font-size: 11px; font-weight: 700; color: #4ECDC4;
          letter-spacing: .1em; text-transform: uppercase; margin-bottom: 4px;
        }
        .wiki-ai-hint { font-size: 10px; color: rgba(255,255,255,0.3); line-height: 1.5; }
        .wiki-ai-chat {
          flex: 1; overflow-y: auto; padding: 12px 14px; display: flex;
          flex-direction: column; gap: 10px;
        }
        .wiki-ai-msg {
          max-width: 96%; padding: 9px 12px; border-radius: 8px;
          font-size: 11px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
        }
        .wiki-ai-msg.user {
          align-self: flex-end;
          background: rgba(78,205,196,0.12); border: 1px solid rgba(78,205,196,0.3);
          color: #e0ecff;
        }
        .wiki-ai-msg.ai {
          align-self: flex-start;
          background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08);
          color: rgba(240,234,216,0.85);
        }
        .wiki-ai-msg.ai.question { border-color: rgba(245,166,35,0.35); }
        .wiki-ai-msg.ai.files   { border-color: rgba(0,201,122,0.35); }
        .wiki-ai-msg.system {
          align-self: center; font-size: 10px; color: rgba(255,255,255,0.25);
          background: none; border: none; padding: 2px 0;
        }
        .wiki-ai-file-list {
          margin-top: 8px; display: flex; flex-direction: column; gap: 5px;
        }
        .wiki-ai-file-item {
          background: rgba(0,201,122,0.06); border: 1px solid rgba(0,201,122,0.2);
          border-radius: 5px; padding: 6px 10px; font-size: 10px;
          color: #4ade80; font-family: 'JetBrains Mono', monospace;
        }
        .wiki-ai-actions {
          display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap;
        }
        .wiki-ai-btn {
          font-family: 'JetBrains Mono', monospace; font-size: 10px;
          padding: 5px 12px; border-radius: 5px; cursor: pointer;
          border: 1px solid; transition: background .12s; letter-spacing: .04em;
        }
        .wiki-ai-btn.confirm {
          color: #4ade80; border-color: rgba(74,222,128,0.4);
          background: rgba(74,222,128,0.08);
        }
        .wiki-ai-btn.confirm:hover { background: rgba(74,222,128,0.18); }
        .wiki-ai-btn.cancel {
          color: rgba(255,255,255,0.4); border-color: rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
        }
        .wiki-ai-btn.cancel:hover { background: rgba(255,255,255,0.08); }
        .wiki-ai-input-row {
          display: flex; gap: 8px; padding: 10px 14px 12px;
          border-top: 1px solid rgba(78,205,196,0.12); flex-shrink: 0;
        }
        .wiki-ai-input {
          flex: 1; background: rgba(0,0,0,0.4);
          border: 1px solid rgba(78,205,196,0.25); border-radius: 8px;
          padding: 8px 12px; font-family: 'JetBrains Mono', monospace;
          font-size: 11px; color: #f0ead8; outline: none; resize: none;
          min-height: 36px; max-height: 100px; line-height: 1.5;
          transition: border-color .12s;
        }
        .wiki-ai-input:focus { border-color: rgba(78,205,196,0.55); }
        .wiki-ai-input::placeholder { color: rgba(255,255,255,0.2); }
        .wiki-ai-send {
          width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
          background: rgba(78,205,196,0.15); border: 1px solid rgba(78,205,196,0.35);
          color: #4ECDC4; font-size: 16px; cursor: pointer; display: flex;
          align-items: center; justify-content: center; transition: background .12s;
          align-self: flex-end;
        }
        .wiki-ai-send:hover { background: rgba(78,205,196,0.28); }
        .wiki-ai-send:disabled { opacity: .35; cursor: not-allowed; }
        .wiki-doc-item {
          display: flex; align-items: center; gap: 10px; padding: 9px 14px;
          cursor: pointer; border-radius: 6px; margin-bottom: 2px;
          transition: background .12s;
        }
        .wiki-doc-item:hover { background: rgba(78,205,196,0.06); }
        .wiki-doc-item.active { background: rgba(78,205,196,0.1); border-left: 2px solid #4ECDC4; padding-left: 12px; }
        .wiki-doc-icon { font-size: 16px; flex-shrink: 0; }
        .wiki-doc-info { flex: 1; min-width: 0; }
        .wiki-doc-name { font-size: 12px; color: #f0ead8; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wiki-doc-path { font-size: 10px; color: rgba(255,255,255,0.3); margin-top: 1px; }
        .wiki-empty-ai {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 100%; gap: 10px; padding: 24px;
        }
        .wiki-empty-ai-icon { font-size: 36px; opacity: .4; }
        .wiki-empty-ai-text { font-size: 11px; color: rgba(255,255,255,0.25); text-align: center; line-height: 1.7; }
      `;
      document.head.appendChild(s);
    }

    // ── 載入 wiki/ 目錄樹 ──
    async function loadWikiTree() {
      try {
        const data = await api('/api/wiki/tree');
        wikiTree = data.tree || [];
        wikiDocs = [];
        function flatten(nodes) { nodes.forEach(n => { if(n.type==='file') wikiDocs.push(n); else if(n.children) flatten(n.children); }); }
        flatten(wikiTree);
      } catch { wikiTree = []; wikiDocs = []; }
    }

    // ── 左側 sidebar 渲染 ──
    function rebuildSidebar() {
      const domains = wikiTree.filter(n => n.type === 'dir');
      renderSidebar([
        { id: '__all__',  icon: '🌐', label: '全部' },
        { id: '__ai__',   icon: '🤖', label: 'AI 整理', divider: domains.length > 0 },
        ...domains.map(d => ({ id: d.name, icon: '📂', label: d.name })),
      ], activeDomain, (id) => {
        activeDomain = id;
        if (id === '__ai__') showAIPanel();
        else showDocsPanel(id);
      });
    }

    // ── Toolbar 渲染 ──
    function setToolbar(domId) {
      if (domId === '__ai__') {
        renderToolbar(`
          <span style="font-size:11px;color:#4ECDC4;font-weight:700">🤖 AI 知識整理助手</span>
          <button class="wiki-ai-btn cancel" style="margin-left:auto;padding:4px 10px"
            onclick="mClearHistory()">清除對話</button>
        `);
        window.mClearHistory = () => {
          aiHistory = []; pendingFiles = [];
          showAIPanel();
        };
      } else {
        const cnt = domId === '__all__' ? wikiDocs.length
          : wikiDocs.filter(d => d.path.startsWith(domId + '/')).length;
        renderToolbar(`
          <span style="font-size:11px;color:rgba(255,255,255,0.35)">wiki/ — ${cnt} 個文件</span>
          <button class="wiki-ai-btn cancel" style="margin-left:auto;padding:4px 10px"
            onclick="window._catCb('__ai__');window._setSbActive('__ai__');activeDomain='__ai__';showAIPanel()">
            ＋ AI 整理
          </button>
        `);
      }
    }

    // ── 文件列表面板 ──
    function showDocsPanel(domId) {
      setToolbar(domId);
      const docs = domId === '__all__' ? wikiDocs
        : wikiDocs.filter(d => d.path.startsWith(domId + '/'));

      if (!docs.length) {
        renderGrid(`<div class="wiki-empty-ai">
          <div class="wiki-empty-ai-icon">📁</div>
          <div class="wiki-empty-ai-text">wiki/ 目錄尚無文件<br>
          點左側「🤖 AI 整理」讓 AI 從 docs/ 整理知識</div>
        </div>`);
        $('m-detail-actions').style.display = 'none';
        return;
      }

      renderGrid(`<div style="padding:8px 4px">${docs.map((d,i) => `
        <div class="wiki-doc-item" id="wdi-${i}" onclick="mWikiOpen(${i})">
          <span class="wiki-doc-icon">📄</span>
          <div class="wiki-doc-info">
            <div class="wiki-doc-name">${d.name.replace('.md','')}</div>
            <div class="wiki-doc-path">${d.path}</div>
          </div>
        </div>`).join('')}</div>`);

      window.mWikiOpen = async (i) => {
        document.querySelectorAll('.wiki-doc-item').forEach((el,n) =>
          el.classList.toggle('active', n === i));
        const doc = docs[i];
        renderDetail({
          icon: '📄', name: doc.name.replace('.md',''), tag: 'wiki',
          attrs: [{ icon: '📂', text: doc.path }], desc: '',
          actions: [{ label: '🗑 刪除', cls: 'secondary', onclick: `mWikiDelete('${doc.path}')` }]
        });
        try {
          const d = await api('/api/wiki/file?path=' + encodeURIComponent(doc.path));
          $('m-detail-body').innerHTML = `
            <div class="m-detail-desc" style="color:rgba(240,234,216,0.7)">
              ${(d.frontmatter?.description || d.content.slice(0,120)).replace(/</g,'&lt;')}
            </div>
            <div style="margin-top:8px;padding:10px;background:rgba(0,0,0,0.3);border-radius:6px;max-height:240px;overflow-y:auto">
              <pre style="font-size:10px;color:rgba(240,234,216,0.55);white-space:pre-wrap;word-break:break-all;line-height:1.55">
${d.content.replace(/</g,'&lt;').slice(0,1000)}</pre>
            </div>`;
        } catch {}
      };

      window.mWikiDelete = async (p) => {
        if (!confirm('確定刪除 wiki/' + p + ' ？')) return;
        try {
          await api('/api/wiki/file?path=' + encodeURIComponent(p), { method: 'DELETE' });
          toast('已刪除：' + p);
          await loadWikiTree();
          rebuildSidebar();
          showDocsPanel(activeDomain);
        } catch(e) { toast('刪除失敗：' + e.message); }
      };
    }

    // ── AI 對話面板 ──
    function showAIPanel() {
      setToolbar('__ai__');

      const chatHTML = aiHistory.length === 0
        ? `<div class="wiki-empty-ai">
            <div class="wiki-empty-ai-icon">🤖</div>
            <div class="wiki-empty-ai-text">
              輸入指令，讓 AI 讀取 docs/ 的來源文件<br>整理並寫入 wiki/ 目錄
              <br><br>
              <span style="opacity:.6">範例：整理 docs/ 裡所有關於 TypeScript 的文件</span>
            </div>
          </div>`
        : aiHistory.map(h => {
            if (h._type === 'files') {
              return `<div class="wiki-ai-msg ai files">
                ✅ ${h._summary || '已整理完成'}
                <div class="wiki-ai-file-list">
                  ${(h._files||[]).map(f => `<div class="wiki-ai-file-item">📄 wiki/${f.path}</div>`).join('')}
                </div>
              </div>`;
            }
            return `<div class="wiki-ai-msg ${h.role === 'user' ? 'user' : 'ai' + (h._isQ ? ' question' : '')}">
              ${h.content.replace(/</g,'&lt;')}
            </div>`;
          }).join('');

      const pendingHTML = pendingFiles.length ? `
        <div class="wiki-ai-msg ai files">
          📋 AI 準備寫入以下 ${pendingFiles.length} 個文件：
          <div class="wiki-ai-file-list">
            ${pendingFiles.map(f => `<div class="wiki-ai-file-item">📄 wiki/${f.path}</div>`).join('')}
          </div>
          <div class="wiki-ai-actions">
            <button class="wiki-ai-btn confirm" onclick="mConfirmWrite()">✓ 確認寫入</button>
            <button class="wiki-ai-btn cancel"  onclick="mCancelWrite()">✕ 取消</button>
          </div>
        </div>` : '';

      renderGrid(`<div class="wiki-ai-panel">
        <div class="wiki-ai-header">
          <div class="wiki-ai-title">🤖 Wiki AI 整理助手</div>
          <div class="wiki-ai-hint">AI 會讀取 F5（docs/）的唯讀來源，整理後寫入 wiki/</div>
        </div>
        <div class="wiki-ai-chat" id="wiki-chat">
          ${chatHTML}
          ${pendingHTML}
        </div>
        <div class="wiki-ai-input-row">
          <textarea class="wiki-ai-input" id="wiki-ai-input" rows="1"
            placeholder="輸入整理指令，或回答 AI 的問題…"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();mAiSend()}"
            oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"
          ></textarea>
          <button class="wiki-ai-send" id="wiki-ai-send" onclick="mAiSend()" title="送出 (Enter)">↑</button>
        </div>
      </div>`);

      // 捲到底
      setTimeout(() => {
        const chat = $('wiki-chat');
        if (chat) chat.scrollTop = chat.scrollHeight;
        $('wiki-ai-input')?.focus();
      }, 50);

      // 隱藏右側詳情（AI 模式不需要）
      $('m-detail').style.display = 'none';
    }

    // ── AI 送出指令 ──
    window.mAiSend = async () => {
      const inp = $('wiki-ai-input');
      const txt = inp?.value?.trim();
      if (!txt) return;
      inp.value = ''; inp.style.height = 'auto';

      const sendBtn = $('wiki-ai-send');
      if (sendBtn) sendBtn.disabled = true;

      // 加入使用者訊息
      aiHistory.push({ role: 'user', content: txt });
      showAIPanel();

      // 顯示 loading
      const chat = $('wiki-chat');
      if (chat) {
        const loading = document.createElement('div');
        loading.className = 'wiki-ai-msg ai';
        loading.id = 'wiki-ai-loading';
        loading.innerHTML = '<span style="opacity:.5">AI 思考中…</span>';
        chat.appendChild(loading);
        chat.scrollTop = chat.scrollHeight;
      }

      // 從 localStorage 讀取目前的 AI 設定，帶給後端選擇接口
      const aiConfig = (() => {
        try { return JSON.parse(localStorage.getItem('llm-wiki-config') || '{}'); } catch { return {}; }
      })();

      try {
        const res = await api('/api/wiki/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instruction: txt,
            history: aiHistory.slice(0,-1).filter(h=>!h._type).map(h=>({ role:h.role, content:h.content })),
            aiConfig,
          }),
        });

        if (res.type === 'files' && res.files?.length) {
          pendingFiles = res.files;
          aiHistory.push({ role: 'assistant', content: '', _type: 'pending', _files: res.files, _summary: res.summary });
        } else if (res.type === 'question') {
          aiHistory.push({ role: 'assistant', content: res.message, _isQ: true });
        } else {
          aiHistory.push({ role: 'assistant', content: res.message || '（無回應）' });
        }
      } catch(e) {
        aiHistory.push({ role: 'assistant', content: '⚠ 連線失敗：' + e.message });
      }

      if (sendBtn) sendBtn.disabled = false;
      showAIPanel();
    };

    // ── 確認寫入 ──
    window.mConfirmWrite = async () => {
      if (!pendingFiles.length) return;
      const files = [...pendingFiles];
      pendingFiles = [];

      let ok = 0, fail = 0;
      for (const f of files) {
        try {
          await api('/api/wiki/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: f.path, content: f.content }),
          });
          ok++;
        } catch { fail++; }
      }

      // 更新 pending 歷史為已完成
      const last = aiHistory.findLast(h => h._type === 'pending');
      if (last) { last._type = 'files'; }

      toast(`✓ 已寫入 ${ok} 個文件${fail ? `，${fail} 個失敗` : ''}`);
      await loadWikiTree();
      rebuildSidebar();
      showAIPanel();
    };

    window.mCancelWrite = () => {
      pendingFiles = [];
      const last = aiHistory.findLast(h => h._type === 'pending');
      if (last) aiHistory.splice(aiHistory.indexOf(last), 1);
      showAIPanel();
      toast('已取消');
    };

    // ── 初始化 ──
    $('m-detail').style.display = '';
    renderGrid(`<div class="m-empty"><div class="spin"></div></div>`);
    await loadWikiTree();
    rebuildSidebar();

    if (wikiDocs.length === 0) {
      activeDomain = '__ai__';
      window._setSbActive?.('__ai__');
      showAIPanel();
    } else {
      showDocsPanel('__all__');
    }
  };


// ── Quest: load from milestones ───────────────────────────────────────────────
