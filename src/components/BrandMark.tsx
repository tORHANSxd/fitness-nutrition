import { Activity } from "lucide-react";

export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <Activity size={Math.max(12, Math.round(size * 0.58))} strokeWidth={2.4} />
    </span>
  );
}
