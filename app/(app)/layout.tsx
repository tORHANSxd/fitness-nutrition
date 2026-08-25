import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AppProvider } from "@/components/app/AppProvider";
import { preferenceCookieNames, preferencesFromCookies, type PreferenceCookieName } from "@/lib/preferences";
import { getServerUser } from "@/lib/supabase/server";

export default async function ProtectedAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();
  if (!user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const cookieValues = Object.fromEntries(
    Object.values(preferenceCookieNames).map((name) => [name, cookieStore.get(name)?.value])
  ) as Partial<Record<PreferenceCookieName, string>>;
  const initialPreferences = preferencesFromCookies(cookieValues);

  return (
    <AppProvider initialUser={user} initialPreferences={initialPreferences}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
