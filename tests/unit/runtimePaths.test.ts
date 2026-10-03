// @vitest-environment node
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { outsideRepositoryPath, repoRoot, runtimePath, runtimeRoot } from "../../scripts/runtime/paths.mjs";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    if (dirname(directory) !== realpathSync(tmpdir())) throw new Error("Unexpected cleanup location");
    rmSync(directory, { recursive: true });
  }
});

describe("external report paths", () => {
  it("rejects repository paths, relative paths and escaped runtime paths", () => {
    expect(() => outsideRepositoryPath("report.json")).toThrow(/absolute/);
    expect(() => outsideRepositoryPath(resolve(repoRoot, "report.json"))).toThrow(/outside/);
    expect(() => runtimePath("..", "escaped.json")).toThrow(/inside/);
    expect(runtimePath("artifacts", "report.json")).toBe(join(runtimeRoot, "artifacts", "report.json"));
  });

  it("rejects an external link redirecting a new output into the repository", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "nutritrain-runtime-")));
    temporaryDirectories.push(directory);
    const link = join(directory, "linked-repository");
    symlinkSync(repoRoot, link, process.platform === "win32" ? "junction" : "dir");
    expect(() => outsideRepositoryPath(join(link, "new-report.json"))).toThrow(/outside/);
  });
});
