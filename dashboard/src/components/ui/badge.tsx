import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  open: "bg-[color-mix(in_oklab,var(--status-open)_16%,transparent)] text-[var(--status-open)]",
  in_progress:
    "bg-[color-mix(in_oklab,var(--status-in-progress)_20%,transparent)] text-[var(--status-in-progress)]",
  closed: "bg-[color-mix(in_oklab,var(--status-closed)_16%,transparent)] text-[var(--status-closed)]",
};

const statusDot: Record<string, string> = {
  open: "bg-[var(--status-open)]",
  in_progress: "bg-[var(--status-in-progress)]",
  closed: "bg-[var(--status-closed)]",
};

const statusLabel: Record<string, string> = {
  open: "open",
  in_progress: "in progress",
  closed: "closed",
};

/** A status pill: color is never the only signal, a dot + text label always ride along. */
export function StatusBadge({ status, className }: { status: "open" | "in_progress" | "closed"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        statusStyles[status],
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", statusDot[status])} />
      {statusLabel[status]}
    </span>
  );
}
