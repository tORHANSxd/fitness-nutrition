import { createClient } from "@supabase/supabase-js";
import { healthMetricToRow, normalizeHealthPayload } from "@/lib/health";

// 服务端路由：接收 iOS 快捷指令 / Health Auto Export 打来的健康数据。
// 用 service-role 校验 per-user 同步令牌（存 profiles.preferences.healthSyncToken）后代写 health_metrics。
// 令牌通过 ?token= 或 Authorization: Bearer <token> 传入。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: string | undefined) {
  return value?.replace(/^﻿/, "").trim();
}

function adminClient() {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceKey || url.includes("your-project")) {
    return null;
  }
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function extractToken(req: Request): string | null {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery.trim();
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (auth && /^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, "").trim();
  }
  const headerToken = req.headers.get("x-sync-token");
  return headerToken ? headerToken.trim() : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// 便于用户测健康连通性：GET 返回用法说明与令牌/配置是否就绪。
export async function GET(req: Request) {
  const admin = adminClient();
  const token = extractToken(req);
  return json({
    ok: true,
    endpoint: "/api/health-sync",
    method: "POST JSON",
    configured: Boolean(admin),
    tokenProvided: Boolean(token),
    hint: "用 POST 打来健康数据：?token=<你的同步令牌>，body 支持 Health Auto Export 的 data.metrics[] 或简单 {date, weightKg, activeEnergyKcal, ...}。"
  });
}

export async function POST(req: Request) {
  const admin = adminClient();
  if (!admin) {
    return json({ ok: false, error: "服务器未配置 SUPABASE_SERVICE_ROLE_KEY，无法接收健康数据。" }, 503);
  }

  const token = extractToken(req);
  if (!token || token.length < 16) {
    return json({ ok: false, error: "缺少或非法的同步令牌（token）。" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "请求体不是合法 JSON。" }, 400);
  }

  // 令牌 → 用户
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("preferences->>healthSyncToken", token)
    .maybeSingle();
  if (profileError) {
    return json({ ok: false, error: "校验令牌时出错。" }, 500);
  }
  if (!profile?.id) {
    return json({ ok: false, error: "令牌无效或未绑定用户。" }, 401);
  }

  const fallbackDate = new Date().toISOString().slice(0, 10);
  const metrics = normalizeHealthPayload(body, fallbackDate);
  if (metrics.length === 0) {
    return json({ ok: false, error: "未从载荷中解析出任何可用指标。", parsed: 0 }, 422);
  }

  const rows = metrics.map((metric) => healthMetricToRow(String(profile.id), metric));
  const { error: upsertError } = await admin
    .from("health_metrics")
    .upsert(rows, { onConflict: "user_id,metric_date" });
  if (upsertError) {
    return json({ ok: false, error: `写入失败：${upsertError.message}` }, 500);
  }

  return json({
    ok: true,
    saved: rows.length,
    dates: metrics.map((metric) => metric.metricDate),
    latest: metrics[metrics.length - 1]
  });
}
