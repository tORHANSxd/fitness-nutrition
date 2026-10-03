import en from "@/messages/en.json";
import zhCN from "@/messages/zh-CN.json";
import type { AppLocale } from "@/lib/preferences";

const dictionaries = { "zh-CN": zhCN, en } as const;

export function translate(locale: AppLocale, key: string): string {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    return current && typeof current === "object" ? (current as Record<string, unknown>)[segment] : undefined;
  }, dictionaries[locale]);
  return typeof value === "string" ? value : key;
}
