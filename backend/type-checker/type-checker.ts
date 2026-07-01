/**
 * LLM WIKI — Dynamic Type Checker  (v2)
 * ─────────────────────────────────────────────────────────────────────────────
 * 修正漏洞：isTypeCompatible 現在遞迴校驗完整 IOSchema，
 * 包含 items（ARR 元素型別）與 properties（OBJ 欄位型別）。
 *
 * 相容性規則（三層）：
 *   Layer 1 — 頂層 type 必須相容（ANY 萬用、NUM ⊇ INT∪FLOAT）
 *   Layer 2 — ARR：若雙方都有 items，items.type 也必須遞迴相容
 *   Layer 3 — OBJ：若 B 聲明 required 欄位，A 的 properties 必須全數包含且型別相容
 *             若 B 無 required（或無 properties），視為 OBJ 泛型相容
 *
 * 設計決策：
 *   - 「Output 比 Input 多欄位」允許（寬鬆方向，實務上常見）
 *   - 「Output 缺少 Input required 欄位」拒絕（TypeMismatchException）
 *   - items 缺失一方視為 ARR<ANY>，相容
 */

import fss from 'fs';
import type { IOType, IOSchema, ModuleMeta } from '../parser/metadata-parser.js';

// ── Custom Exception ──────────────────────────────────────────────────────────

export class TypeMismatchException extends Error {
  public readonly moduleA:    string;
  public readonly moduleB:    string;
  public readonly outputType: IOType;
  public readonly inputType:  IOType;
  public readonly reason:     string;   // ← 新增：說明哪一層不相容

  constructor(
    moduleA:    string,
    moduleB:    string,
    outputType: IOType,
    inputType:  IOType,
    reason      = '',
  ) {
    super(
      `TypeMismatchException: Cannot connect ${moduleA}() → ${moduleB}(). ` +
      `Output [${outputType}] is incompatible with input [${inputType}].` +
      (reason ? ` (${reason})` : ''),
    );
    this.name       = 'TypeMismatchException';
    this.moduleA    = moduleA;
    this.moduleB    = moduleB;
    this.outputType = outputType;
    this.inputType  = inputType;
    this.reason     = reason;
  }
}

// ── Layer 1: Top-level IOType compatibility matrix ────────────────────────────

const compatibilityMatrix: Record<IOType, Partial<Record<IOType, boolean>>> = {
  STR:   { STR: true,                                       ANY: true },
  INT:   { INT: true,  NUM: true,                           ANY: true },
  FLOAT: { FLOAT: true,NUM: true,                           ANY: true },
  BOOL:  { BOOL: true,                                      ANY: true },
  ARR:   { ARR: true,                                       ANY: true },
  OBJ:   { OBJ: true,                                       ANY: true },
  NUM:   { NUM: true,  INT: true, FLOAT: true,              ANY: true },
  ANY:   { STR: true,  INT: true, FLOAT: true, BOOL: true,
           ARR: true,  OBJ: true, NUM: true,   ANY: true            },
};

function topLevelCompatible(out: IOType, inp: IOType): boolean {
  if (out === 'ANY' || inp === 'ANY') return true;
  return compatibilityMatrix[out]?.[inp] === true;
}

// ── Layer 2 & 3: Recursive schema compatibility ───────────────────────────────

/**
 * 完整 IOSchema 相容性校驗，回傳 { ok, reason }
 * ok     = true  → 相容
 * reason = string → 不相容的具體原因（供前端顯示）
 */
export function schemaCompatible(
  out: IOSchema,
  inp: IOSchema,
): { ok: boolean; reason: string } {

  const outType = out.type;
  const inpType = inp.type;

  // ── Layer 1: 頂層 type ───────────────────────────────────────────────────
  if (!topLevelCompatible(outType, inpType)) {
    return {
      ok:     false,
      reason: `頂層型別不符：output [${outType}] → input [${inpType}]`,
    };
  }

  // ── Layer 2: ARR 元素型別 ────────────────────────────────────────────────
  // 若雙方頂層都是 ARR（或相容 ARR 的 ANY），才進入 items 校驗
  const bothArr = (outType === 'ARR' || outType === 'ANY') &&
                  (inpType === 'ARR' || inpType === 'ANY') &&
                  outType === 'ARR' && inpType === 'ARR';

  if (bothArr && out.items && inp.items) {
    // items.type 是 JSON Schema 原始字串（"string"/"number"/"object"...）
    // 需要對應到 IOType
    const outItem = jsonSchemaTypeToIOType(out.items.type);
    const inpItem = jsonSchemaTypeToIOType(inp.items.type);
    if (!topLevelCompatible(outItem, inpItem)) {
      return {
        ok:     false,
        reason: `ARR 元素型別不符：items [${outItem}] → items [${inpItem}]`,
      };
    }
  }
  // 一方有 items 另一方沒有 → 視為 ARR<ANY>，允許

  // ── Layer 3: OBJ 欄位結構 ────────────────────────────────────────────────
  const bothObj = outType === 'OBJ' && inpType === 'OBJ';

  if (bothObj && inp.required?.length && inp.properties) {
    // B 聲明了 required 欄位 → A 的 properties 必須全數包含且型別相容
    const outProps = out.properties ?? {};

    for (const field of inp.required) {
      const inpField = inp.properties[field];
      const outField = outProps[field];

      if (!outField) {
        return {
          ok:     false,
          reason: `OBJ 缺少必要欄位：output 沒有 "${field}"（input required）`,
        };
      }

      const outFT = jsonSchemaTypeToIOType(outField.type);
      const inpFT = jsonSchemaTypeToIOType(inpField!.type);

      if (!topLevelCompatible(outFT, inpFT)) {
        return {
          ok:     false,
          reason: `OBJ 欄位型別不符："${field}" output [${outFT}] → input [${inpFT}]`,
        };
      }
    }
  }
  // inp 無 required / 無 properties → OBJ 泛型相容，允許

  return { ok: true, reason: '' };
}

// ── JSON Schema type string → IOType ─────────────────────────────────────────
// 處理 items.type 和 properties[x].type 的原始 JSON Schema 字串

export function jsonSchemaTypeToIOType(t: string | undefined): IOType {
  switch ((t ?? '').toLowerCase()) {
    case 'string':  return 'STR';
    case 'integer': return 'INT';
    case 'number':  return 'NUM';
    case 'float':   return 'FLOAT';
    case 'boolean': return 'BOOL';
    case 'array':   return 'ARR';
    case 'object':  return 'OBJ';
    default:        return 'ANY';   // 未知 → 最寬鬆
  }
}

// ── Convenience: 只回傳 boolean（向下相容舊呼叫）────────────────────────────
export function isTypeCompatible(out: IOType, inp: IOType): boolean {
  return topLevelCompatible(out, inp);
}

// ── Adapter suggestion ────────────────────────────────────────────────────────

export function suggestAdapter(from: IOType, to: IOType): string {
  const adapters: Partial<Record<string, string>> = {
    'STR→INT':   'parseInt(value, 10)',
    'STR→FLOAT': 'parseFloat(value)',
    'STR→ARR':   'value.split(",")',
    'STR→OBJ':   'JSON.parse(value)',
    'INT→STR':   'String(value)',
    'FLOAT→STR': 'value.toFixed(2)',
    'FLOAT→INT': 'Math.round(value)',
    'ARR→STR':   'value.join(",")',
    'ARR→OBJ':   'Object.fromEntries(value.entries())',
    'OBJ→STR':   'JSON.stringify(value)',
    'OBJ→ARR':   'Object.values(value)',
    'BOOL→INT':  'Number(value)',
    'BOOL→STR':  'String(value)',
  };
  return adapters[`${from}→${to}`] ?? `TypeAdapter<${from}, ${to}>(value)`;
}

// ── Module connection validator ───────────────────────────────────────────────

export interface ConnectionResult {
  compatible:         boolean;
  outputType:         IOType;
  inputType:          IOType;
  reason:             string;   // 不相容原因（相容時為空字串）
  message:            string;
  adapterSuggestion?: string;
}

export function validateConnection(
  moduleA: ModuleMeta,
  moduleB: ModuleMeta,
  strict  = false,
): ConnectionResult {
  const outputType = moduleA.output.type;
  const inputType  = moduleB.input.type;

  // ← 改用 schemaCompatible，傳入完整 IOSchema
  const { ok: compatible, reason } = schemaCompatible(moduleA.output, moduleB.input);

  if (!compatible && strict) {
    throw new TypeMismatchException(moduleA.name, moduleB.name, outputType, inputType, reason);
  }

  return {
    compatible,
    outputType,
    inputType,
    reason,
    message: compatible
      ? `✓ ${moduleA.name}() [${outputType}] → ${moduleB.name}() [${inputType}] — Compatible`
      : `✗ TypeMismatch: ${moduleA.name}() → ${moduleB.name}() — ${reason}`,
    adapterSuggestion: compatible ? undefined : suggestAdapter(outputType, inputType),
  };
}

// ── Pipeline validator ────────────────────────────────────────────────────────

export interface PipelineValidationResult {
  valid:       boolean;
  steps:       ConnectionResult[];
  firstError?: ConnectionResult;
}

export function validatePipeline(modules: ModuleMeta[]): PipelineValidationResult {
  if (modules.length < 2) return { valid: true, steps: [] };

  const steps: ConnectionResult[] = [];
  for (let i = 0; i < modules.length - 1; i++) {
    steps.push(validateConnection(modules[i]!, modules[i + 1]!, false));
  }

  const firstError = steps.find(s => !s.compatible);
  return { valid: !firstError, steps, firstError };
}

// ── CLI demo ──────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fss.realpathSync(process.argv[1]).includes('type-checker');
if (isMain) {
  type Demo = Pick<ModuleMeta, 'name' | 'input' | 'output'>;

  console.log('\n── Layer 1: 頂層型別校驗 ──');
  const demo1: Demo[] = [
    { name: 'tokenize', input: { type: 'STR' }, output: { type: 'ARR' } },
    { name: 'embedVec', input: { type: 'ARR' }, output: { type: 'ARR' } },
    { name: 'cosSim',   input: { type: 'ARR' }, output: { type: 'FLOAT' } },
  ];
  for (let i = 0; i < demo1.length - 1; i++) {
    const r = validateConnection(demo1[i] as ModuleMeta, demo1[i+1] as ModuleMeta);
    console.log(r.message);
  }

  console.log('\n── Layer 2: ARR items 校驗 ──');
  const arrStrOut: Demo = { name: 'A', input: { type: 'ARR' }, output: { type: 'ARR', items: { type: 'string' } } };
  const arrObjIn:  Demo = { name: 'B', input: { type: 'ARR', items: { type: 'object' } }, output: { type: 'ARR' } };
  const r2 = validateConnection(arrStrOut as ModuleMeta, arrObjIn as ModuleMeta);
  console.log(r2.message, r2.reason ? `→ ${r2.reason}` : '');

  console.log('\n── Layer 3: OBJ properties 校驗 ──');
  const objOut: Demo = {
    name: 'C', input: { type: 'OBJ' },
    output: { type: 'OBJ', properties: { name: { type: 'string' }, score: { type: 'number' } } },
  };
  const objIn: Demo = {
    name: 'D',
    input: { type: 'OBJ', properties: { name: { type: 'string' }, id: { type: 'integer' } }, required: ['name','id'] },
    output: { type: 'OBJ' },
  };
  const r3 = validateConnection(objOut as ModuleMeta, objIn as ModuleMeta);
  console.log(r3.message, r3.reason ? `→ ${r3.reason}` : '');
}