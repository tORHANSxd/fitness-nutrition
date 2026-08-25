"use client";

import { useRouter } from "next/navigation";
import { ScheduleCalendar } from "@/components/ScheduleCalendar";
import { useApp } from "@/components/app/AppProvider";

export function CalendarWorkspace() {
  const router = useRouter();
  const { foods, preferences, user } = useApp();
  return (
    <ScheduleCalendar
      user={user}
      foods={foods}
      onGoTraining={(date) => router.push(`/training?date=${date}`)}
      onGoPlanner={(date) => router.push(`/today?date=${date}&section=meals`)}
      timeZone={preferences.timeZone}
      locale={preferences.locale}
      weekStartsOn={preferences.weekStartsOn}
      energyUnit={preferences.energyUnit}
    />
  );
}
