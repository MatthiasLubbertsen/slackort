import { app } from "./app";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { memberIds: Set<string>; cachedAt: number }>();

/**
 * Who counts as a helper for a Program: membership in its bts channel, not a
 * ping usergroup. Anyone can add themselves to a usergroup, but a channel a
 * super admin actually invited people to is a real source of truth.
 */
export async function getChannelMemberIds(channelId: string): Promise<Set<string>> {
  const cached = cache.get(channelId);
  const now = Date.now();
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.memberIds;
  }

  const memberIds = new Set<string>();
  let cursor: string | undefined;
  do {
    const result = await app.client.conversations.members({ channel: channelId, cursor, limit: 200 });
    for (const id of result.members ?? []) memberIds.add(id);
    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);

  cache.set(channelId, { memberIds, cachedAt: now });
  return memberIds;
}

export async function isChannelMember(userId: string, channelId: string): Promise<boolean> {
  const memberIds = await getChannelMemberIds(channelId);
  return memberIds.has(userId);
}

export async function canResolve(
  userId: string,
  openerId: string,
  btsChannelId: string
): Promise<boolean> {
  if (userId === openerId) return true;
  return isChannelMember(userId, btsChannelId);
}
