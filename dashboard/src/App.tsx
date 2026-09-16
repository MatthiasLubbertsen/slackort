import { useEffect, useState } from "react";
import { ProgramSwitcher } from "@/components/ProgramSwitcher";
import { StatCard } from "@/components/StatCard";
import { StatusPieChart } from "@/components/StatusPieChart";
import { LeaderboardChart } from "@/components/LeaderboardChart";
import { TicketsTable } from "@/components/TicketsTable";
import { fetchOverview, fetchPrograms, type OverviewPayload, type Program } from "@/lib/api";

export default function App() {
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [programId, setProgramId] = useState<number | null>(null);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPrograms()
      .then((data) => {
        setPrograms(data.programs);
        if (data.programs.length > 0) setProgramId(data.programs[0].id);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    if (programId === null) return;
    fetchOverview(programId).then(setOverview).catch((e) => setError(String(e.message ?? e)));
  }, [programId]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">hestia dashboard</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            live from the same read-only stats api as everything else
          </p>
        </div>
        {programs && programs.length > 0 && programId !== null && (
          <ProgramSwitcher programs={programs} value={programId} onChange={setProgramId} />
        )}
      </header>

      {error && (
        <p className="mb-6 rounded-md border border-[var(--status-open)] bg-[color-mix(in_oklab,var(--status-open)_10%,transparent)] px-4 py-3 text-sm text-[var(--status-open)]">
          {error}
        </p>
      )}

      {programs && programs.length === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">
          no programs configured yet, add one from Hestia's Home tab in Slack.
        </p>
      )}

      {overview && programId !== null && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard title="total tickets" value={overview.allTime.total} />
            <StatCard title="open" value={overview.allTime.open} accent="var(--status-open)" />
            <StatCard title="in progress" value={overview.allTime.inProgress} accent="var(--status-in-progress)" />
            <StatCard title="closed" value={overview.allTime.closed} accent="var(--status-closed)" />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              title="avg hang time"
              value={overview.allTime.hangTimeMinutes}
              suffix="min, all-time"
            />
            <StatCard
              title="avg hang time"
              value={overview.past24h.hangTimeMinutes}
              suffix="min, past 24h"
            />
            <StatCard title="opened, past 24h" value={overview.past24h.total} />
            <StatCard title="closed, past 24h" value={overview.past24h.closedToday} />
          </div>

          <StatusPieChart counts={overview.allTime} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <LeaderboardChart title="leaderboard, all-time" rows={overview.leaderboard.allTime} />
            <LeaderboardChart title="leaderboard, past 24h" rows={overview.leaderboard.past24h} />
          </div>

          <TicketsTable programId={programId} />
        </div>
      )}
    </div>
  );
}
