# LLM WIKI

> 人機協作知識管理系統 — Markdown SSOT × 代碼 I/O 週期表 × 測試監控 × CLI 工具

---



---

## 目錄

- [系統概覽](#系統概覽)
- [快速開始](#快速開始)
- [目錄結構與儲存位置](#目錄結構與儲存位置)
- [CLI 完整指令手冊](#cli-完整指令手冊)
- [HUD 快捷鍵說明](#hud-快捷鍵說明)
- [模組規格格式](#模組規格格式)
- [型別系統](#型別系統)
- [換殼系統](#換殼系統)
- [API 端點](#api-端點)
- [授權](#授權)

---

## 系統概覽

```
前端 HUD 層            後端引擎層              資料層 (SSOT)
──────────────         ──────────────────      ──────────────────────────────
F1 個人日誌   →      Notes CRUD API    ←→   .system/user/notes/*.md
F2 聯機大廳     →      Git API           ←→   .git（simple-git）
F3 測試套件     →      Tests API         ←→   /api/tests（vitest --json）
F4 專案時程活動     →      Milestones Parser  ←→   milestones/*.md
F5 知識圖鑑     →      Docs Search API   ←→   docs/**/*.md
B  模組背包     →      Type Checker      ←→   modules/*/README.md
M  知識雷達     →      Directory Scanner ←→   docs/ 目錄樹
─────────────────────────────────────────────────────────────────
CLI wiki <cmd>  →      同後端引擎         ←→   同資料層（直接讀寫檔案）
```

---

## 快速開始

```bash
# 1. Clone & 安裝依賴
git clone https://github.com/MRSogzz/LLMwiki_hub.git
cd llm-wiki
npm install

# 2. 設定環境變數
cp .env.example .env
# 填入 GITHUB_TOKEN、OPENAI_API_KEY 等

# 3. 啟動後端 API server（port 3001，CLI 和 HUD 都需要）
npm run dev

# 4. 開啟前端 HUD（另開終端）
npx serve frontend/
# 瀏覽 http://localhost:3000，按 F1~F5 / B / M

# 5. 使用 CLI（另開終端）
npm run wiki -- help
npm run wiki -- note ls
npm run wiki -- module ls
```

---

## 目錄結構與儲存位置

```
llm-wiki/
│
├── .system/                        ← 系統自動生成（git-ignored）
│   ├── index.json                  ← 模組索引快取（metadata-parser 自動更新）
│   ├── vector-cache.json           ← 向量索引快取（wiki vector build 生成）
│   ├── ci/
│   │   └── ci-runs.json            ← CI writeback 執行記錄
│   └── user/
│       └── notes/                  ← F1 個人筆記（*.md）
│           ├── note-2025-06-22.md
│           └── ...
│
├── modules/                        ← B 模組背包：代碼模組
│   ├── tokenize/
│   │   ├── index.ts                ← 實作程式碼
│   │   └── README.md               ← YAML Front Matter + I/O JSON Block（必要）
│   └── embedVec/
│       ├── index.ts
│       └── README.md
│
├── docs/                           ← F5 知識圖鑑 / M 知識雷達：知識庫文件
│   └── <Domain>/                   ← 第一層：領域（Domain）
│       └── <Topic>/                ← 第二層：主題（Topic）
│           └── <doc>.md            ← 第三層：文件（Doc）
│
├── milestones/                     ← F4 專案時程活動：里程碑文件
│   ├── phase-1.md                  ← YAML Front Matter（title/completion/due 等）
│   └── ...
│
├── backend/                        ← API Server（port 3001）
│   ├── server.ts                   ← Express 主程式，匯集所有路由
│   ├── parser/
│   │   └── metadata-parser.ts      ← chokidar 監聽 + YAML + I/O JSON 解析
│   ├── type-checker/
│   │   └── type-checker.ts         ← TypeMismatchException 動態校驗
│   ├── ci-watcher/
│   │   └── ci-watcher.ts           ← CI 結果寫回 README.md
│   └── vector/
│       └── vector-index.ts         ← OpenAI Embedding + 餘弦相似度搜尋
│
├── cli/                            ← CLI 工具（wiki 命令）
│   ├── wiki.ts                     ← 主入口（npm run wiki -- <cmd>）
│   ├── commands/
│   │   ├── note.ts                 ← wiki note（讀寫 .system/user/notes/）
│   │   ├── git.ts                  ← wiki git（讀取 .git）
│   │   ├── test.ts                 ← wiki test（呼叫 /api/tests）
│   │   ├── milestone.ts            ← wiki milestone（讀取 milestones/）
│   │   ├── doc.ts                  ← wiki doc（讀取 docs/）
│   │   ├── module.ts               ← wiki module（讀取 modules/）
│   │   ├── map.ts                  ← wiki map（掃描 docs/ 樹）
│   │   ├── vector.ts               ← wiki vector（讀寫 .system/vector-cache.json）
│   │   └── ci.ts                   ← wiki ci（寫入 modules/ + .system/ci/）
│   └── utils/
│       ├── api.ts                  ← fetch 後端 API + parseArgs + 路徑常數
│       └── print.ts                ← ANSI 顏色、表格、進度條、banner
│
├── frontend/                       ← HUD 前端（靜態 HTML）
│   ├── hud-main.html            ← 主 HUD（全屏三欄，七快捷鍵）
│   ├── panel-tests.html         ← F3 測試套件測試監控面板
│   ├── style-tokens.css            ← 全局設計 token
│   └── assets/themes/              ← 換殼主題資源
│       ├── README.md               ← 換殼規格說明
│       ├── default/theme.json
│       ├── gamification/theme.json
│       └── cyber/theme.json
│
├── .github/workflows/ci.yml        ← CI/CD（型別檢查 → Schema 校驗 → writeback → 向量重建）
├── .env.example                    ← 環境變數範本
├── package.json
├── tsconfig.json
└── LICENSE                         ← CC BY-NC-SA 4.0（文件）
```

---

## CLI 完整指令手冊

使用方式：`npm run wiki -- <command> [subcommand] [options]`

> 或安裝後直接使用 `wiki <command>`

---

### `wiki note` — F1 個人日誌

**資料位置：`.system/user/notes/*.md`**

| 指令 | 說明 | 範例 |
|------|------|------|
| `note ls` | 列出所有筆記（依修改時間排序） | `wiki note ls` |
| `note new <title>` | 新增筆記（自動以今日日期命名） | `wiki note new "今日心得" --content "# 心得"` |
| `note read <filename>` | 讀取筆記內容 | `wiki note read note-2025-06-22.md` |
| `note save <filename>` | 儲存/覆寫筆記 | `wiki note save note-2025-06-22.md --content "新內容"` |
| `note append <filename>` | 附加內容到筆記末尾 | `wiki note append note-2025-06-22.md --text "補充：..."` |
| `note rm <filename>` | 刪除筆記 | `wiki note rm note-2025-06-22.md` |

**選項：**
- `--content <text>` — 直接提供內容（省略則開啟 `$EDITOR`）
- `--name <filename>` — 自訂檔名（預設：`note-YYYY-MM-DD-<slug>.md`）
- `--force` — 強制覆寫已存在的檔案

---

### `wiki git` — F2 協作大廳

**資料位置：`.git`（透過 simple-git）**

| 指令 | 說明 | 範例 |
|------|------|------|
| `git log` | 顯示 commit 記錄 | `wiki git log --limit 20` |
| `git status` | 工作目錄狀態（分支/修改/暫存/未追蹤） | `wiki git status` |
| `git diff [file]` | 顯示差異（ANSI 彩色） | `wiki git diff modules/tokenize/README.md` |
| `git branch` | 列出所有分支 | `wiki git branch` |

**選項：**
- `--limit <n>` / `--n <n>` — commit 顯示數量（預設 20）
- `--author <name>` — 篩選作者

---

### `wiki test` — F3 測試套件（測試監控）

**資料位置：`/api/tests`（後端 mock；生產環境接 vitest --reporter=json）**

| 指令 | 說明 | 範例 |
|------|------|------|
| `test ls` | 列出所有測試套件（含星級/狀態） | `wiki test ls` |
| `test ls --type unit` | 篩選類型（unit/integration/e2e） | `wiki test ls --type e2e` |
| `test show <id>` | 顯示套件詳情（測試案例 + 錯誤記錄） | `wiki test show unit-parser` |
| `test run [<id>]` | 觸發測試執行（呼叫 /api/tests/run） | `wiki test run unit-typechecker` |

---

### `wiki milestone` — F4 目標專案時程

**資料位置：`milestones/*.md`（YAML Front Matter 含 title/completion/due/tags）**

| 指令 | 說明 | 範例 |
|------|------|------|
| `milestone ls` | 列出所有里程碑（含進度條） | `wiki milestone ls` |
| `milestone show <name>` | 顯示單一里程碑詳情 | `wiki milestone show phase-1` |

**里程碑 YAML 欄位：**
```yaml
---
title: Phase 1 — 解析引擎 MVP
status: DONE
completion: 100          # 0-100
total_tasks: 4
done_tasks: 4
due: 2025-06-10
tags: [milestone, phase-1]
---
```

---

### `wiki doc` — F5 知識圖鑑（知識庫）

**資料位置：`docs/**/*.md`（三層：Domain/Topic/Doc）**

| 指令 | 說明 | 範例 |
|------|------|------|
| `doc search <keyword>` | 全文搜尋知識庫文件 | `wiki doc search "型別校驗"` |
| `doc read <path>` | 讀取指定文件內容 | `wiki doc read llm-wiki/architecture/system-overview.md` |
| `doc tree` | 顯示 docs/ 完整目錄樹 | `wiki doc tree` |

---

### `wiki module` — B 模組背包（代碼模組）

**資料位置：`modules/<name>/README.md`（YAML Front Matter + I/O JSON Block）**

| 指令 | 說明 | 範例 |
|------|------|------|
| `module ls` | 列出所有模組（含 INPUT/OUTPUT/狀態） | `wiki module ls` |
| `module ls --status DONE` | 依狀態篩選（DONE/WIP/BLOCKED） | `wiki module ls --status WIP` |
| `module show <name\|id>` | 顯示模組詳情（I/O 規格/延遲/標籤） | `wiki module show tokenize` |
| `module validate <A> <B>` | 校驗兩模組 OUTPUT→INPUT 型別相容性 | `wiki module validate tokenize embedVec` |
| `module connect <A> <B> [C...]` | 校驗整條 Pipeline 型別鏈 | `wiki module connect tokenize embedVec cosSim rankDocs` |

---

### `wiki map` — M 知識雷達

**資料位置：`docs/` 目錄樹**

| 指令 | 說明 | 範例 |
|------|------|------|
| `map tree` | 顯示 docs/ 完整三層目錄樹 | `wiki map tree` |
| `map domain <name>` | 顯示特定 Domain 下的文件 | `wiki map domain llm-wiki` |

---

### `wiki vector` — 向量索引

**資料位置：`.system/vector-cache.json`（OpenAI text-embedding-3-small）**

| 指令 | 說明 | 範例 |
|------|------|------|
| `vector build` | 重建向量索引（需 OPENAI_API_KEY） | `wiki vector build` |
| `vector search <query>` | 語意搜尋模組 | `wiki vector search "語意向量化"` |
| `vector status` | 查看索引快取狀態 | `wiki vector status` |

**選項：**
- `--top <n>` / `--k <n>` — 返回結果數量（預設 5）

---

### `wiki ci` — CI Writeback

**資料位置：`modules/<name>/README.md`（更新 YAML status/latency）、`.system/ci/ci-runs.json`（記錄）**

| 指令 | 說明 | 範例 |
|------|------|------|
| `ci writeback` | 將 CI 結果寫回模組 README | `wiki ci writeback --module 1 --status DONE --latency ~4ms` |
| `ci log` | 顯示最近 CI 執行記錄 | `wiki ci log` |

**選項（writeback）：**
- `--module <id>` — 模組 ID（必填）
- `--status <DONE\|WIP\|BLOCKED>` — 新狀態（必填）
- `--latency <val>` — 延遲值（如 `~4ms`）
- `--name <name>` — 模組名稱
- `--pass <n>` — 通過測試數
- `--fail <n>` — 失敗測試數
- `--notes <text>` — 備注

---

### `wiki serve` — 啟動 API Server

啟動後端 Express server（port 3001），CLI 和 HUD 前端都需要此服務。

```bash
npm run wiki -- serve
# 等同於 npm run dev
```

---

## HUD 快捷鍵說明

| 按鍵 | 面板名稱 | 側欄分類 | CLI 對應 |
|------|---------|---------|---------|
| F1 | 個人日誌 | 所有筆記 / 新增筆記 / 今日 | `wiki note` |
| F2 | 協作大廳 | Commit 紀錄 / 工作狀態 | `wiki git` |
| F3 | 測試套件 | 全部 / 標準測試 / 高風險測試 | `wiki test` |
| F4 | 目標專案時程 | 里程碑 / 進行中 / 已完成 | `wiki milestone` |
| F5 | 知識圖鑑 | 搜尋 / 全部文件 | `wiki doc` |
| B  | 模組背包 | 全部 / DONE / WIP / BLOCKED | `wiki module` |
| M  | 知識雷達 | 全部 / 各 Domain | `wiki map` |

> 操作：按快捷鍵開啟，點左側分類切換，點中間格子查看右側詳情，`Esc` 關閉。

---

## 模組規格格式

每個 `modules/<name>/README.md` 必須包含：

````markdown
---
id: 001
name: tokenize
status: DONE          # DONE | WIP | BLOCKED
latency: ~12ms
author: alice
created: 2025-06-18
updated: 2025-06-18
tags: [nlp, tokenizer]
---

# tokenize()

文字切詞模組。

```json //INPUT
{
  "type": "string",
  "description": "原始輸入文字"
}
```

```json //OUTPUT
{
  "type": "array",
  "items": { "type": "string" },
  "description": "token 陣列"
}
```
````

---

## 型別系統

### B 背包方格佈局

```
┌──────────────────────┐
│ INPUT          OUTPUT│  ← 左上: 輸入型別  右上: 輸出型別
│       funcName       │  ← 中央: 函數名稱
│ #01             DONE │  ← 左下: 模組編號  右下: 完成狀態
└──────────────────────┘
```

### 型別色碼

| 型別 | 色碼 | CLI 顯示 | 語義 |
|------|------|---------|------|
| `STR`   | `#3A7FD5` | 藍色 | 字串 |
| `INT`   | `#00C97A` | 綠色 | 整數 |
| `FLOAT` | `#F5A623` | 琥珀 | 浮點數 |
| `BOOL`  | `#FF8C42` | 橙色 | 布林值 |
| `ARR`   | `#A97FE8` | 紫色 | 陣列 |
| `OBJ`   | `#FF4D6A` | 紅色 | 物件 |
| `NUM`   | `#4ECDC4` | 青色 | 數值泛型（INT∪FLOAT）|
| `ANY`   | `#8A9DC0` | 灰色 | 泛型 |

### 相容性規則

- `ANY` 可接收任意型別
- `NUM` 可接收 `INT` 或 `FLOAT`
- 其他須完全一致，否則拋出 `TypeMismatchException`

---

## 換殼系統

HUD 底部工具列支援即時上傳替換：

| 資源 | 儲存位置 | 格式 | 建議尺寸 |
|------|---------|------|---------|
| 背景圖 | `assets/themes/<id>/bg/bg.jpg` | JPG/WebP | 1920×1080 |
| 雷達底圖 | `assets/themes/<id>/minimap/minimap.png` | PNG | 260×260 |
| 快捷鍵圖示 | `assets/themes/<id>/keys/key-<id>.png` | PNG 透明 | 88×88 |
| 角色頭像 | `assets/themes/<id>/avatars/avatar-N.png` | PNG | 104×104 |
| 主題設定 | `assets/themes/<id>/theme.json` | JSON | — |

---

## API 端點

後端 server 預設監聽 `http://localhost:3001`，可透過 `WIKI_API` 環境變數覆蓋。

### 筆記（F1）
| 方法 | 路徑 | 資料位置 |
|------|------|---------|
| GET    | `/api/notes`            | `.system/user/notes/` |
| GET    | `/api/notes/:filename`  | `.system/user/notes/<filename>` |
| POST   | `/api/notes/:filename`  | `.system/user/notes/<filename>` |
| DELETE | `/api/notes/:filename`  | `.system/user/notes/<filename>` |

### Git（F2）
| 方法 | 路徑 | 資料位置 |
|------|------|---------|
| GET | `/api/git/commits` | `.git`（simple-git） |
| GET | `/api/git/status`  | `.git`（simple-git） |

### 測試（F3）
| 方法 | 路徑 | 資料位置 |
|------|------|---------|
| GET  | `/api/tests`        | mock 資料（接 vitest --reporter=json）|
| GET  | `/api/tests/:id`    | mock 資料 |
| POST | `/api/tests/run`    | 觸發執行 |

### 里程碑（F4）
| 方法 | 路徑 | 資料位置 |
|------|------|---------|
| GET | `/api/milestones` | `milestones/*.md` |

### 文件（F5 / M）
| 方法 | 路徑 | 資料位置 |
|------|------|---------|
| GET | `/api/docs/tree`        | `docs/` 目錄樹 |
| GET | `/api/docs/search?q=`   | `docs/**/*.md` 全文搜尋 |
| GET | `/api/docs/file?path=`  | `docs/<path>` |

### 模組（B）
| 方法 | 路徑 | 資料位置 |
|------|------|---------|
| GET  | `/api/modules`             | `modules/*/README.md` → `.system/index.json` |
| GET  | `/api/modules/search?q=`   | `modules/*/README.md` |
| GET  | `/api/modules/:id`         | `modules/*/README.md` |
| POST | `/api/validate`            | 記憶體型別矩陣 |
| POST | `/api/validate/pipeline`   | 記憶體型別矩陣 |

### CI
| 方法 | 路徑 | 資料位置 |
|------|------|---------|
| POST | `/api/ci/writeback` | `modules/<name>/README.md` + `.system/ci/ci-runs.json` |

---

## 開發指令

```bash
npm run dev              # 啟動後端 API server（port 3001）
npm run wiki -- help     # CLI 說明
npm run wiki -- note ls  # 列出筆記
npm run wiki -- module ls --status DONE  # 列出已完成模組
npm run wiki -- module validate tokenize embedVec  # 型別校驗
npm run type-check       # TypeScript 型別檢查
npm run parse            # 手動解析 modules/ → .system/index.json
npm run vector:build     # 重建向量索引（需 OPENAI_API_KEY）
npm run build            # 編譯 TypeScript → dist/
npm run start            # 執行 production server
```

---
---

## ⚠️ 先前技術宣告 (Prior Art Declaration)

依據國際專利法之「先前技術公開」原則（包括但不限於美國專利法 35 U.S.C. § 102 及歐洲專利公約 Article 54 EPC），本專案以下列具體之原創系統設計、架構拓撲及系統工作流進行防禦性公開存證。本 Repository 首次公開發表時之密碼學 Git Commit 紀錄、可驗證之歷史軌跡與遠端託管平台（如 GitHub）之公眾可查閱時間戳記，在法律上構成了該等技術已進入公眾領域並處於「公眾得自由知悉之公開揭露（Publicly Accessible Disclosure）」狀態之表面證據（*Prima Facie* Evidence）。

未來任何專利申請案，其權利要求範圍（Claims）若涉及本技術概念、其細微衍生變形、或經由人工智慧（AI）系統自動化生成之跨領域功能性泛化與演算法改作應用，且其申請時間晚於本專案之首次公開 Commit 時間戳者，皆應因缺乏新穎性（Novelty）及先前技術（Prior Art）之明確存在，而在全球範圍內被判定為無效。各條款屬相互獨立且可分割之公開發表事實。

### 1. 異步人機共筆之非阻塞狀態隔離與分散式寫回機制 (Markdown SSOT)
本技術專為解決 LLM 代理（Agents）與人類在「單一真實之源（SSOT）」下併發編輯所產生的競爭條件（Race Condition）：
* **技術特徵：** 引入「異步快取暫存（Buffer Cache）」與「檔案排他鎖（Exclusive File Locking）」。
* **隔離邏輯：** CI 測試與 LLM 自動生成之元數據（如 `status`、`latency`）嚴禁直接寫入人類編輯區。系統建立中央快取索引（`.system/index.json`）作為動態隔離層，任何自動化寫回皆須透過隔離層緩衝並實施內部文件鎖，確保「人類編輯優先權」，徹底杜絕併發覆蓋與 Markdown AST 結構崩潰。
* **【代碼實作參照】** 參見本儲存庫之 `/backend/ci-watcher/`、`/cli/commands/ci.ts` 及 `.system/index.json`。

### 2. 具方格四角拓撲佈局之多階 JSON Schema 動態型別校驗管線系統（B 鍵 HUD 背包）
本技術並非傳統的靜態代碼編譯檢查，而是專為異構代碼塊串接設計的動態校驗架構：
* **視覺拓撲特徵：** 採用**「方格四角固定元數據佈局」**（固定為：左上角 INPUT 核心規格、右上角 OUTPUT 核心規格、中央為函數識別碼、左下角為唯一模組編號、右下角為動態生命週期狀態指示燈）。
* **校驗驅動邏輯：** 底層校驗引擎採用標準 JSON Schema 聲明。當多個獨立模組進行管線串接時，系統會自動提取鄰近模組之 JSON Schema，透過遞迴深度優先搜索（DFS）進行對等互補驗證，一經檢測到巢狀物件（Nested Objects）欄位不相容，立即在記憶體型別矩陣中攔截並拋出系統級 `TypeMismatchException`。
* **【代碼實作參照】** 參見本儲存庫之 `/backend/type-checker/` 及 `/modules/` 各模組 README 規格。

### 3. 基於同源整合與極限扁平化尋路之剛性 HUD 互動控制層
本技術藉由將遊戲化互動元模型跨界轉譯至開發者工具中，消除 Web 管理後台與 CLI 之間的資訊斷層：
* **架構與通訊特徵：** 採用**「固定七鍵全域快捷鍵（F1~F5 + B + M）直映射屏障」**，一鍵喚醒全螢幕、非彈出式的三欄式功能面板 HUD 介面。後端 Express API 引擎採用靜態託管（Static Serving）策略將前端資源納入同源範疇（Same-Origin），徹底免除 CORS 阻礙與環境變數動態注入之安全性死角。
* **限制路徑長度原則：** 硬編碼綁定 Ben Shneiderman 的 UI 設計八大黃金守則與 Bounded-Path Principle。將所有核心知識規格限制在扁平化的低階層資訊結構中，使操作者在極少數的單次離散按鍵動作內即可直達任意深層規格，將尋路效率壓縮至常數級極限（接近 $O(1)$ 效率）。當觸發 `TypeMismatchException` 時，HUD 立刻將衝突轉化為高對比視覺化高亮矩陣，並支援一鍵復原（Rollback）至 SSOT 快取的上一個穩定狀態。
* **【代碼實作參照】** 參見本儲存庫之 `/frontend/` 各面板實作及 `/backend/server.ts`。

### 4. 資料流閉環控制之卡片式測試監控系統 (F3 HUD)
本技術與一般僅顯示文字 Log 的測試工具具有本質區別，實施了動態數據串流閉環控制：
* **架構特徵：** 測試套件以具備星級評分、詳情面板之「遊戲化卡片」形式呈現於 HUD 介面中。
* **閉環邏輯：** 後端即時監聽並攔截 Vitest 執行序之標準 JSON 報告（`vitest --json`），將非同步測試結果即時轉譯為卡片狀態，並具備自動追溯與寫回 README.md 更新之閉環控制（Closed-loop Control）。
* **【代碼實作參照】** 參見本儲存庫之 `/frontend/panel-tests.html` 及 `/cli/commands/test.ts`。

### 5. 具異動驅動快取之雙層非同步 Markdown 模組規格（Module Spec）
* **架構特徵：** 在單一實體 Markdown 文件內實作雙層嵌入式佈局，將結構化 YAML 元數據與功能性的 JSON `//INPUT` 及 `//OUTPUT` 聲明代碼區塊進行強烈綁定。
* **與 Google OKF 之區別性特徵：** 本技術在核心精神上與 Google Open Knowledge Format (OKF) 相容，但在架構上擴展為「執行期動態管線與校驗生態系」。底層由檔案監聽器（Chokidar）驅動，當檢測到模組文件異動時，自動標記為 "Stale"，並觸發背景非阻塞線程呼叫 OpenAI Embedding API 非同步更新語意快取（`.system/vector-cache.json`）；同時該格式直接與型別引擎對接進行動態校驗。
* **【代碼實作參照】** 參見本儲存庫之 `/backend/parser/metadata-parser.ts`、`/backend/vector/` 及 `.system/vector-cache.json`。

<details>
<summary><b>🌐 Click to expand English Version (Prior Art Declaration)</b></summary>

### ⚠️ Prior Art Declaration

This declaration constitutes a public disclosure of prior art under international patent laws (including but not limited to 35 U.S.C. § 102 and Article 54 EPC). The initial publication timestamp and technical scope of this specification are anchored by the cryptographic Git commit logs, verifiable repository history, and public hosting platform timestamps, constituting *prima facie* evidence of public disclosure and global public availability.

Any patent application claiming these concepts, minor derivations thereof, or cross-domain functional generalizations and algorithmic adaptations driven by automated artificial intelligence systems, filed subsequent to the timestamp of this repository's initial public commit, shall be deemed invalid worldwide due to lack of novelty. Each section outlined herein constitutes an independent and distinct public disclosure fact.

1. **Non-blocking State Isolation & Distributed Writeback for Asynchronous Human-AI Co-authoring (Markdown SSOT)**
This technology mitigates race conditions arising from concurrent human and LLM Agent editing on a Single Source of Truth (SSOT). It introduces a Buffer Cache and an Exclusive File Locking mechanism. Metadata generated by CI/LLM is isolated via `.system/index.json`. Writebacks are buffered and utilize internal file locks, ensuring human edit priority and preventing Markdown AST corruption.
* **[Implementation Reference]** See `/backend/ci-watcher/`, `/cli/commands/ci.ts`, and `.system/index.json`.

2. **Multi-stage Pipeline Dynamic Type-Checking with Four-Corner Grid Topology (B-Key HUD Bag)**
* **Visual Topology:** Features a rigid "Four-Corner Metadata Layout" (Top-Left: INPUT core schema; Top-Right: OUTPUT core schema; Center: Function identifier; Bottom-Left: Unique ID; Bottom-Right: Dynamic lifecycle status).
* **Validation Logic:** Driven by standard JSON Schema definitions. When modules are chained into a pipeline, the engine recursively verifies compatibility via Depth-First Search (DFS), intercepting nested object mismatches in-memory, throwing a system-level `TypeMismatchException` and rendering the error topology.
* **[Implementation Reference]** See `/backend/type-checker/` and module READMEs under `/modules/`.

3. **Rigid HUD Interaction Layer Governed by Shneiderman's Eight Golden Rules and the Bounded-Path Principle**
* **Cross-Domain Adaption & Homogeneous Serving:** Maps a rigid 7-key global layout (F1 to F5, B, and M) directly to a full-screen, non-modal three-column HUD panel. The backend Express server utilizes static serving to keep HUD resources within the Same-Origin boundary, completely eliminating CORS vulnerabilities and enabling secure environment variable injection.
* **Bounded-Depth Information Topology:** Hard-codes Ben Shneiderman’s Eight Golden Rules and the UX Bounded-Path Principle directly into the system control flow. Confining all schema states within a shallow tier allows users to traverse metadata components within a minimal, strictly bounded number of discrete keystrokes, limiting the path depth to a near-constant factor ($O(1)$ efficiency). Upon a `TypeMismatchException`, the HUD renders a high-contrast visual matrix and enables a single-keystroke rollback to the last verified stable SSOT cache state.
* **[Implementation Reference]** See `/frontend/` interaction layouts and `/backend/server.ts`.

4. **Closed-Loop Data Pipeline for Card-Based Test Monitoring (F3 HUD)**
Test suites are transformed into gamified cards with star ratings and details. The backend intercepts Vitest runtime telemetry (`vitest --json`) as a dynamic data stream, translating asynchronous test statuses into card states and enabling closed-loop writebacks to update the README.md automatically.
* **[Implementation Reference]** See `/frontend/panel-tests.html` and `/cli/commands/test.ts`.

5. **Dual-Layer Asynchronous Markdown Specification with Mutation-Driven Semantic Cache (Module Spec)**
* **Technical Topology:** A dual-layer inline layout within a single physical Markdown document, unifying structural YAML Front Matter with functional, machine-executable JSON `//INPUT` and `//OUTPUT` declaration blocks.
* **Distinctive Innovation (vs. Google OKF):** While aligned with the core philosophy of Google's Open Knowledge Format (OKF), this technology uniquely extends it into a runtime execution and validation ecosystem. It implements a Chokidar file-system watcher to detect file mutations, flagging edited code-blocks as "Stale" and triggering a non-blocking background thread to compute OpenAI Embeddings, updating `.system/vector-cache.json` for eventual consistency.
* **[Implementation Reference]** See `/backend/parser/metadata-parser.ts`, `/backend/vector/`, and `.system/vector-cache.json`.

*Note: In the event of any discrepancy or inconsistency between the English version and the Chinese version of this declaration, the English version shall prevail.*

</details>

---

## 授權 (Licensing)

本專案之原始碼、文件、UI 設計概念及 HUD 規格圖，全專案統一採用 **[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](./LICENSE)** 國際公共授權條款。

### 核心法律約束：
1. **非商業性限制 (Non-Commercial)**：任何第三方個人或組織，皆**不得**直接或間接將本專案（包含代碼與文件）之全部或部分內容、衍生變形物，用於任何商業營利目的、公司內部營運生產、或付費服務之組成架構。
2. **相同方式分享 (ShareAlike)**：於非商業範疇下之任何修改與衍生改作，皆必須以同等嚴格之 `CC BY-NC-SA 4.0` 條款完全開源，且不得強加額外限制。

---

### 👑 著作權人聲明 (Copyright Holder Statement)

1. **原作者特權**：本儲存庫之創作者為本專案全體資產之唯一原始著作權人（Copyright Holder）。上述之非商業性（NC）限制僅適用於第三方公眾。原作者得不受此條款限制，並完全保留未來隨時將本專案進行商業化、轉化為商業服務、變更授權模式或打包販售之完整、排他性法定權利。
2. **禁止未授權商用**：目前本專案**不對外開放任何形式之商業授權**。未經原作者書面明示許可，任何組織將本專案組件部署於營利、商業環境或用於任何公司內部生產力工作流程之行為，均直接構成故意侵犯著作權與專利防禦宣告，原作者將依法追究全球法律責任。

© 2026 LLM WIKI Contributors
