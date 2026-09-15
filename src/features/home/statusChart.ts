import type { TicketCategoryCounts } from "../../db/tickets";

/**
 * Builds a quickchart.io URL for the Open/In Progress/Closed pie chart shown
 * on the App Home tab. quickchart just renders a chart.js config into a PNG
 * from the URL, no server-side rendering needed on our end -- Slack fetches
 * the image URL directly. Only aggregate counts go into the URL, nothing
 * about individual tickets or users.
 */
export function buildStatusPieChartUrl(counts: TicketCategoryCounts): string {
  const total = counts.open + counts.inProgress + counts.closed || 1;
  const pct = (n: number) => Math.round((n / total) * 1000) / 10;

  const chartConfig = {
    type: "pie",
    data: {
      labels: [
        `Open: ${counts.open} (${pct(counts.open)}%)`,
        `In Progress: ${counts.inProgress} (${pct(counts.inProgress)}%)`,
        `Closed: ${counts.closed} (${pct(counts.closed)}%)`,
      ],
      datasets: [
        {
          data: [counts.open, counts.inProgress, counts.closed],
          backgroundColor: ["#FF6961", "#FFE08A", "#8BE28B"],
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "bottom" },
        datalabels: {
          color: "#222222",
          font: { weight: "bold" },
        },
      },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(chartConfig));
  return `https://quickchart.io/chart?width=500&height=320&backgroundColor=white&c=${encoded}`;
}
