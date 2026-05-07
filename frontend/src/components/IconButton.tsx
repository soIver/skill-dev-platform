export type IconButtonColor = "primary" | "success" | "danger" | "default";

interface IconButtonProps {
  iconSrc: string;
  altText: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  color?: IconButtonColor;
  className?: string;
}

export function IconButton({
  iconSrc,
  altText,
  title,
  onClick,
  disabled = false,
  color = "default",
  className = "",
}: IconButtonProps) {
  const colorHoverClass = {
    primary: "hover:bg-primary-hover",
    success: "hover:bg-success-hover",
    danger: "hover:bg-danger-hover",
    default: "hover:bg-gray-200",
  }[color];

  return (
    <button
      title={title || altText}
      onClick={onClick}
      disabled={disabled}
      className={`bg-transparent rounded-lg transition-colors flex items-center justify-center shrink-0 group ${disabled ? "opacity-50 cursor-not-allowed" : colorHoverClass
        } ${className}`}
    >
      <img
        src={iconSrc}
        alt={altText}
        className={`w-10 h-10 transition-all ${disabled ? "" : "opacity-70 group-hover:opacity-100 group-hover:brightness-0 group-hover:invert"
          }`}
      />
    </button>
  );
}
