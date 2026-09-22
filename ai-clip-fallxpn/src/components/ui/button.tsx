import { forwardRef, type ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          "inline-flex items-center justify-center gap-2 rounded-card font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
          {
            "bg-signal text-base hover:bg-signal-dim": variant === "primary",
            "bg-base-elevated text-ink border border-base-border hover:border-base-border-strong":
              variant === "secondary",
            "text-ink-muted hover:text-ink hover:bg-base-surface": variant === "ghost",
            "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20": variant === "danger",
          },
          {
            "text-sm px-3 py-1.5": size === "sm",
            "text-sm px-4 py-2.5": size === "md",
            "text-base px-6 py-3": size === "lg",
          },
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
