import type { WebClient } from "@slack/web-api";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, { name: string; cachedAt: number }>();

/**
 * A greet-friendly name for a user, never a mention. Always prefers their
 * display name (what they've set for themselves), falling back through
 * real name -> username -> "there" if display name isn't set or lookup fails.
 * Cached briefly since the Home tab and stats API can ask for the same few
 * names a lot.
 */
export async function getFriendlyName(client: WebClient, userId: string): Promise<string> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.name;
  }

  let name = "there";
  try {
    const result = await client.users.info({ user: userId });
    const profile = result.user?.profile;
    name =
      profile?.display_name ||
      profile?.real_name ||
      result.user?.real_name ||
      result.user?.name ||
      "there";
  } catch {
    // keep the "there" fallback
  }

  cache.set(userId, { name, cachedAt: Date.now() });
  return name;
}
