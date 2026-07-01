/* ============================================================
   LLM WIKI — HUD Settings
   設定面板 / Config 讀寫 / AI 提供者設定
   ============================================================ */

const CFG_KEY = 'llm-wiki-config';

const DEFAULT_CFG = {
  // AI 接口
  ai_provider:      'openai',       // openai | anthropic | llama | custom
  openai_key:       '',
  openai_model:     'gpt-4o',
  openai_base_url:  'https://api.openai.com/v1',
  anthropic_key:    '',
  anthropic_model:  'claude-sonnet-4-6',
  // llama.cpp
  llama_host:       'http://127.0.0.1',
  llama_port:       '8080',
  hermes_base_url:  'http://127.0.0.1:8642',
  llama_model_path: '',
  llama_ctx_size:   '4096',
  llama_threads:    '4',
  llama_gpu_layers: '0',
  // 自訂 API
  custom_base_url:  '',
  custom_api_key:   '',
  custom_model:     '',
  // 向量嵌入
  embed_provider:   'openai',       // openai | llama | custom
  embed_model:      'text-embedding-3-small',
  // 後端
  api_server:       'http://localhost:3001',
  // HUD
  hud_blur:         '4',
  hud_lang:         'zh-TW',
};

const CFG_SECTIONS = [
  { id:'ai',     icon:'🤖', label:'AI 接口'     },
  { id:'llama',  icon:'🦙', label:'llama.cpp'   },
  { id:'embed',  icon:'🧬', label:'向量嵌入'    },
  { id:'server', icon:'🖥',  label:'後端伺服器'  },
  { id:'hud',    icon:'🎨', label:'HUD 外觀'    },
  { id:'about',  icon:'ℹ',  label:'關於'        },
];

function loadCfg() {


try { return { ...DEFAULT_CFG, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') }; }
  catch { return { ...DEFAULT_CFG }; }
}


function saveHudToken() {
  const input = document.getElementById('hud-token-input');
  if (!input) return;
  const token = input.value.trim();
  setHudToken(token);
  const status = document.getElementById('token-status');
  if (status) {
    status.textContent = token
      ? '✓ Token 已儲存（' + token.slice(0,8) + '…）'
      : '⚠ Token 已清除';
    status.style.color = token ? '#4ade80' : '#f87171';
  }
  toast(token ? '✓ HUD Token 已儲存' : 'Token 已清除');
}
function saveCfgLocal(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

let cfgState = loadCfg();
let cfgSection = 'ai';

function openSettings() {
  cfgState = loadCfg();
  document.getElementById('settings-backdrop').style.cssText = 'position:absolute;inset:0;z-index:40;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);';
  const m = document.getElementById('settings-modal');
  m.style.opacity = '1'; m.style.pointerEvents = 'auto'; m.style.transform = 'translate(-50%,-50%) scale(1)';
  document.querySelectorAll('.hk').forEach(b => b.classList.remove('active'));
  $('hkb-esc')?.classList.add('active');
  renderCfgSidebar();
  renderCfgSection(cfgSection);
}

function closeSettings() {
  document.getElementById('settings-backdrop').style.cssText = '';
  const m = document.getElementById('settings-modal');
  m.style.opacity = '0'; m.style.pointerEvents = 'none'; m.style.transform = 'translate(-50%,-50%) scale(0.94)';
  $('hkb-esc')?.classList.remove('active');
}

function renderCfgSidebar() {
  const sb = $('cfg-sidebar');
  sb.innerHTML = CFG_SECTIONS.map(s => `
    <div onclick="renderCfgSection('${s.id}')" style="
      display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;
      font-size:11px;font-family:'JetBrains Mono',monospace;
      color:${s.id===cfgSection?'var(--accent)':'rgba(255,255,255,0.45)'};
      background:${s.id===cfgSection?'rgba(232,200,115,0.08)':'transparent'};
      border-left:2px solid ${s.id===cfgSection?'var(--accent)':'transparent'};
      transition:all .12s;
    " id="cfg-tab-${s.id}">
      <span style="font-size:14px">${s.icon}</span>${s.label}
    </div>`).join('');
}

function cfgField(key, label, type='text', extra='') {
  const val = cfgState[key] ?? '';
  const inputStyle = `width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px 12px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#f0ead8;outline:none;box-sizing:border-box;`;
  if (type === 'select') {
    return `<div style="margin-bottom:14px">
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:5px;letter-spacing:.06em">${label}</div>
      <select id="cfg-${key}" onchange="cfgState['${key}']=this.value;renderCfgSection(cfgSection)"
        style="${inputStyle}cursor:pointer;">${extra}</select>
    </div>`;
  }
  if (type === 'password') {
    return `<div style="margin-bottom:14px">
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:5px;letter-spacing:.06em">${label}</div>
      <input type="password" id="cfg-${key}" value="${val}" oninput="cfgState['${key}']=this.value"
        style="${inputStyle}" placeholder="••••••••" autocomplete="off"/>
    </div>`;
  }
  return `<div style="margin-bottom:14px">
    <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:5px;letter-spacing:.06em">${label}</div>
    <input type="${type}" id="cfg-${key}" value="${val}" oninput="cfgState['${key}']=this.value"
      style="${inputStyle}" ${extra}/>
  </div>`;
}

function cfgHint(text) {
  return `<div style="font-size:11px;color:rgba(255,255,255,0.28);line-height:1.6;margin-bottom:16px;padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:6px;border-left:3px solid rgba(232,200,115,0.25)">${text}</div>`;
}

function cfgTitle(t) {
  return `<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.07)">${t}</div>`;
}

function renderCfgSection(id) {
  cfgSection = id;
  renderCfgSidebar();
  const el = $('cfg-content');
  const p  = cfgState.ai_provider;
  const ep = cfgState.embed_provider;

  const sections = {
    ai: () => `
      ${cfgTitle('🤖 AI 接口設定')}
      ${cfgHint('選擇 AI 提供者，LLM WIKI 使用 AI 進行草稿生成與智慧問答。<br>llama.cpp 支援完全本地推理，無需 API 金鑰。')}
      ${cfgField('ai_provider','AI 提供者','select',`
        <option value="openai"    ${p==='openai'?'selected':''}>OpenAI (GPT-4o 等)</option>
        <option value="anthropic" ${p==='anthropic'?'selected':''}>Anthropic (Claude)</option>
        <option value="llama"     ${p==='llama'?'selected':''}>llama.cpp（本地）</option>
        <option value="hermes"    ${p==='hermes'?'selected':''}>🤖 Hermes Agent（多步驟自主整理）</option>
        <option value="custom"    ${p==='custom'?'selected':''}>自訂 API（OpenAI 相容）</option>
      `)}
      ${p==='openai' ? `
        ${cfgField('openai_key','OpenAI API Key','password')}
        ${cfgField('openai_model','模型','select',`
          <option value="gpt-4o">gpt-4o</option>
          <option value="gpt-4o-mini">gpt-4o-mini</option>
          <option value="gpt-4-turbo">gpt-4-turbo</option>
          <option value="o1-preview">o1-preview</option>
        `)}
        ${cfgField('openai_base_url','API Base URL（可覆蓋）','text','placeholder="https://api.openai.com/v1"')}
      ` : ''}
      ${p==='anthropic' ? `
        ${cfgField('anthropic_key','Anthropic API Key','password')}
        ${cfgField('anthropic_model','模型','select',`
          <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
          <option value="claude-opus-4-6">claude-opus-4-6</option>
          <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
        `)}
      ` : ''}
      ${p==='llama' ? `${cfgHint('⚠ llama.cpp 設定請至「llama.cpp」分頁設置')}` : ''}
      ${p==='hermes' ? `
        ${cfgHint('🤖 Hermes Agent（Nous Research）是獨立的 agent 執行框架，本地跑 Gemma 模型。<br>與其他模式不同：Hermes 會自主規劃多步驟（搜尋 docs → 閱讀 → 整理 → 寫入 wiki），<br>而非一次性問答。')}
        ${cfgField('hermes_base_url','Hermes API Server URL','text','placeholder="http://127.0.0.1:8642"')}
        ${cfgHint('API Key 需在後端 .env 設定 <code style="background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:3px">HERMES_API_KEY</code>（對應 Hermes 的 API_SERVER_KEY，可在 <code style="background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:3px">~/.hermes/.env</code> 查看）。')}
        <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:5px;letter-spacing:.06em">可用工具集</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.45);padding:8px 12px;background:rgba(0,0,0,0.3);border-radius:6px;margin-bottom:14px;font-family:'JetBrains Mono',monospace;line-height:1.8">
          search_docs · read_doc · list_wiki · write_wiki · finish
        </div>
      ` : ''}
      ${p==='custom' ? `
        ${cfgHint('自訂 API 必須相容 OpenAI /v1/chat/completions 格式（如 LM Studio、Ollama 等）')}
        ${cfgField('custom_base_url','Base URL','text','placeholder="http://localhost:1234/v1"')}
        ${cfgField('custom_api_key','API Key（可留空）','password')}
        ${cfgField('custom_model','模型名稱','text','placeholder="local-model"')}
      ` : ''}
    `,

    llama: () => `
      ${cfgTitle('🦙 llama.cpp 本地推理')}
      ${cfgHint('llama.cpp 提供完全離線的本地 LLM 推理。<br>啟動 llama.cpp server 後填入以下設定，無需 API 金鑰，保護隱私。<br><br>啟動指令範例：<code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:3px">./llama-server -m model.gguf --host 0.0.0.0 --port 8080</code>')}
      ${cfgField('llama_host','Server Host','text','placeholder="http://127.0.0.1"')}
      ${cfgField('llama_port','Port','text','placeholder="8080"')}
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:5px;letter-spacing:.06em">API Endpoint（自動組合）</div>
      <div style="font-size:11px;color:var(--accent);padding:8px 12px;background:rgba(0,0,0,0.3);border-radius:6px;margin-bottom:14px;font-family:'JetBrains Mono',monospace">
        ${cfgState.llama_host || 'http://127.0.0.1'}:${cfgState.llama_port || '8080'}/v1/chat/completions
      </div>
      ${cfgField('llama_model_path','模型路徑（顯示用）','text','placeholder="/models/llama-3-8b.gguf"')}
      ${cfgField('llama_ctx_size','Context Size','text','placeholder="4096"')}
      ${cfgField('llama_threads','CPU Threads','text','placeholder="4"')}
      ${cfgField('llama_gpu_layers','GPU Layers（0=純 CPU）','text','placeholder="0"')}
      ${cfgHint('✦ 當 AI 提供者設為「llama.cpp」時，LLM WIKI 會將 llama.cpp server 作為 OpenAI 相容 API 使用。<br>llama.cpp server 支援 /v1/chat/completions 與 /v1/embeddings 端點。')}
    `,

    embed: () => `
      ${cfgTitle('🧬 向量嵌入設定')}
      ${cfgHint('向量嵌入用於 F5 圖鑑的語意搜尋功能，以及 wiki vector build 指令。')}
      ${cfgField('embed_provider','嵌入提供者','select',`
        <option value="openai" ${ep==='openai'?'selected':''}>OpenAI text-embedding-3-small</option>
        <option value="llama"  ${ep==='llama' ?'selected':''}>llama.cpp /v1/embeddings</option>
        <option value="custom" ${ep==='custom'?'selected':''}>自訂 Embedding API</option>
      `)}
      ${ep==='openai' ? `
        ${cfgField('embed_model','嵌入模型','select',`
          <option value="text-embedding-3-small">text-embedding-3-small（1536 維）</option>
          <option value="text-embedding-3-large">text-embedding-3-large（3072 維）</option>
          <option value="text-embedding-ada-002">text-embedding-ada-002（1536 維，舊版）</option>
        `)}
      ` : ''}
      ${ep==='llama' ? cfgHint('使用 llama.cpp 分頁設定的 Host/Port 進行嵌入。<br>需要載入支援 embedding 的模型（如 nomic-embed-text）。') : ''}
    `,

    server: () => `
      ${cfgTitle('🖥 後端 API 伺服器')}
      ${cfgHint('LLM WIKI 後端伺服器負責讀寫 Markdown 檔案、Git 操作、模組解析等功能。<br>預設監聽 localhost:3001，CLI 和 HUD 前端都需要此服務。')}
      ${cfgField('api_server','API Server URL','text','placeholder="http://localhost:3001"')}
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:5px;letter-spacing:.06em">連線狀態</div>
      <div id="server-status" style="font-size:11px;padding:8px 12px;background:rgba(0,0,0,0.3);border-radius:6px;margin-bottom:14px;color:rgba(255,255,255,0.35)">
        點擊「測試連線」確認後端狀態
      </div>
      ${cfgHint('啟動指令：<code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:3px">npm run dev</code>')}

      ${cfgTitle('🔑 HUD Token（寫入驗證）')}
      ${cfgHint('後端啟動時會在 terminal 印出 HUD_TOKEN，將其貼入下方。<br>或在 .env 設定 <code style="background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:3px">HUD_TOKEN=your_token</code> 以持久化。')}
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px">
        <input type="password" id="hud-token-input"
          style="flex:1;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.12);
                 border-radius:6px;padding:7px 12px;font-family:'JetBrains Mono',monospace;
                 font-size:11px;color:#f0ead8;outline:none"
          placeholder="貼上後端 terminal 顯示的 token…"
          value="${getHudToken()}" />
        <button onclick="saveHudToken()"
          style="padding:7px 14px;border-radius:6px;border:1px solid rgba(78,205,196,0.4);
                 background:rgba(78,205,196,0.1);color:#4ECDC4;font-family:'JetBrains Mono',monospace;
                 font-size:10px;cursor:pointer;white-space:nowrap">
          儲存 Token
        </button>
      </div>
      <div id="token-status" style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:8px">
        ${getHudToken() ? '✓ Token 已設定（' + getHudToken().slice(0,8) + '…）' : '⚠ 尚未設定 Token，寫入操作將被後端拒絕'}
      </div>
    `,

    hud: () => `
      ${cfgTitle('🎨 HUD 外觀設定')}
      ${cfgField('hud_blur','背景模糊強度（0-24px）','text','placeholder="4"')}
      ${cfgField('hud_lang','介面語言','select',`
        <option value="zh-TW" ${cfgState.hud_lang==='zh-TW'?'selected':''}>繁體中文</option>
        <option value="zh-CN" ${cfgState.hud_lang==='zh-CN'?'selected':''}>简体中文</option>
        <option value="en"    ${cfgState.hud_lang==='en'   ?'selected':''}>English</option>
      `)}
      ${cfgHint('換殼主題請使用底部工具列的「↑ theme.json」上傳功能，或手動放置至 assets/themes/ 目錄。')}
    `,

    about: () => `
      ${cfgTitle('ℹ 關於 LLM WIKI')}
      <div style="font-size:13px;color:var(--text);line-height:1.8;margin-bottom:16px">
        <strong>LLM WIKI</strong> — 人機協作知識管理系統<br>
        <span style="color:rgba(255,255,255,0.45)">版本：v1.0.0</span>
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.4);line-height:1.8">
        <div>後端 API：<span style="color:var(--accent)">${cfgState.api_server}</span></div>
        <div>AI 提供者：<span style="color:var(--accent)">${cfgState.ai_provider}</span></div>
        <div>嵌入提供者：<span style="color:var(--accent)">${cfgState.embed_provider}</span></div>
      </div>
      <div style="margin-top:16px;padding:12px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(255,255,255,0.07)">
        <div style="font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">儲存位置</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.45);line-height:1.8">
          設定檔：localStorage（前端）+ <code style="background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px">.system/config.json</code>（後端）<br>
          筆記：<code style="background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px">.system/user/notes/</code><br>
          知識庫：<code style="background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px">docs/**/*.md</code>（唯讀，手動放置）<br>
          模組：<code style="background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px">modules/*/README.md</code>
        </div>
      </div>
      <div style="margin-top:14px;font-size:10px;color:rgba(255,255,255,0.25)">
        授權：CC BY-NC-SA 4.0（文件
      </div>
    `,
  };

  el.innerHTML = (sections[id] ?? (() => ''))();
}

function saveSettings() {
  saveCfgLocal(cfgState);
  // 同步到 API server URL
  if (cfgState.api_server) {
    window.API_OVERRIDE = cfgState.api_server;
  }
  // 同步 blur
  if (cfgState.hud_blur) {
    document.documentElement.style.setProperty('--bg-blur', cfgState.hud_blur + 'px');
  }
  // 嘗試持久化到後端
  fetch((cfgState.api_server || API) + '/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfgState),
  }).catch(() => {}); // 後端不可用時靜默失敗
  toast('✓ 設定已儲存');
  closeSettings();
}

function resetSettings() {
  if (!confirm('確定重設所有設定為預設值？')) return;
  cfgState = { ...DEFAULT_CFG };
  renderCfgSection(cfgSection);
  toast('設定已重設');
}

async function testConnection() {
  const url = cfgState.api_server || API;
  const el  = $('server-status');
  if (el) el.textContent = '測試中…';
  try {
    const r = await fetch(url + '/api/health');
    const d = await r.json();
    if (el) {
      el.textContent  = `✓ 連線成功 — ${d.modules ?? '?'} 個模組已載入`;
      el.style.color  = '#4ade80';
    }
    toast('✓ 後端連線正常');
  } catch(e) {
    if (el) {
      el.textContent = `✗ 無法連線：${url}`;
      el.style.color = '#f87171';
    }
    toast('✗ 後端連線失敗');
  }
}

// 初始化：從 localStorage 讀取設定並套用
(function initCfg() {
  const cfg = loadCfg();
  if (cfg.hud_blur) document.documentElement.style.setProperty('--bg-blur', cfg.hud_blur + 'px');
  if (cfg.api_server) window.API_OVERRIDE = cfg.api_server;
})();

loadQuests();
// loadThemeFromServer('default');   // 取消注解以自動載入主題