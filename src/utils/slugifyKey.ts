/** Turns a label into a short, url/id-safe key, e.g. for a quick reply's action_id suffix. */
export function slugifyKey(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "reply";
}
