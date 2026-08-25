"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { TrainingLog } from "@/components/TrainingLog";
import { useApp } from "@/components/app/AppProvider";
import { isDateKey } from "@/lib/dateTime";

export function TrainingWorkspace() {
  const searchParams = useSearchParams();
  const { preferences, user } = useApp();
  const dateParam = searchParams.get("date");
  const date = isDateKey(dateParam) ? dateParam : null;
  const dateRequest = useMemo(() => date ? { date, nonce: [...date].reduce((sum, character) => sum + character.charCodeAt(0), 0) } : null, [date]);
  return (
    <TrainingLog
      user={user}
      onRequireLogin={() => {}}
      dateRequest={dateRequest}
      timeZone={preferences.timeZone}
      locale={preferences.locale}
      weekStartsOn={preferences.weekStartsOn}
      unitSystem={preferences.unitSystem}
    />
  );
}
