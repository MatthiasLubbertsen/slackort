import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CategoryCounts } from "@/lib/api";

const SEGMENTS: { key: keyof CategoryCounts; label: string; color: string }[] = [
  { key: "open", label: "open", color: "var(--status-open)" },
  { key: "inProgress", label: "in progress", color: "var(--status-in-progress)" },
  { key: "closed", label: "closed", color: "var(--status-closed)" },
];

function TooltipContent({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm shadow-md">
      <span className="font-medium">{name}</span>: {value}
    </div>
  );
}

export function StatusPieChart({ counts }: { counts: CategoryCounts }) {
  const data = SEGMENTS.map((s) => ({ name: s.label, value: counts[s.key], color: s.color }));
  const hasData = counts.total > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ticket status breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="h-[200px] w-[200px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} strokeWidth={2}>
                    {data.map((d) => (
                      <Cell key={d.name} fill={d.color} stroke="var(--card)" />
                    ))}
                  </Pie>
                  <Tooltip content={<TooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              {data.map((d) => (
                <li key={d.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                  <span className="capitalize text-[var(--muted-foreground)]">{d.name}</span>
                  <span className="font-medium tabular-nums">{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">no tickets yet</p>
        )}
      </CardContent>
    </Card>
  );
}
