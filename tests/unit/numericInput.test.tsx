import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { NumericDraftNotice, NumericDraftProvider, NumericInput, useNumericDraftForm } from "@/components/NumericInput";
import { normalizeNumericDraft, parseNumericDraft, roundForStorage } from "@/lib/numericInput";

describe("numeric input parser", () => {
  it("normalizes full-width digits, punctuation, spaces and thousands separators", () => {
    expect(normalizeNumericDraft(" １，２００．５０ ")).toBe("1200.50");
    expect(parseNumericDraft(".5")).toMatchObject({ kind: "valid", value: 0.5 });
    expect(parseNumericDraft("12.")).toMatchObject({ kind: "incomplete" });
    expect(parseNumericDraft("-")).toMatchObject({ kind: "incomplete" });
    expect(parseNumericDraft("1e6")).toMatchObject({ kind: "invalid" });
  });

  it("rounds only at the explicit storage boundary", () => {
    expect(roundForStorage(12.3456, 2)).toBe(12.35);
    expect(roundForStorage(2.5555, 3)).toBe(2.556);
  });
});

function NumericHarness({ initial = 42, required = true, blankValue }: { initial?: number | null; required?: boolean; blankValue?: null | undefined }) {
  const form = useNumericDraftForm();
  const [value, setValue] = useState<number | null | undefined>(initial);
  const [saved, setSaved] = useState<boolean | null>(null);
  return (
    <NumericDraftProvider form={form}>
      <NumericInput
        aria-label="测试数值"
        blankValue={blankValue}
        className="field"
        label="测试数值"
        min={0}
        required={required}
        value={value}
        onValueChange={setValue}
      />
      <output aria-label="domain-value">{value == null ? "blank" : value}</output>
      <NumericDraftNotice />
      <button type="button" onClick={() => setSaved(form.validateAll())}>保存</button>
      <output aria-label="save-result">{saved == null ? "idle" : String(saved)}</output>
    </NumericDraftProvider>
  );
}

describe("NumericInput", () => {
  it("keeps intermediate drafts visible and calculations on the last valid value", () => {
    render(<NumericHarness />);
    const input = screen.getByRole("textbox", { name: "测试数值" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "12." } });
    expect(input).toHaveValue("12.");
    expect(screen.getByLabelText("domain-value")).toHaveTextContent("42");
    expect(screen.getByText("有未确认的数字，当前计算沿用上次有效值")).toBeInTheDocument();
    fireEvent.blur(input);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("测试数值不是完整数字")).toBeInTheDocument();
  });

  it("updates complete values live and Escape restores the pre-edit value", () => {
    render(<NumericHarness />);
    const input = screen.getByRole("textbox", { name: "测试数值" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "１，２００．５" } });
    expect(input).toHaveValue("1200.5");
    expect(screen.getByLabelText("domain-value")).toHaveTextContent("1200.5");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("42");
    expect(screen.getByLabelText("domain-value")).toHaveTextContent("42");
  });

  it("commits optional blanks on blur and blocks an empty required field on save", () => {
    const optional = render(<NumericHarness required={false} blankValue={null} />);
    let input = screen.getByRole("textbox", { name: "测试数值" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByLabelText("domain-value")).toHaveTextContent("42");
    fireEvent.blur(input);
    expect(screen.getByLabelText("domain-value")).toHaveTextContent("blank");

    optional.unmount();
    render(<NumericHarness initial={null} required />);
    input = screen.getByRole("textbox", { name: "测试数值" });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByLabelText("save-result")).toHaveTextContent("false");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
