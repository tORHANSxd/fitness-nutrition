import { round } from "@/lib/nutrition";

interface MetricCardProps {
  label: string;
  value: number;
  unit: string;
  tone?: "normal" | "danger" | "accent";
}

export function MetricCard({ label, value, unit, tone = "normal" }: MetricCardProps) {
  const color = tone === "danger" ? "text-rose" : tone === "accent" ? "text-accent" : "text-ink";
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="metric-label">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>
        {round(value, unit === "kcal" ? 0 : 1)}
        <span className="ml-1 text-sm font-medium text-muted">{unit}</span>
      </div>
    </div>
  );
}

