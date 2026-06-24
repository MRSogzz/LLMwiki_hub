/**
 * embedVec() — 語意向量化模組
 * INPUT:  ARR (token 陣列)
 * OUTPUT: ARR (1536-dim 嵌入向量)
 * Status: DONE | Latency: ~45ms
 */

export interface EmbedVecInput  { tokens: string[] }
export interface EmbedVecOutput { embedding: number[]; model: string; dim: number }

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIM   = 1536;

export async function embedVec(input: EmbedVecInput): Promise<EmbedVecOutput> {
  const apiKey = process.env.OPENAI_API_KEY;

  // Dev mode: return zero vector
  if (!apiKey) {
    console.warn('[embedVec] OPENAI_API_KEY not set — returning zero vector');
    return { embedding: new Array(EMBED_DIM).fill(0), model: EMBED_MODEL, dim: EMBED_DIM };
  }

  const text = input.tokens.join(' ');
  const res  = await fetch('https://api.openai.com/v1/embeddings', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body:    JSON.stringify({ model: EMBED_MODEL, input: text }),
  });

  if (!res.ok) throw new Error(`[embedVec] API error: ${await res.text()}`);

  const data = await res.json() as { data: [{ embedding: number[] }] };
  const embedding = data.data[0].embedding;

  return { embedding, model: EMBED_MODEL, dim: embedding.length };
}
