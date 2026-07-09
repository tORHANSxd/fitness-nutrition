"use client";

import type { User } from "@supabase/supabase-js";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

interface AuthPanelProps {
  user: User | null;
  onSignedIn: (user: User | null) => void;
}

export function AuthPanel({ user, onSignedIn }: AuthPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = isSupabaseConfigured();

  async function submit() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage("当前未配置 Supabase，无法登录或保存数据。请先在 .env.local 配置后重启。");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) {
        setMessage(result.error.message);
        return;
      }

      onSignedIn(result.data.user ?? null);
      setMessage(mode === "login" ? "登录成功。" : "注册成功；如果项目开启邮箱确认，请先完成邮箱验证。");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      const normalizedErrorMessage = errorMessage.toLowerCase();
      setMessage(
        normalizedErrorMessage.includes("failed to execute 'fetch'") || normalizedErrorMessage.includes("headers")
          ? "登录/注册请求失败：浏览器里存在旧的认证缓存，请清理本站点数据后刷新重试。"
          : errorMessage
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
      <div className="panel p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gradient">账户与在线保存</h2>
            <p className="text-sm text-muted">邮箱密码登录后，食物库和每日计划写入 Supabase。</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm text-ink md:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface/70 backdrop-blur p-3">RLS 限制每个用户只能读写自己的私有食物和计划。</div>
          <div className="rounded-xl border border-line bg-surface/70 backdrop-blur p-3">公共食物库与私有食物库合并显示，私有食物仅本人可见。</div>
          <div className="rounded-xl border border-line bg-surface/70 backdrop-blur p-3">所有数据按账户保存在 Supabase 云端；除登录状态外不写入浏览器本地。</div>
        </div>
      </div>

      <div className="panel p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gradient">{user ? "已登录" : mode === "login" ? "登录" : "注册"}</h2>
          <p className="text-sm text-muted">
            {configured ? (user ? user.email : "输入邮箱和密码继续") : "请先配置 .env.local 中的 Supabase 环境变量"}
          </p>
        </div>

        {user ? (
          <div className="rounded-md border border-line bg-surface/70 p-3 text-sm text-ink">当前账户：{user.email}</div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="metric-label mb-1 block">邮箱</span>
              <span className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 transition-colors focus-within:border-[#B9B5A7] focus-within:shadow-[0_0_0_3px_rgba(31,30,29,0.06)] hover:border-[#D5D0C2]">
                <Mail size={16} className="text-muted" />
                <input
                  className="h-10 flex-1 border-0 bg-transparent text-sm outline-none"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  type="email"
                />
              </span>
            </label>
            <label className="block">
              <span className="metric-label mb-1 block">密码</span>
              <span className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 transition-colors focus-within:border-[#B9B5A7] focus-within:shadow-[0_0_0_3px_rgba(31,30,29,0.06)] hover:border-[#D5D0C2]">
                <KeyRound size={16} className="text-muted" />
                <input
                  className="h-10 flex-1 border-0 bg-transparent text-sm outline-none"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="至少 6 位"
                  type="password"
                />
              </span>
            </label>
            <button className="btn-primary w-full" type="button" onClick={submit} disabled={busy}>
              {busy ? "处理中..." : mode === "login" ? "登录" : "注册"}
            </button>
            <button
              className="btn-secondary w-full"
              type="button"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              切换到{mode === "login" ? "注册" : "登录"}
            </button>
          </div>
        )}

        {message ? (
          <p className={`mt-3 rounded-md border p-3 text-sm ${message.includes("成功") ? "border-accent/30 bg-accent/10 text-accent" : "border-line bg-surface/80 text-ink"}`}>
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
