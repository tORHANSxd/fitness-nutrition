import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import {
  addDays,
  dateKeyFromInstant,
  dateKeyInRange,
  daysBetween,
  endOfWeek,
  formatDateKey,
  isDateKey,
  monthGrid,
  startOfWeek,
  todayKey,
  weekdayLabels
} from "@/lib/dateTime";

describe("dateTime", () => {
  it("validates canonical date keys", () => {
    expect(isDateKey("2024-02-29")).toBe(true);
    expect(isDateKey("2023-02-29")).toBe(false);
    expect(isDateKey("2026-8-25")).toBe(false);
    expect(isDateKey(null)).toBe(false);
  });
  const boundaryInstant = Temporal.Instant.from("2026-01-01T00:30:00Z");

  it("derives the calendar day in the selected timezone", () => {
    expect(todayKey("Pacific/Honolulu", boundaryInstant)).toBe("2025-12-31");
    expect(todayKey("Asia/Shanghai", boundaryInstant)).toBe("2026-01-01");
    expect(todayKey("Pacific/Kiritimati", boundaryInstant)).toBe("2026-01-01");
  });

  it("converts an instant without relying on the host timezone", () => {
    expect(dateKeyFromInstant("2026-03-08T07:30:00Z", "America/New_York")).toBe("2026-03-08");
    expect(dateKeyFromInstant("2026-03-08T04:30:00Z", "America/New_York")).toBe("2026-03-07");
  });

  it("uses ISO Monday-to-Sunday weeks across year boundaries", () => {
    expect(startOfWeek("2026-01-01")).toBe("2025-12-29");
    expect(endOfWeek("2026-01-01")).toBe("2026-01-04");
    expect(startOfWeek("2026-01-01", 0)).toBe("2025-12-28");
  });

  it("performs plain-date arithmetic across leap days", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("builds a stable six-week month grid", () => {
    const grid = monthGrid("2026-08-25");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-07-27");
    expect(grid.at(-1)).toBe("2026-09-06");
    expect(monthGrid("2026-08-25", 0)[0]).toBe("2026-07-26");
    expect(weekdayLabels("en", 0)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  it("compares ranges and formats a date independently of timezone", () => {
    expect(dateKeyInRange("2026-08-25", "2026-08-01", "2026-08-31")).toBe(true);
    expect(dateKeyInRange("2026-09-01", "2026-08-01", "2026-08-31")).toBe(false);
    expect(formatDateKey("2026-08-25", "en-US", { month: "short", day: "numeric" })).toBe("Aug 25");
  });
});
