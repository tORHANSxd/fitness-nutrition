export type NumericDraftResult =
  | { kind: "empty"; normalized: "" }
  | { kind: "incomplete"; normalized: string }
  | { kind: "invalid"; normalized: string }
  | { kind: "valid"; normalized: string; value: number };

const fullWidthZeroCode = "０".charCodeAt(0);
const asciiZeroCode = "0".charCodeAt(0);

export function normalizeNumericDraft(value: string): string {
  return value
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - fullWidthZeroCode + asciiZeroCode))
    .replace(/[．。]/g, ".")
    .replace(/[−–—]/g, "-")
    .replace(/[,，\s\u00a0]/g, "");
}

export function parseNumericDraft(value: string): NumericDraftResult {
  const normalized = normalizeNumericDraft(value);
  if (normalized === "") {
    return { kind: "empty", normalized };
  }
  if (normalized === "-" || normalized === "." || normalized === "-." || /^-?\d+\.$/.test(normalized)) {
    return { kind: "incomplete", normalized };
  }
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
    return { kind: "invalid", normalized };
  }
  const number = Number(normalized);
  return Number.isFinite(number)
    ? { kind: "valid", normalized, value: number }
    : { kind: "invalid", normalized };
}

export function roundForStorage(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
