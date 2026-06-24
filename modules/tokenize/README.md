---
id: 001
name: tokenize
status: DONE
latency: ~12ms
author: alice
created: 2025-06-18
updated: 2025-06-18
tags: [nlp, tokenizer, preprocessing, bpe]
---

# tokenize()

文字切詞模組，使用 BPE（Byte-Pair Encoding）分詞演算法。
支援中英文混合輸入，輸出正規化 token 陣列。

```json //INPUT
{
  "type": "string",
  "description": "原始輸入文字，支援中英文混合",
  "example": "LLM WIKI 是人機協作系統"
}
```

```json //OUTPUT
{
  "type": "array",
  "items": { "type": "string" },
  "description": "切詞後的 token 陣列",
  "example": ["LLM", "WIKI", "是", "人機", "協作", "系統"]
}
```

## 使用範例

```typescript
import { tokenize } from './index';

const tokens = await tokenize('LLM WIKI 是人機協作系統');
// → ['LLM', 'WIKI', '是', '人機', '協作', '系統']
```

## 效能記錄

| 環境        | 測試輸入長度 | 平均延遲 | P99 延遲 |
|------------|------------|---------|---------|
| Production | 512 tokens | 12ms    | 18ms    |
| Production | 2048 tokens| 38ms    | 52ms    |

## CI 測試記錄

- 2025-06-18: status=DONE lat=12ms (ci-bot)
