import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();

test("production source has no bundled demo fixture modules or verifier imports", () => {
  for (const path of [
    "src/data/demo-company-profiles.ts",
    "src/data/demo-opportunities.ts",
    "src/lib/opportunity-matching.assertions.ts",
  ]) {
    assert.equal(existsSync(resolve(root, path)), false, `${path} must remain test-only`);
  }

  const productionUi = readFileSync(
    resolve(root, "src/app/components/opportunity-workbench.tsx"),
    "utf8",
  );
  assert.equal(/fixture|demo-/i.test(productionUi), false);

  for (const path of [
    "src/lib/opportunity-types.ts",
    "src/lib/intake/profile-normalization.ts",
    "src/app/api/opportunities/search/route.ts",
  ]) {
    const source = readFileSync(resolve(root, path), "utf8");
    assert.equal(/cached_demo_snapshot|demoLabel|demoKey/.test(source), false, path);
  }
});
