import type { WebClient } from "@slack/web-api";

/**
 * A greet-friendly name for a user, never a mention. Always prefers their
 * display name (what they've set for themselves), falling back through
 * real name -> username -> "there" if display name isn't set or lookup fails.
 */
export async function getFriendlyName(client: WebClient, userId: string): Promise<string> {
  try {
    const result = await client.users.info({ user: userId });
    const profile = result.user?.profile;
    return (
      profile?.display_name ||
      profile?.real_name ||
      result.user?.real_name ||
      result.user?.name ||
      "there"
    );
  } catch {
    return "there";
  }
}
