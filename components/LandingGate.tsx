"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LandingHero } from "@/components/LandingHero";

// 首页：先展示营销 hero 着陆屏；点击任意 CTA 进入现有完整 App（功能不变）。
// 其余路由（/foods /history /templates /login）仍直接渲染 AppShell，深链可用。
export function LandingGate() {
  const [entered, setEntered] = useState(false);
  if (entered) {
    return <AppShell initialView="planner" />;
  }
  return <LandingHero onEnter={() => setEntered(true)} />;
}
