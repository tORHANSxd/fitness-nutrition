"use client";

import { useEffect, useState } from "react";
import { todayKey } from "@/lib/dateTime";

export function useZonedToday(timeZone: string): string {
  const [today, setToday] = useState(() => todayKey(timeZone));

  useEffect(() => {
    const refresh = () => setToday(todayKey(timeZone));
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [timeZone]);

  return today;
}
