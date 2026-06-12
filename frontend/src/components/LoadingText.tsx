import { Loader2 } from "lucide-react";

interface LoadingTextProps {
  text: string;
  className?: string;
  iconClassName?: string;
}

export function LoadingText({
  text,
  className = "",
  iconClassName = "h-4 w-4",
}: LoadingTextProps) {
  return (
    <span className={`inline-flex items-center justify-center gap-2 ${className}`.trim()}>
      <Loader2 className={`${iconClassName} shrink-0 animate-spin`.trim()} />
      {text ? <span>{text}</span> : null}
    </span>
  );
}
