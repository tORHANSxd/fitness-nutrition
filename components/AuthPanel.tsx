"use client";

import type { User } from "@supabase/supabase-js";
import { KeyRound, Mail } from "lucide-react";
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

  const isErrorMessage = message && !message.includes("成功");

  // Claude 式登录卡：单列窄卡居中，说明信息降级为卡底注脚，不再用左右分栏与方框堆砌。
  return (
    <section className="panel mx-auto w-full max-w-md px-6 py-7 sm:px-8">
      <div className="mb-6">
        <h2 className="text-2xl text-ink">{user ? "已登录" : mode === "login" ? "登录" : "注册"}</h2>
        <p className="mt-1.5 text-sm text-muted">
          {configured
            ? user
              ? user.email
              : mode === "login"
                ? "输入邮箱和密码继续"
                : "创建账户后，你的计划与食物库将保存在云端"
            : "请先配置 .env.local 中的 Supabase 环境变量"}
        </p>
      </div>

      {user ? (
        <div className="rounded-lg border border-line bg-panel/60 px-4 py-3 text-sm text-ink">当前账户：{user.email}</div>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="metric-label mb-1.5 block">邮箱</span>
            <span className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 transition-colors focus-within:border-[#B9B5A7] focus-within:shadow-[0_0_0_3px_rgba(31,30,29,0.06)] hover:border-[#D5D0C2]">
              <Mail size={16} className="shrink-0 text-muted-soft" />
              <input
                className="h-11 flex-1 border-0 bg-transparent text-base outline-none placeholder:text-muted-soft sm:text-sm"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                type="email"
                autoComplete="email"
              />
            </span>
          </label>
          <label className="block">
            <span className="metric-label mb-1.5 block">密码</span>
            <span className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 transition-colors focus-within:border-[#B9B5A7] focus-within:shadow-[0_0_0_3px_rgba(31,30,29,0.06)] hover:border-[#D5D0C2]">
              <KeyRound size={16} className="shrink-0 text-muted-soft" />
              <input
                className="h-11 flex-1 border-0 bg-transparent text-base outline-none placeholder:text-muted-soft sm:text-sm"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 位"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </span>
          </label>
          <button className="btn-primary w-full" type="button" onClick={submit} disabled={busy}>
            {busy ? "处理中…" : mode === "login" ? "登录" : "注册"}
          </button>
          <p className="text-center text-sm text-muted">
            {mode === "login" ? "还没有账号？" : "已有账号？"}
            <button
              className="ml-1 font-medium text-accent2 underline-offset-4 hover:underline"
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setMessage("");
              }}
            >
              {mode === "login" ? "注册" : "登录"}
            </button>
          </p>
        </div>
      )}

      {message ? (
        <p
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            isErrorMessage ? "border-rose/25 bg-rose/[0.06] text-rose" : "border-accent/25 bg-accent/[0.07] text-accent2"
          }`}
        >
          {message}
        </p>
      ) : null}

      {!user ? (
        <ul className="mt-7 space-y-2 border-t border-line pt-5 text-xs leading-relaxed text-muted">
          <li className="flex gap-2">
            <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-accent" />
            所有数据按账户保存在 Supabase 云端，浏览器本地只保留登录状态。
          </li>
          <li className="flex gap-2">
            <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-accent" />
            公共食物库与你的私有食物合并显示，私有数据仅本人可见。
          </li>
        </ul>
      ) : null}
    </section>
  );
}
