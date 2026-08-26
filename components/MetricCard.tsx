import { round } from "@/lib/nutrition";

interface MetricCardProps {
  label: string;
  value: number;
  unit: string;
  tone?: "normal" | "danger" | "accent";
}

// 扁平指标：放在已用细线分隔的 stat 网格内，不再各自描边/发光/悬浮，避免“框中框”与噪点。
// 荧光品牌色只用于侧边轨；数值使用可读的语义文字色。
export function MetricCard({ label, value, unit, tone = "normal" }: MetricCardProps) {
  const color = tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent-text" : "text-ink";
  const railColor = tone === "danger" ? "bg-rose" : tone === "accent" ? "bg-accent" : "bg-line";

  return (
    <div className="relative">
      <span className={`absolute inset-y-1 left-0 w-0.5 rounded-full ${railColor}`} />
      <div className="metric-label pl-3">{label}</div>
      <div className={`metric-number mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1 gap-y-0.5 pl-3 text-xl leading-none sm:text-[22px] ${color}`}>
        <span>{round(value, unit === "kcal" || unit === "kJ" ? 0 : 1)}</span>
        <span className="font-sans text-sm font-normal leading-none text-muted">{unit}</span>
      </div>
    </div>
  );
}
