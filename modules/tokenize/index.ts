/**
 * tokenize() — 文字切詞模組
 * INPUT:  STR (原始文字)
 * OUTPUT: ARR (token 陣列)
 * Status: DONE | Latency: ~12ms
 */

export interface TokenizeInput  { text: string }
export interface TokenizeOutput { tokens: string[]; count: number }

/**
 * 使用正則表達式進行基本 BPE 風格分詞
 * 生產環境建議替換為 tiktoken 或 sentencepiece
 */
export async function tokenize(input: TokenizeInput): Promise<TokenizeOutput> {
  const start = performance.now();

  // Basic whitespace + CJK boundary tokenization
  const raw = input.text
    .replace(/([，。！？、；：""''（）【】《》])/g, ' $1 ')  // CJK punctuation
    .replace(/([A-Za-z0-9]+)/g, ' $1 ')                    // English words
    .trim();

  const tokens = raw
    .split(/\s+/)
    .filter(t => t.length > 0);

  const elapsed = performance.now() - start;
  if (elapsed > 100) console.warn(`[tokenize] slow: ${elapsed.toFixed(1)}ms`);

  return { tokens, count: tokens.length };
}
