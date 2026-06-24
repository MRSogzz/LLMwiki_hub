---
title: LLM WIKI System Overview
status: DONE
author: alice
created: 2025-06-18
tags: [architecture, overview, ssot, hud]
---

# LLM WIKI — 系統總覽

## 核心原則

1. **Markdown First** — 所有資料以 `.md` 文件為主，禁止傳統關聯式資料庫儲存結構
2. **Git 為時間軸** — 版本控制即日誌，時間戳即先前技術防禦
3. **LLM 為協作者** — AI 生成草稿，人工審核後 commit
4. **HUD 介面** — 六個快捷鍵模組覆蓋完整工作流

## 三層架構

```
前端 HUD 層  ←→  後端引擎層  ←→  資料層 (SSOT)
```

### 前端層（六個 HUD 面板）

| 按鍵 | 面板       | 職責                    |
|------|-----------|------------------------|
| F1   | 個人日誌 | 個人 Markdown 筆記      |
| F2   | 聯機大廳  | Git 協作看板            |
| F3   | 知識圖鑑  | 知識庫搜尋（Fuzzy+向量） |
| F4   | 專案時程活動  | 里程碑進度追蹤           |
| B    | 模組背包  | 代碼 I/O 週期表         |
| M    | 知識雷達  | 三層目錄地圖            |

### 後端層（四個引擎）

- **MetadataParser** — chokidar 監聽 + gray-matter 解析 YAML
- **TypeChecker** — 動態型別相容矩陣，拋出 TypeMismatchException
- **CIWatcher** — 生產環境 Latency 捕獲 + Markdown writeback
- **VectorIndex** — OpenAI Embedding + 餘弦相似度搜尋

### 資料層（Markdown SSOT）

```
modules/*/README.md     ← 代碼模組規格（YAML + I/O JSON Block）
docs/**/*.md            ← 知識庫文件（Domain/Topic/Doc 三層）
.system/index.json      ← 解析後的模組索引（自動生成）
.system/vector-cache.json ← 向量快取（自動生成）
.system/user/notes/     ← F1 個人筆記
milestones/*.md         ← F4 里程碑文件
```
