import { createHash } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);

export const applyChanges = args.includes("--apply");

if (applyChanges && args.includes("--dry-run")) {
  throw new Error("--apply 与 --dry-run 不能同时使用。");
}

export function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

export function batchSize(defaultValue = 200): number {
  const value = Number(option("batch-size") ?? defaultValue);
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    throw new Error("--batch-size 必须是 1 到 1000 的整数。");
  }
  return value;
}

export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("需要服务端环境变量 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY。");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export function anonymousUserId(userId: string) {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

export function modeLabel() {
  return applyChanges ? "apply" : "dry-run";
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return JSON.stringify({ code: value.code, message: value.message, details: value.details, hint: value.hint });
  }
  return String(error);
}

export async function createBackupWriter(label: string) {
  if (!applyChanges) return null;
  const requested = option("backup");
  if (!requested || !isAbsolute(requested)) {
    throw new Error("使用 --apply 时必须提供仓库外的绝对 --backup 路径。");
  }
  const backupPath = resolve(requested);
  const fromWorkspace = relative(process.cwd(), backupPath);
  if (fromWorkspace === "" || (!fromWorkspace.startsWith("..") && !isAbsolute(fromWorkspace))) {
    throw new Error("备份文件必须位于 Git 工作区之外。");
  }
  await mkdir(dirname(backupPath), { recursive: true });
  const handle = await open(backupPath, "wx");
  await handle.appendFile(`${JSON.stringify({ format: "nutritrain-database-backup-v1", label, createdAt: new Date().toISOString() })}\n`);
  return {
    async write(value: unknown) {
      await handle.appendFile(`${JSON.stringify(value)}\n`);
    },
    async close() {
      await handle.close();
    }
  };
}
