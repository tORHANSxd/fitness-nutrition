"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadDeloadWeeks, saveDeloadWeeks } from "@/lib/storage";
import { weekStartKey } from "@/lib/training";

/**
 * 按周的减载标记（训练日历与安排日历共用）：
 * 登录后从 profiles.preferences.deloadWeeks 水合；toggle 乐观更新，保存失败自动回滚。
 */
export function useDeloadWeeks(user: User | null) {
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
          setDeloadWeeks(weeks);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [user]);

  /** 切换 dateKey 所在周的减载标记；返回是否保存成功。 */
  const toggleDeloadWeek = useCallback(
    async (dateKey: string): Promise<boolean> => {
      if (!user) {
        return false;
      }
      const week = weekStartKey(dateKey);
      const current = weeksRef.current;
      const next = current.includes(week) ? current.filter((item) => item !== week) : [...current, week].sort();
      setDeloadWeeks(next);
      try {
        await saveDeloadWeeks(next, user);
        return true;
      } catch {
        setDeloadWeeks(current);
        return false;
      }
    },
    [user]
  );

  return { deloadWeeks, toggleDeloadWeek };
}
