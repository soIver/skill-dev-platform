import { forwardRef, type CSSProperties, type TextareaHTMLAttributes } from "react";

type TextareaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "maxLength" | "minLength"> & {
  value: string;
  maxCharacters: number;
  minCharacters?: number;
  validationName?: string;
  containerClassName?: string;
  footerClassName?: string;
  minHeight?: CSSProperties["minHeight"];
  maxHeight?: CSSProperties["maxHeight"];
};

function getDefaultMinHeight(minCharacters: number | undefined, maxCharacters: number): number {
  if (maxCharacters >= 2048) return 150;
  if ((minCharacters ?? 0) >= 64) return 120;
  if ((minCharacters ?? 0) >= 32 || maxCharacters > 64) return 80;
  return 40;
}

function getDefaultMaxHeight(maxCharacters: number): number {
  if (maxCharacters <= 64) return 96;
  if (maxCharacters <= 256) return 160;
  if (maxCharacters <= 1024) return 260;
  return 360;
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(function TextareaField(
  {
    value,
    maxCharacters,
    minCharacters,
    validationName,
    containerClassName = "",
    footerClassName = "",
    className = "",
    style,
    minHeight,
    maxHeight,
    ...props
  },
  ref,
) {
  const currentLength = value.length;
  const isTooShort = minCharacters !== undefined && currentLength < minCharacters;
  const isTooLong = currentLength > maxCharacters;
  const heightStyle: CSSProperties = {
    minHeight: minHeight ?? getDefaultMinHeight(minCharacters, maxCharacters),
    maxHeight: maxHeight ?? getDefaultMaxHeight(maxCharacters),
  };

  return (
    <div className={containerClassName}>
      <textarea
        ref={ref}
        value={value}
        className={`input-field resize-y mb-1 ${className}`.trim()}
        style={{ font: "inherit", ...heightStyle, ...style }}
        maxLength={maxCharacters * 2}
        {...props}
      />
      <div className={`text-xs flex justify-between ${footerClassName}`.trim()}>
        <span className="text-gray-500">
          {isTooShort && validationName ? `Слишком короткое ${validationName}` : ""}
        </span>
        <span className={isTooLong ? "text-danger" : "text-gray-500"}>
          {currentLength}/{maxCharacters}
        </span>
      </div>
    </div>
  );
});
