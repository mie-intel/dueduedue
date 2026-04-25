import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  isActive?: boolean;
}

const variantClasses = {
  primary: "bg-primary text-text-inverse hover:bg-primary-dark active:scale-95",
  secondary:
    "bg-secondary text-text-primary hover:bg-secondary-dark active:scale-95",
  outline:
    "border-2 border-primary text-primary hover:bg-primary-light active:scale-95",
  ghost:
    "text-text-secondary hover:text-text-primary hover:bg-black/5 active:scale-95",
};

const sizeClasses = {
  sm: "px-4 py-2 text-sm rounded-xl",
  md: "px-6 py-3 text-base rounded-2xl",
  lg: "px-8 py-4 text-lg rounded-2xl",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  isActive: _isActive,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={[
        "font-semibold transition-all duration-150 flex items-center justify-center gap-2",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(" ")}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
