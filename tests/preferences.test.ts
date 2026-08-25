import { describe, expect, it } from "vitest";
import {
  canonicalLength,
  canonicalEnergy,
  canonicalWeight,
  displayEnergy,
  displayLength,
  displayWeight,
  preferencesFromCookies,
  preferenceCookieNames,
  preferencesFromRow
} from "@/lib/preferences";

describe("preferences", () => {
  it("keeps canonical metric storage stable through display conversion", () => {
    expect(canonicalWeight(displayWeight(93.2, "imperial"), "imperial")).toBeCloseTo(93.2, 8);
    expect(canonicalLength(displayLength(174, "imperial"), "imperial")).toBeCloseTo(174, 8);
    expect(displayEnergy(2300, "kj")).toBeCloseTo(9623.2, 5);
    expect(canonicalEnergy(displayEnergy(2300, "kj"), "kj")).toBeCloseTo(2300, 8);
  });

  it("uses the detected zone in automatic mode and the saved zone in fixed mode", () => {
    const detected = preferencesFromRow({ time_zone_mode: "auto", time_zone: "Asia/Tokyo" }, {
      locale: "en",
      timeZone: "America/New_York",
      timeZoneMode: "auto",
      weekStartsOn: 1,
      unitSystem: "metric",
      energyUnit: "kcal",
      hourCycle: "h23",
      theme: "system",
      reduceMotion: null
    });
    expect(detected.timeZone).toBe("America/New_York");
    expect(preferencesFromRow({ ...detected, time_zone_mode: "fixed", time_zone: "Asia/Tokyo" }, detected).timeZone).toBe("Asia/Tokyo");
  });

  it("preserves the cookie zone during server rendering and keeps an absent motion preference automatic", () => {
    const preferences = preferencesFromCookies({
      [preferenceCookieNames.timeZone]: "America/Los_Angeles",
      [preferenceCookieNames.timeZoneMode]: "auto"
    });
    expect(preferences.timeZone).toBe("America/Los_Angeles");
    expect(preferences.reduceMotion).toBeNull();
  });

  it("parses explicit reduce-motion cookie values", () => {
    expect(preferencesFromCookies({ [preferenceCookieNames.reduceMotion]: "true" }).reduceMotion).toBe(true);
    expect(preferencesFromCookies({ [preferenceCookieNames.reduceMotion]: "false" }).reduceMotion).toBe(false);
  });
});
