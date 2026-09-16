import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  suffix,
  accent,
}: {
  title: string;
  value: string | number;
  suffix?: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>
          {value}
          {suffix && <span className={cn("ml-1 text-sm font-normal text-[var(--muted-foreground)]")}>{suffix}</span>}
        </p>
      </CardContent>
    </Card>
  );
}
