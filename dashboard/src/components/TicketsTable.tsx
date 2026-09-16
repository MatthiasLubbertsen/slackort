import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/badge";
import { relativeTimeAgo } from "@/lib/relativeTime";
import { fetchTickets, type TicketRow } from "@/lib/api";

type Filter = "all" | "open" | "resolved";

export function TicketsTable({ programId }: { programId: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTickets(programId, { status: filter === "all" ? undefined : filter, limit: 20 })
      .then((data) => {
        if (!cancelled) setTickets(data.tickets);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [programId, filter]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>recent tickets</CardTitle>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">all</TabsTrigger>
            <TabsTrigger value="open">open</TabsTrigger>
            <TabsTrigger value="resolved">resolved</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">loading...</p>
        ) : tickets.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">no tickets here</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                  <th className="py-2 pr-4 font-medium">subject</th>
                  <th className="py-2 pr-4 font-medium">opener</th>
                  <th className="py-2 pr-4 font-medium">status</th>
                  <th className="py-2 pr-4 font-medium">assigned to</th>
                  <th className="py-2 font-medium">opened</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="max-w-[280px] truncate py-2 pr-4">{t.subject}</td>
                    <td className="py-2 pr-4 text-[var(--muted-foreground)]">{t.openerName ?? t.openerId}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={t.category} />
                    </td>
                    <td className="py-2 pr-4 text-[var(--muted-foreground)]">
                      {t.assignedToName ?? t.assignedTo ?? "unassigned"}
                    </td>
                    <td className="py-2 tabular-nums text-[var(--muted-foreground)]">
                      {relativeTimeAgo(t.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
