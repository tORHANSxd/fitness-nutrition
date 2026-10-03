"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadDeloadWeeks, setDeloadWeek } from "@/lib/storage";
import { weekStartKey } from "@/lib/training";

/**
 * 按周的减载标记（训练日历与安排日历共用）：
 * 登录后从 deload_weeks 水合；toggle 只原子更新一周，保存失败只回滚该周。
 */
export function useDeloadWeeks(user: User | null, weekStartsOn = 1) {
  const [deloadWeeks, setDeloadWeeks] = useState<string[]>([]);
  const weeksRef = useRef(deloadWeeks);
  useEffect(() => {
    weeksRef.current = deloadWeeks;
  }, [deloadWeeks]);

  useEffect(() => {
    if (!user) {
      setDeloadWeeks([]);
      return;
    }
    let mounted = true;
    loadDeloadWeeks(user)
      .then((weeks) => {
        if (mounted) {
          const normalized = Array.from(new Set(weeks.map((week) => weekStartKey(week, weekStartsOn)))).sort();
          weeksRef.current = normalized;
          setDeloadWeeks(normalized);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [user, weekStartsOn]);

  /** 切换 dateKey 所在周的减载标记；返回是否保存成功。 */
  const toggleDeloadWeek = useCallback(
    async (dateKey: string): Promise<boolean> => {
      if (!user) {
        return false;
      }
      const week = weekStartKey(dateKey, weekStartsOn);
      const current = weeksRef.current;
      const enabled = !current.includes(week);
      const next = enabled ? [...current, week].sort() : current.filter((item) => item !== week);
      weeksRef.current = next;
      setDeloadWeeks(next);
      try {
        await setDeloadWeek(week, enabled, user);
        return true;
      } catch {
        setDeloadWeeks((latest) => {
          const rolledBack = enabled
            ? latest.filter((item) => item !== week)
            : Array.from(new Set([...latest, week])).sort();
          weeksRef.current = rolledBack;
          return rolledBack;
        });
        return false;
      }
    },
    [user, weekStartsOn]
  );

  return { deloadWeeks, toggleDeloadWeek };
}
