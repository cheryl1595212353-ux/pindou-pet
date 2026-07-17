import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "pindou-contracts-"));
const temporaryOutput = join(temporaryDirectory, "generated.ts");

try {
  const result = spawnSync(
    "pnpm",
    ["exec", "openapi-typescript", "openapi.json", "-o", temporaryOutput],
    { cwd: packageRoot, encoding: "utf8" },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exitCode = result.status ?? 1;
  } else {
    const expected = readFileSync(join(packageRoot, "src/generated.ts"), "utf8");
    const actual = readFileSync(temporaryOutput, "utf8");
    if (actual !== expected) {
      process.stderr.write(
        "Generated TypeScript contracts are stale. Run `make contracts` and commit the result.\n",
      );
      process.exitCode = 1;
    }
  }
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
