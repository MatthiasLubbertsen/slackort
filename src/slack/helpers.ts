import { app } from "./app";
import { config } from "../config";

let cachedMemberIds: Set<string> = new Set();
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getHelperIds(): Promise<Set<string>> {
  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS && cachedMemberIds.size > 0) {
    return cachedMemberIds;
  }
  const result = await app.client.usergroups.users.list({
    usergroup: config.supportUsergroupId,
  });
  cachedMemberIds = new Set(result.users ?? []);
  cachedAt = now;
  return cachedMemberIds;
}

export async function isHelper(userId: string): Promise<boolean> {
  const helperIds = await getHelperIds();
  return helperIds.has(userId);
}

export async function canResolve(userId: string, openerId: string): Promise<boolean> {
  if (userId === openerId) return true;
  return isHelper(userId);
}
