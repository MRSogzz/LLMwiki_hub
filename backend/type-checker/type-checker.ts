/**
 * LLM WIKI — Dynamic Type Checker
 * ─────────────────────────────────────────────────────────────────────────────
 * 職責：校驗兩個代碼模組串接時的 I/O 型別相容性。
 *       當 Module_A.OUTPUT.type 與 Module_B.INPUT.type 不相容時，
 *       拋出 TypeMismatchException，前端接收後顯示紅色預警。
 *
 * 核心公式：
 *   Module_A.OUTPUT.Schema 必須與 Module_B.INPUT.Schema 100% 相容
 */

import fss from 'fs';
import type { IOType, ModuleMeta } from '../parser/metadata-parser.js';

// ── Custom Exception ──────────────────────────────────────────────────────────

export class TypeMismatchException extends Error {
  public readonly moduleA:    string;
  public readonly moduleB:    string;
  public readonly outputType: IOType;
  public readonly inputType:  IOType;

  constructor(moduleA: string, moduleB: string, outputType: IOType, inputType: IOType) {
    super(
      `TypeMismatchException: Cannot connect ${moduleA}() → ${moduleB}(). ` +
      `Output [${outputType}] is incompatible with input [${inputType}].`
    );
    this.name       = 'TypeMismatchException';
    this.moduleA    = moduleA;
    this.moduleB    = moduleB;
    this.outputType = outputType;
    this.inputType  = inputType;
  }
}

// ── Compatibility Matrix ──────────────────────────────────────────────────────
//
// compatibilityMatrix[OUTPUT_TYPE][INPUT_TYPE] = compatible?
//
// Rules:
//   - Same type → always compatible.
//   - ANY (either side) → always compatible.
//   - NUM is a superset of INT and FLOAT.
//   - All other cross-type connections are STRICT (false).

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

// ── Core compatibility check ──────────────────────────────────────────────────

export function isTypeCompatible(outputType: IOType, inputType: IOType): boolean {
  if (outputType === 'ANY' || inputType === 'ANY') return true;
  return compatibilityMatrix[outputType]?.[inputType] === true;
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
  message:            string;
  adapterSuggestion?: string;
}

export function validateConnection(
  moduleA: ModuleMeta,
  moduleB: ModuleMeta,
  strict  = false,
): ConnectionResult {
  const outputType = moduleA.output.type as IOType;
  const inputType  = moduleB.input.type  as IOType;
  const compatible = isTypeCompatible(outputType, inputType);

  if (!compatible && strict) {
    throw new TypeMismatchException(moduleA.name, moduleB.name, outputType, inputType);
  }

  return {
    compatible,
    outputType,
    inputType,
    message: compatible
      ? `✓ ${moduleA.name}() [${outputType}] → ${moduleB.name}() [${inputType}] — Compatible`
      : `✗ TypeMismatch: ${moduleA.name}() outputs [${outputType}] but ${moduleB.name}() requires [${inputType}]`,
    adapterSuggestion: compatible ? undefined : suggestAdapter(outputType, inputType),
  };
}

// ── Pipeline validator ────────────────────────────────────────────────────────

export interface PipelineValidationResult {
  valid:        boolean;
  steps:        ConnectionResult[];
  firstError?:  ConnectionResult;
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

// ── CLI demo (ESM-compatible) ─────────────────────────────────────────────────

const isMain = process.argv[1] && fss.realpathSync(process.argv[1]).includes('type-checker');
if (isMain) {
  // Demo: valid pipeline STR → ARR → ARR → FLOAT → ARR
  type DemoModule = { name: string; input: { type: IOType }; output: { type: IOType } };
  const demo: DemoModule[] = [
    { name: 'tokenize',  input: { type: 'STR'   }, output: { type: 'ARR'   } },
    { name: 'embedVec',  input: { type: 'ARR'   }, output: { type: 'ARR'   } },
    { name: 'cosSim',    input: { type: 'ARR'   }, output: { type: 'FLOAT' } },
    { name: 'rankDocs',  input: { type: 'FLOAT' }, output: { type: 'ARR'   } },
  ];

  console.log('\n── Valid Pipeline Demo ──');
  for (let i = 0; i < demo.length - 1; i++) {
    const r = validateConnection(demo[i]! as unknown as ModuleMeta, demo[i+1]! as unknown as ModuleMeta);
    console.log(r.message);
  }

  console.log('\n── Mismatch Demo ──');
  try {
    validateConnection(
      { name: 'renderMD', output: { type: 'STR' } } as unknown as ModuleMeta,
      { name: 'cosSim',   input:  { type: 'ARR' } } as unknown as ModuleMeta,
      true,
    );
  } catch (e) {
    if (e instanceof TypeMismatchException) {
      console.error(e.message);
      console.log('Adapter:', suggestAdapter(e.outputType, e.inputType));
    }
  }
}
