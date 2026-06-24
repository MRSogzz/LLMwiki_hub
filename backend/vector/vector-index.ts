/**
 * LLM WIKI — Vector Index Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * 職責：將 status:DONE 的 Markdown 文件向量化，提供語意搜尋介面。
 *
 * 架構：
 *   1. 讀取 .system/index.json 中所有 DONE 模組
 *   2. 呼叫 OpenAI text-embedding-3-small API
 *   3. 以餘弦相似度進行最近鄰搜尋
 *   4. 結果快取於 .system/vector-cache.json
 *
 * 使用方式：
 *   import { vectorIndex } from './vector-index.js';
 *   await vectorIndex.build();
 *   const results = await vectorIndex.search('如何做型別校驗', 5);
 */

import fs  from 'fs/promises';
import fss from 'fs';
import path from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VectorEntry {
  id:        string;
  title:     string;
  path:      string;
  excerpt:   string;
  tags:      string[];
  status:    string;
  embedding: number[];
}

export interface SearchResult {
  entry:      VectorEntry;
  similarity: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_PATH  = path.resolve('.system/vector-cache.json');
const INDEX_PATH  = path.resolve('.system/index.json');
const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIM   = 1536;
const TOP_K       = 10;

// ── VectorIndex ───────────────────────────────────────────────────────────────

export class VectorIndex {
  private entries: VectorEntry[] = [];
  private built = false;

  /** Build or reload index from cache */
  async build(force = false): Promise<void> {
    if (!force && fss.existsSync(CACHE_PATH)) {
      const raw   = await fs.readFile(CACHE_PATH, 'utf-8');
      const cache = JSON.parse(raw) as { entries: VectorEntry[] };
      this.entries = cache.entries ?? [];
      this.built   = true;
      console.log(`[VectorIndex] loaded ${this.entries.length} entries from cache`);
      return;
    }

    if (!fss.existsSync(INDEX_PATH)) {
      console.warn('[VectorIndex] index.json not found — run metadata-parser first');
      return;
    }

    const raw   = await fs.readFile(INDEX_PATH, 'utf-8');
    const index = JSON.parse(raw) as Record<string, any>;
    const done  = Object.values(index).filter((m: any) => m.status === 'DONE');
    console.log(`[VectorIndex] embedding ${done.length} DONE modules…`);

    const BATCH = 20;
    for (let i = 0; i < done.length; i += BATCH) {
      const batch = done.slice(i, i + BATCH);
      const texts = batch.map((m: any) =>
        `${m.name} ${m.description ?? ''} INPUT:${m.input?.type} OUTPUT:${m.output?.type} ${(m.tags ?? []).join(' ')}`
      );
      const embeddings = await this.embedBatch(texts);
      batch.forEach((m: any, j: number) => {
        this.entries.push({
          id:        String(m.id),
          title:     `${m.name}()`,
          path:      `modules/${m.name}/README.md`,
          excerpt:   m.description ?? '',
          tags:      m.tags ?? [],
          status:    m.status,
          embedding: embeddings[j] ?? new Array(EMBED_DIM).fill(0),
        });
      });
    }

    await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
    await fs.writeFile(CACHE_PATH, JSON.stringify({
      built:   new Date().toISOString(),
      entries: this.entries,
    }, null, 2), 'utf-8');

    this.built = true;
    console.log(`[VectorIndex] built index — ${this.entries.length} entries`);
  }

  /** Semantic (vector) search */
  async search(query: string, topK = TOP_K): Promise<SearchResult[]> {
    if (!this.built) await this.build();
    if (!this.entries.length) return [];

    const [queryVec] = await this.embedBatch([query]);
    return this.entries
      .map(entry => ({ entry, similarity: cosineSimilarity(queryVec!, entry.embedding) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /** Fuzzy keyword search (no embedding required) */
  fuzzySearch(query: string, topK = TOP_K): SearchResult[] {
    if (!query.trim()) {
      return this.entries.slice(0, topK).map(entry => ({ entry, similarity: 1 }));
    }
    const q = query.toLowerCase();
    return this.entries
      .map(entry => ({
        entry,
        similarity: fuzzyScore(q, [entry.title, entry.excerpt, ...entry.tags].join(' ').toLowerCase()),
      }))
      .filter(r => r.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /** Call OpenAI Embeddings API; falls back to zero vectors in dev mode */
  private async embedBatch(texts: string[]): Promise<number[][]> {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      console.warn('[VectorIndex] OPENAI_API_KEY not set — using zero vectors (dev mode)');
      return texts.map(() => new Array(EMBED_DIM).fill(0));
    }

    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify({ model: EMBED_MODEL, input: texts }),
    });

    if (!res.ok) throw new Error(`[VectorIndex] embed API error: ${await res.text()}`);
    const data = await res.json() as { data: { embedding: number[] }[] };
    return data.data.map(d => d.embedding);
  }

  /** Invalidate cache and reset (call after CI writeback updates a module) */
  invalidateCache(): void {
    if (fss.existsSync(CACHE_PATH)) fss.unlinkSync(CACHE_PATH);
    this.entries = [];
    this.built   = false;
    console.log('[VectorIndex] cache invalidated');
  }

  get size(): number { return this.entries.length; }
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na  += a[i]! * a[i]!;
    nb  += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function fuzzyScore(query: string, text: string): number {
  let qi = 0;
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) qi++;
  }
  return qi === query.length ? qi / text.length : 0;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const vectorIndex = new VectorIndex();

// ── CLI entry ─────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fss.realpathSync(process.argv[1]).includes('vector-index');
if (isMain) {
  vectorIndex.build(true).catch(console.error);
}
