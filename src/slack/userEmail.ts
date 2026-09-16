import type { WebClient } from "@slack/web-api";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, { email: string | undefined; cachedAt: number }>();

/**
 * A user's email if Slack will give us one. Needs the users:read.email
 * scope -- without it (or if the lookup just fails), returns undefined
 * rather than throwing.
 */
export async function getUserEmail(client: WebClient, userId: string): Promise<string | undefined> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.email;
  }

  let email: string | undefined;
  try {
    const result = await client.users.info({ user: userId });
    email = result.user?.profile?.email;
  } catch {
    // missing scope, or lookup failed -- leave it undefined
  }

  cache.set(userId, { email, cachedAt: Date.now() });
  return email;
}
