import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function isWithin(directory, candidate) {
  const path = relative(directory, candidate);
  return path === "" || (path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path));
}

// Resolve existing ancestors too, so a symlink cannot redirect a new output into Git.
function physicalPath(path) {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  if (parent === path) throw new Error("Cannot resolve output directory: " + path);
  return resolve(physicalPath(parent), basename(path));
}

export function outsideRepositoryPath(path) {
  if (!isAbsolute(path)) throw new Error("Output must use an absolute path outside the repository.");
  const resolved = resolve(path);
  if (isWithin(repoRoot, resolved) || isWithin(realpathSync(repoRoot), physicalPath(resolved))) {
    throw new Error("Output must stay outside the repository: " + resolved);
  }
  return resolved;
}

export const runtimeRoot = outsideRepositoryPath(
  process.env.NUTRITRAIN_RUNTIME_DIR || resolve(repoRoot, "..", basename(repoRoot) + ".local"),
);
if (isWithin(physicalPath(runtimeRoot), realpathSync(repoRoot))) {
  throw new Error("NUTRITRAIN_RUNTIME_DIR must not contain the repository.");
}

export function runtimePath(...parts) {
  const path = outsideRepositoryPath(resolve(runtimeRoot, ...parts));
  if (!isWithin(physicalPath(runtimeRoot), physicalPath(path))) {
    throw new Error("Runtime output must stay inside NUTRITRAIN_RUNTIME_DIR.");
  }
  return path;
}
