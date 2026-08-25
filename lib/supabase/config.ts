export interface PublicSupabaseConfig {
  url: string;
  anonKey: string;
}

export function cleanPublicEnv(value: string | undefined): string | undefined {
  return value?.replace(/^\uFEFF/, "").trim();
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = cleanPublicEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = cleanPublicEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !anonKey || url.includes("your-project") || anonKey.includes("your-anon-key")) {
    return null;
  }

  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getPublicSupabaseConfig() !== null;
}
