"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode
} from "react";
import { normalizeNumericDraft, parseNumericDraft } from "@/lib/numericInput";

interface NumericFieldHandle {
  element: () => HTMLInputElement | null;
  isPending: () => boolean;
  validate: () => boolean;
}

export interface NumericDraftForm {
  hasPending: boolean;
  notify: () => void;
  register: (id: string, handle: NumericFieldHandle) => () => void;
  validateAll: () => boolean;
}

const NumericDraftContext = createContext<NumericDraftForm | null>(null);

export function useNumericDraftForm(): NumericDraftForm {
  const fieldsRef = useRef(new Map<string, NumericFieldHandle>());
  const [hasPending, setHasPending] = useState(false);
  const notify = useCallback(() => {
    setHasPending([...fieldsRef.current.values()].some((field) => field.isPending()));
  }, []);
  const register = useCallback((id: string, handle: NumericFieldHandle) => {
    fieldsRef.current.set(id, handle);
    notify();
    return () => {
      fieldsRef.current.delete(id);
      notify();
    };
  }, [notify]);
  const validateAll = useCallback(() => {
    const invalid = [...fieldsRef.current.values()].filter((field) => !field.validate());
    if (invalid.length === 0) {
      return true;
    }
    invalid.sort((left, right) => {
      const leftElement = left.element();
      const rightElement = right.element();
      if (!leftElement || !rightElement || leftElement === rightElement) {
        return 0;
      }
      return leftElement.compareDocumentPosition(rightElement) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    const first = invalid[0].element();
    window.requestAnimationFrame(() => {
      first?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      first?.focus({ preventScroll: true });
    });
    notify();
    return false;
  }, [notify]);

  return useMemo(() => ({ hasPending, notify, register, validateAll }), [hasPending, notify, register, validateAll]);
}

export function NumericDraftProvider({ children, form }: { children: ReactNode; form: NumericDraftForm }) {
  return <NumericDraftContext.Provider value={form}>{children}</NumericDraftContext.Provider>;
}

export function NumericDraftNotice({ className = "" }: { className?: string }) {
  const form = useContext(NumericDraftContext);
  if (!form?.hasPending) {
    return null;
  }
  return (
    <p className={`rounded border border-amber/35 bg-amber/10 px-3 py-2 text-xs font-medium text-warning ${className}`} role="status" aria-live="polite">
      有未确认的数字，当前计算沿用上次有效值
    </p>
  );
}

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "max" | "min" | "onChange" | "step" | "type" | "value"
>;

export interface NumericInputProps extends NativeInputProps {
  blankValue?: null | undefined;
  formatValue?: (value: number) => number | string;
  formatKey?: string;
  integer?: boolean;
  label: string;
  max?: number;
  min?: number;
  minExclusive?: number;
  onErrorChange?: (error: string | null) => void;
  onValueChange: (value: number | null | undefined) => void;
  registerInScope?: boolean;
  required?: boolean;
  showError?: boolean;
  toValue?: (displayValue: number) => number;
  validateValue?: (displayValue: number) => string | null;
  value: number | null | undefined;
}

function displayText(value: number | null | undefined, formatValue?: NumericInputProps["formatValue"]): string {
  if (value == null || !Number.isFinite(value)) {
    return "";
  }
  return String(formatValue ? formatValue(value) : value);
}

export function NumericInput({
  blankValue,
  className = "",
  formatValue,
  formatKey,
  integer = false,
  inputMode = "decimal",
  label,
  max,
  min,
  minExclusive,
  onBlur,
  onErrorChange,
  onFocus,
  onKeyDown,
  onValueChange,
  registerInScope = true,
  required = false,
  showError = true,
  toValue = (number) => number,
  validateValue,
  value,
  ...inputProps
}: NumericInputProps) {
  const scope = useContext(NumericDraftContext);
  const notifyScope = registerInScope ? scope?.notify : undefined;
  const registerField = registerInScope ? scope?.register : undefined;
  const errorId = useId();
  const fieldId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const pendingRef = useRef(false);
  const initialDraft = displayText(value, formatValue);
  const snapshotRef = useRef<{ text: string; value: number | null | undefined }>({ text: initialDraft, value });
  const valueChangeRef = useRef(onValueChange);
  const errorChangeRef = useRef(onErrorChange);
  const formatValueRef = useRef(formatValue);
  const draftRef = useRef(initialDraft);
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<string | null>(null);

  useEffect(() => {
    valueChangeRef.current = onValueChange;
    errorChangeRef.current = onErrorChange;
    formatValueRef.current = formatValue;
  }, [formatValue, onErrorChange, onValueChange]);

  const reportError = useCallback((nextError: string | null) => {
    if (errorRef.current === nextError) {
      return;
    }
    errorRef.current = nextError;
    setError(nextError);
    errorChangeRef.current?.(nextError);
  }, []);

  const evaluate = useCallback((text: string) => {
    const parsed = parseNumericDraft(text);
    if (parsed.kind === "empty") {
      return required
        ? { valid: false as const, error: `请输入${label}` }
        : { valid: true as const, blank: true as const };
    }
    if (parsed.kind !== "valid") {
      return { valid: false as const, error: `${label}不是完整数字` };
    }
    if (integer && !Number.isInteger(parsed.value)) {
      return { valid: false as const, error: `${label}需为整数` };
    }
    if (minExclusive != null && parsed.value <= minExclusive) {
      return { valid: false as const, error: `${label}需大于 ${minExclusive}` };
    }
    if (min != null && parsed.value < min) {
      return { valid: false as const, error: max == null ? `${label}不能小于 ${min}` : `${label}需在 ${min}–${max} 之间` };
    }
    if (max != null && parsed.value > max) {
      return { valid: false as const, error: min == null ? `${label}不能大于 ${max}` : `${label}需在 ${min}–${max} 之间` };
    }
    const customError = validateValue?.(parsed.value);
    return customError
      ? { valid: false as const, error: customError }
      : { valid: true as const, blank: false as const, value: parsed.value };
  }, [integer, label, max, min, minExclusive, required, validateValue]);

  const validateCurrent = useCallback(() => {
    const result = evaluate(draftRef.current);
    if (!result.valid) {
      pendingRef.current = true;
      reportError(result.error);
      notifyScope?.();
      return false;
    }
    if (result.blank) {
      valueChangeRef.current(blankValue);
    }
    pendingRef.current = false;
    reportError(null);
    notifyScope?.();
    return true;
  }, [blankValue, evaluate, notifyScope, reportError]);

  const validateCurrentRef = useRef(validateCurrent);
  useEffect(() => {
    validateCurrentRef.current = validateCurrent;
  }, [validateCurrent]);

  useEffect(() => registerField?.(fieldId, {
    element: () => inputRef.current,
    isPending: () => pendingRef.current,
    validate: () => validateCurrentRef.current()
  }), [fieldId, registerField]);

  useEffect(() => {
    if (focusedRef.current) {
      return;
    }
    const nextDraft = displayText(value, formatValueRef.current);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    pendingRef.current = false;
    reportError(null);
    notifyScope?.();
  }, [formatKey, notifyScope, reportError, value]);

  function handleChange(nextText: string) {
    const normalized = normalizeNumericDraft(nextText);
    draftRef.current = normalized;
    setDraft(normalized);
    const result = evaluate(normalized);
    if (result.valid && !result.blank) {
      pendingRef.current = false;
      reportError(null);
      valueChangeRef.current(toValue(result.value));
    } else {
      pendingRef.current = true;
    }
    notifyScope?.();
  }

  const errorVisible = Boolean(error);

  return (
    <>
      <input
        {...inputProps}
        ref={inputRef}
        type="text"
        inputMode={inputMode}
        value={draft}
        aria-invalid={errorVisible || undefined}
        aria-describedby={errorVisible && showError ? errorId : inputProps["aria-describedby"]}
        className={`${className} ${errorVisible ? "!border-rose focus:!border-rose focus:!ring-rose/20" : ""}`}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={(event) => {
          focusedRef.current = true;
          snapshotRef.current = { text: draftRef.current, value };
          onFocus?.(event);
        }}
        onBlur={(event) => {
          focusedRef.current = false;
          validateCurrent();
          onBlur?.(event);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            draftRef.current = snapshotRef.current.text;
            setDraft(snapshotRef.current.text);
            valueChangeRef.current(snapshotRef.current.value);
            pendingRef.current = false;
            reportError(null);
            notifyScope?.();
          }
          onKeyDown?.(event);
        }}
      />
      {errorVisible && showError ? <span id={errorId} className="mt-1 block text-[11px] leading-tight text-danger" role="alert">{error}</span> : null}
    </>
  );
}
