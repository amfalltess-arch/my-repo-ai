import type { HTMLAttributes } from "react";
import { clsx } from "clsx";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-card border border-base-border bg-base-surface shadow-panel",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "signal" | "danger" | "score";
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        {
          "bg-base-elevated text-ink-muted": tone === "neutral",
          "bg-signal-bg text-signal": tone === "signal",
          "bg-danger-bg text-danger": tone === "danger",
        },
        className,
      )}
      {...props}
    />
  );
}

/** AI score gets its own visual language — three color bands, not a rainbow — since it's the primary signal users scan for across a grid of 40 cards. */
export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <Badge tone="neutral">—</Badge>;
  const tone = score >= 80 ? "text-score-high" : score >= 60 ? "text-score-mid" : "text-score-low";
  return (
    <span className={clsx("inline-flex items-center gap-1 text-sm font-semibold tabular", tone)}>
      <svg width="6" height="6" className="fill-current">
        <circle cx="3" cy="3" r="3" />
      </svg>
      {score}
    </span>
  );
}
