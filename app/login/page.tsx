import { Suspense } from "react";
import { LoginScreen } from "@/components/LoginScreen";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="auth-stage" aria-label="正在恢复登录状态" />}>
      <LoginScreen configured={isSupabaseConfigured()} />
    </Suspense>
  );
}

