---
id: 002
name: embedVec
status: DONE
latency: ~45ms
author: bob
created: 2025-06-18
updated: 2025-06-18
tags: [embedding, vector, semantic, openai]
---

# embedVec()

語意向量化模組。將 token 陣列轉換為高維語意嵌入向量。
預設使用 OpenAI text-embedding-3-small（1536 維）。

```json //INPUT
{
  "type": "array",
  "items": { "type": "string" },
  "description": "token 陣列（來自 tokenize() 輸出）",
  "example": ["LLM", "WIKI", "人機", "協作"]
}
```

```json //OUTPUT
{
  "type": "array",
  "items": { "type": "number" },
  "description": "1536 維語意嵌入向量",
  "minItems": 1536,
  "maxItems": 1536
}
```

## 串接範例

```typescript
// tokenize → embedVec pipeline
const { tokens } = await tokenize({ text: '人機協作知識庫' });
const embedding  = await embedVec({ tokens });
// embedding.length === 1536
```

## CI 測試記錄

- 2025-06-18: status=DONE lat=45ms (ci-bot)
