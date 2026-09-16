import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LeaderboardRow } from "@/lib/api";

function TooltipContent({ active, payload }: { active?: boolean; payload?: { payload: LeaderboardRow }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm shadow-md">
      <span className="font-medium">{row.resolvedByName ?? row.resolved_by}</span>: {row.count} resolved
    </div>
  );
}

export function LeaderboardChart({ title, rows }: { title: string; rows: LeaderboardRow[] }) {
  const data = rows.slice(0, 8).map((r) => ({ ...r, label: r.resolvedByName ?? r.resolved_by }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div style={{ height: Math.max(120, data.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                <XAxis type="number" allowDecimals={false} stroke="var(--chart-axis)" fontSize={12} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={110}
                  stroke="var(--chart-axis)"
                  fontSize={12}
                  tickLine={false}
                />
                <Tooltip content={<TooltipContent />} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {data.map((d) => (
                    <Cell key={d.resolved_by} fill="var(--series-primary)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">nobody's resolved a ticket yet</p>
        )}
      </CardContent>
    </Card>
  );
}
