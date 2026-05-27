import { round } from "@/lib/nutrition";

interface MetricCardProps {
  label: string;
  value: number;
  unit: string;
  tone?: "normal" | "danger" | "accent";
}

export function MetricCard({ label, value, unit, tone = "normal" }: MetricCardProps) {
  const color = tone === "danger" ? "text-rose" : tone === "accent" ? "text-accent" : "text-ink";
  const railColor = tone === "danger" ? "bg-rose" : tone === "accent" ? "bg-amber" : "bg-accent";
  const surface = tone === "danger" ? "bg-rose/5" : tone === "accent" ? "bg-amber/5" : "bg-white";

  return (
    <div className={`relative overflow-hidden rounded-md border border-line ${surface} p-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]`}>
      <div className={`absolute inset-y-0 left-0 w-1 ${railColor}`} />
      <div className="metric-label pl-2">{label}</div>
      <div className={`mt-1 pl-2 text-xl font-semibold tabular-nums ${color}`}>
        {round(value, unit === "kcal" ? 0 : 1)}
        <span className="ml-1 text-sm font-medium text-muted">{unit}</span>
      </div>
    </div>
  );
}
