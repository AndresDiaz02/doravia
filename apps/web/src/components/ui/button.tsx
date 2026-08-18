import { cn } from "../../lib/cn";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-action focus:ring-offset-2 dark:focus:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "md" && "px-4 py-2 text-sm",
        variant === "primary" && "dv-button-primary text-white",
        variant === "secondary" && "dv-button-secondary",
        variant === "ghost" && "dv-button-ghost",
        variant === "danger" && "rounded-xl bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-px",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
