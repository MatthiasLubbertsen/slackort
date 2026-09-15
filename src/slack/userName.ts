import type { WebClient } from "@slack/web-api";

/**
 * A greet-friendly name for a user, never a mention. Falls back through
 * real name -> display name -> username -> "there" if lookup fails.
 */
export async function getFriendlyName(client: WebClient, userId: string): Promise<string> {
  try {
    const result = await client.users.info({ user: userId });
    const profile = result.user?.profile;
    return (
      profile?.real_name ||
      profile?.display_name ||
      result.user?.real_name ||
      result.user?.name ||
      "there"
    );
  } catch {
    return "there";
  }
}
