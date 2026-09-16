import { app } from "./app";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { memberIds: Set<string>; cachedAt: number }>();

export async function getUsergroupMemberIds(usergroupId: string): Promise<Set<string>> {
  const cached = cache.get(usergroupId);
  const now = Date.now();
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.memberIds;
  }

  const result = await app.client.usergroups.users.list({ usergroup: usergroupId });
  const memberIds = new Set(result.users ?? []);
  cache.set(usergroupId, { memberIds, cachedAt: now });
  return memberIds;
}

export async function isUsergroupMember(userId: string, usergroupId: string): Promise<boolean> {
  const memberIds = await getUsergroupMemberIds(usergroupId);
  return memberIds.has(userId);
}

export async function canResolve(
  userId: string,
  openerId: string,
  usergroupId: string
): Promise<boolean> {
  if (userId === openerId) return true;
  return isUsergroupMember(userId, usergroupId);
}
