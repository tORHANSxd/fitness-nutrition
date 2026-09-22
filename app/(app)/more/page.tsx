import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Grid2X2,
  Library,
  Settings2,
  Target,
} from "lucide-react";
const links = [
  {
    href: "/goals",
    title: "饮食目标",
    text: "设置每日热量和营养分配",
    icon: Target,
  },
  {
    href: "/calendar",
    title: "日历",
    text: "查看其他日期的餐食与记录",
    icon: CalendarDays,
  },
  {
    href: "/resources?tab=templates",
    title: "饮食模板",
    text: "保存常用搭配，减少重复操作",
    icon: Library,
  },
  {
    href: "/heatmap",
    title: "营养分布",
    text: "用图形查看摄入与消耗",
    icon: Grid2X2,
  },
  {
    href: "/settings",
    title: "偏好设置",
    text: "外观、单位与账户",
    icon: Settings2,
  },
];
export default function MorePage() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {links.map((item) => (
        <Link className="feature-link panel" href={item.href} key={item.href}>
          <span className="feature-icon">
            <item.icon size={23} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base">{item.title}</h2>
            <p className="mt-1 text-sm text-muted">{item.text}</p>
          </div>
          <ArrowUpRight size={18} className="text-muted" />
        </Link>
      ))}
    </div>
  );
}
