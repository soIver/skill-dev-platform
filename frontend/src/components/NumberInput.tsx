import { type ClipboardEvent, type KeyboardEvent } from "react";

type NumberInputMode = "integer" | "decimal";
type UnitForms = [string, string, string, string];

interface NumberInputProps {
  value: number | null | undefined;
  onChange: (value: number) => void;
  mode?: NumberInputMode;
  min?: number;
  max?: number;
  step?: number;
  unitForms?: UnitForms;
  className?: string;
  containerClassName?: string;
}

const integerAllowedCharPattern = /^[0-9]$/;
const decimalAllowedCharPattern = /^[0-9.,]$/;
const controlKeys = new Set(["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"]);

function getUnitWord(value: number, forms: UnitForms): string {
  const [zero, one, few, many] = forms;
  const integerValue = Math.abs(Math.trunc(value));
  if (integerValue === 0) return zero;

  const mod10 = integerValue % 10;
  const mod100 = integerValue % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function clamp(value: number, min?: number, max?: number): number {
  const withMin = min === undefined ? value : Math.max(value, min);
  return max === undefined ? withMin : Math.min(withMin, max);
}

function clampMax(value: number, max?: number): number {
  return max === undefined ? value : Math.min(value, max);
}

function parseIntegerValue(value: string, max?: number): number {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return 0;
  return clampMax(Number(digits), max);
}

function parseDecimalValue(value: string, fallback: number, max?: number): number {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (!digits) return 0;

  const normalized = digits.length === 1 ? digits : `${digits[0]}.${digits[1]}`;
  if (!/^(?:0(?:\.\d)?|1(?:\.0)?)$/.test(normalized)) {
    return fallback;
  }

  return clampMax(Number(normalized), max);
}

export function NumberInput({
  value,
  onChange,
  mode = "integer",
  min,
  max,
  step,
  unitForms,
  className = "input-field mt-0! w-full",
  containerClassName = "relative flex items-center",
}: NumberInputProps) {
  const currentValue = value ?? 0;
  const allowedCharPattern = mode === "decimal" ? decimalAllowedCharPattern : integerAllowedCharPattern;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      controlKeys.has(event.key) ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    if (mode === "decimal" && event.key === ",") {
      event.preventDefault();
      if (!event.currentTarget.value.includes(".")) {
        event.currentTarget.value = event.currentTarget.value ? `${event.currentTarget.value}.` : "0.";
      }
      return;
    }

    if (event.key.length === 1 && !allowedCharPattern.test(event.key)) {
      event.preventDefault();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasteData = event.clipboardData.getData("text");
    const allowedPastePattern = mode === "decimal" ? /^[0-9.,]+$/ : /^[0-9]+$/;
    if (!allowedPastePattern.test(pasteData)) {
      event.preventDefault();
      return;
    }

    if (mode === "decimal" && pasteData.includes(",")) {
      event.preventDefault();
      event.currentTarget.value = pasteData.replace(/,/g, ".");
      handleChange(event.currentTarget);
    }
  };

  const handleChange = (input: HTMLInputElement) => {
    const nextValue = mode === "decimal"
      ? parseDecimalValue(input.value, currentValue, max)
      : parseIntegerValue(input.value, max);

    input.value = nextValue.toString();
    onChange(nextValue);
  };

  const handleBlur = () => {
    const normalizedValue = clamp(currentValue, min, max);
    if (normalizedValue !== currentValue) {
      onChange(normalizedValue);
    }
  };

  return (
    <div className={containerClassName}>
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? (mode === "decimal" ? 0.1 : 1)}
        value={currentValue}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onChange={(event) => handleChange(event.currentTarget)}
        onBlur={handleBlur}
        className={className}
      />
      {unitForms && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 flex items-center pl-2 text-base select-none whitespace-pre">
          <span className="text-transparent">{currentValue}</span>
          <span className="text-gray-400">&nbsp;{getUnitWord(currentValue, unitForms)}</span>
        </div>
      )}
    </div>
  );
}
