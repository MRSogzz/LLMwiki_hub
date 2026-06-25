/* ============================================================
   LLM WIKI — HUD Core
   API helper / Modal controller / 三欄 render helpers
   ============================================================ */

const API = 'http://localhost:3001';
// api() 使用 window.API_OVERRIDE（來自設定）或預設值
function getAPIBase() { return window.API_OVERRIDE || API; }

// ── API helper ────────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  try {
    const res  = await fetch(getAPIBase() + path, opts);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || res.statusText);
    return json;
  } catch (e) {
    throw e;
  }
}

function spinner() {
  return '<div class="p-spinner"><div class="spin"></div>載入中…</div>';
}
function errMsg(e) {
  return `<div class="p-err">⚠ 無法連線後端：${e.message}<br>請確認 <code>npm run dev</code> 已啟動（port 3001）</div>`;
}

// ── Modal 三欄控制器 ──────────────────────────────────────────────────────────

const PANEL_TITLES = {
  f1:'個人日誌', f2:'協作大廳', f3:'測試套件監控',
  f4:'目標專案時程', f5:'知識圖鑑', b:'模組背包 — I/O 週期表', m:'知識雷達'
};

const $ = id => document.getElementById(id);

function openModal(id) {
  document.querySelectorAll('.hk').forEach(b => b.classList.remove('active'));
  $('hkb-' + id)?.classList.add('active');
  $('modal-title').textContent = PANEL_TITLES[id] || id;

  // 重置詳情欄
  $('m-detail-icon').textContent = '📦';
  $('m-detail-name').textContent = '選擇一個項目';
  $('m-detail-tag').textContent  = '—';
  $('m-detail-body').innerHTML   = '<div class="m-empty" style="height:auto;padding:24px 0"><div style="font-size:12px;color:rgba(255,255,255,0.2)">點擊中間項目<br>查看詳細資訊</div></div>';
  $('m-detail-actions').style.display = 'none';

  const body = $('modal-body');
  if (id === 'f3') {
    body.classList.add('fullwidth');
    $('m-grid-wrap').innerHTML = `<iframe src="panel-tests.html" style="width:100%;height:100%;border:none;display:block;" title="F3 測試面板"></iframe>`;
    $('m-sidebar').innerHTML   = '';
    $('m-toolbar').innerHTML   = '';
  } else {
    body.classList.remove('fullwidth');
  }

  $('backdrop').classList.add('open');
  $('modal').classList.add('open');
  PANELS[id]();
}

function closeModal() {
  $('backdrop').classList.remove('open');
  $('modal').classList.remove('open');
  document.querySelectorAll('.hk').forEach(b => b.classList.remove('active'));
}

// ── 三欄 helper ───────────────────────────────────────────────────────────────

function renderSidebar(categories, activeId, onSelect) {
  // 儲存到 window 避免閉包序列化失效
  window._catCb   = onSelect;
  window._catDefs = categories;

  function buildSb(curActive) {
    $('m-sidebar').innerHTML = categories.map(c => `
      <div class="m-cat ${c.id === curActive ? 'active' : ''}"
           data-catid="${c.id}"
           onclick="window._catCb('${c.id}'); _setSbActive('${c.id}')">
        <div class="m-cat-icon">${c.icon}</div>
        <div class="m-cat-lbl">${c.label}</div>
      </div>
      ${c.divider ? '<div class="m-cat-divider"></div>' : ''}
    `).join('');
  }

  window._setSbActive = (id) => {
    document.querySelectorAll('.m-cat').forEach(el =>
      el.classList.toggle('active', el.dataset.catid === id)
    );
  };

  buildSb(activeId);
}

function renderToolbar(html) { $('m-toolbar').innerHTML = html; }
function renderGrid(html)    { $('m-grid-wrap').innerHTML = html; }

function renderDetail({ icon, name, tag, attrs, desc, actions }) {
  $('m-detail-icon').textContent = icon || '📦';
  $('m-detail-name').textContent = name || '—';
  $('m-detail-tag').textContent  = tag  || '—';
  $('m-detail-body').innerHTML = `
    ${attrs ? attrs.map(a => `
      <div class="m-attr">
        <span class="m-attr-icon">${a.icon}</span>
        <span class="m-attr-text">${a.text}</span>
      </div>`).join('') : ''}
    ${desc ? `<div class="m-detail-desc">${desc}</div>` : ''}
  `;
  if (actions && actions.length) {
    $('m-detail-actions').style.display = 'flex';
    $('m-detail-actions').innerHTML = actions.map(a =>
      `<button class="m-action-btn ${a.cls||'secondary'}" onclick="${a.onclick}">${a.label}</button>`
    ).join('');
  } else {
    $('m-detail-actions').style.display = 'none';
  }
}

function errGrid(e) {
  renderGrid(`<div class="m-empty"><div class="m-empty-icon">⚠</div><div style="font-size:11px;text-align:center">無法連線後端<br><span style="opacity:.5">${e.message}</span><br><br><span style="opacity:.35;font-size:10px">npm run dev → port 3001</span></div></div>`);
}

// ── PANELS ────────────────────────────────────────────────────────────────────