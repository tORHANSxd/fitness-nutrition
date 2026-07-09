import { round } from "@/lib/nutrition";

interface MetricCardProps {
  label: string;
  value: number;
  unit: string;
  tone?: "normal" | "danger" | "accent";
}

// 扁平指标：放在已用细线分隔的 stat 网格内，不再各自描边/发光/悬浮，避免“框中框”与噪点。
// 单强调色：accent=emerald、danger=rose、normal=中性，杜绝离色系的 amber。
export function MetricCard({ label, value, unit, tone = "normal" }: MetricCardProps) {
  const color = tone === "danger" ? "text-rose" : tone === "accent" ? "text-accent" : "text-ink";
  const railColor = tone === "danger" ? "bg-rose" : tone === "accent" ? "bg-accent" : "bg-line";

  return (
    <div className="relative">
      <span className={`absolute inset-y-1 left-0 w-0.5 rounded-full ${railColor}`} />
      <div className="metric-label pl-3">{label}</div>
      <div className={`metric-number mt-1 pl-3 text-[22px] ${color}`}>
        {round(value, unit === "kcal" ? 0 : 1)}
        <span className="ml-1 font-sans text-sm font-normal text-muted">{unit}</span>
      </div>
    </div>
  );
}
