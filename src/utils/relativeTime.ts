const UNITS: [string, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/** "3 hours ago", "1 month ago", falling back to "just now" for anything under a minute. */
export function relativeTimeAgo(fromMs: number, nowMs: number = Date.now()): string {
  const diff = nowMs - fromMs;
  for (const [unit, ms] of UNITS) {
    const value = Math.floor(diff / ms);
    if (value >= 1) return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
  }
  return "just now";
}
