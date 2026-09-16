// Thin fetch wrappers around Hestia's own read-only stats API, mounted
// same-origin under /api on this dashboard's own port -- see src/web/server.ts.

export interface Program {
  id: number;
  name: string;
  helpChannelId: string;
  btsChannelId: string;
}

export interface CategoryCounts {
  total: number;
  open: number;
  inProgress: number;
  closed: number;
}

export interface LeaderboardRow {
  resolved_by: string;
  count: number;
  resolvedByName?: string;
}

export interface OverviewPayload {
  allTime: CategoryCounts & { hangTimeMinutes: number };
  past24h: CategoryCounts & { hangTimeMinutes: number; closedToday: number };
  leaderboard: {
    past24h: LeaderboardRow[];
    weekly: LeaderboardRow[];
    allTime: LeaderboardRow[];
  };
}

export type TicketCategory = "open" | "in_progress" | "closed";

export interface TicketRow {
  id: number;
  programId: number;
  channelId: string;
  messageTs: string;
  openerId: string;
  subject: string;
  status: "open" | "resolved";
  category: TicketCategory;
  assignedTo: string | null;
  createdAt: number;
  resolvedAt: number | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  openerName?: string;
  resolvedByName?: string | null;
  assignedToName?: string | null;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${path} -> ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchPrograms(): Promise<{ programs: Program[] }> {
  return getJson("/api/programs");
}

export function fetchOverview(programId: number): Promise<OverviewPayload> {
  return getJson(`/api/overview?programId=${programId}`);
}

export function fetchTickets(
  programId: number,
  opts: { status?: "open" | "resolved"; limit?: number } = {}
): Promise<{ tickets: TicketRow[]; total: number }> {
  const params = new URLSearchParams({ programId: String(programId), names: "true" });
  if (opts.status) params.set("status", opts.status);
  params.set("limit", String(opts.limit ?? 20));
  return getJson(`/api/tickets?${params.toString()}`);
}
