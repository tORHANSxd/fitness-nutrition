import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

export async function createSupabaseServerClient() {
  const config = getPublicSupabaseConfig();
  if (!config) {
    return null;
  }

  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot always write cookies; proxy.ts refreshes them.
        }
      }
    }
  });
}

export async function getServerUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}
