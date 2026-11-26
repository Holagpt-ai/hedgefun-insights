import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const ORCHESTRATION_TESTS = path.join(
  REPO_ROOT,
  "scripts/historical/__tests__/catchup-orchestration.tests.ps1",
);

function powershellExecutable(): string {
  if (process.platform === "win32") return "powershell.exe";
  return "pwsh";
}

describe("Batch 33.9 PowerShell orchestration safeguards", () => {
  it("enforces lock ownership, full per-run reservation, and cleanup reporting", () => {
    const exe = powershellExecutable();
    const result = spawnSync(
      exe,
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ORCHESTRATION_TESTS],
      {
        encoding: "utf8",
        cwd: REPO_ROOT,
        timeout: 120_000,
      },
    );
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${exe} is required to run catch-up orchestration tests`);
    }
    expect(output, output).toContain("PASS: catchup orchestration safeguards");
    expect(result.status, output).toBe(0);
  }, 120_000);
});
