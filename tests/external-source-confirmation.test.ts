import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const workbenchSource = readFileSync(
  resolve(process.cwd(), "src/app/components/opportunity-workbench.tsx"),
  "utf8",
);

test("every external official-record action is gated by one confirmation dialog", () => {
  assert.match(workbenchSource, /role="dialog"/);
  assert.match(workbenchSource, /aria-modal="true"/);
  assert.match(workbenchSource, /aria-describedby="external-source-description"[\s\S]*?tabIndex=\{-1\}[\s\S]*?autoFocus/);
  assert.doesNotMatch(workbenchSource, /onClick=\{onClose\}\s+autoFocus/);
  assert.match(workbenchSource, /Continue to official source/);

  for (const directLinkExpression of [
    "href={opportunity.sourceUrl}",
    "href={program.source.sourceUrl}",
    "href={historicalAward.source.sourceUrl}",
    "href={selectedOpportunity.sourceUrl}",
  ]) {
    assert.equal(
      workbenchSource.includes(directLinkExpression),
      false,
      `${directLinkExpression} must not bypass the confirmation dialog`,
    );
  }

  assert.equal(
    [...workbenchSource.matchAll(/target="_blank"/g)].length,
    1,
    "only the confirmation dialog may open an external tab",
  );
});

test("external-source confirmation covers the five founder checks", () => {
  for (const expectedCopy of [
    "direct application or a partner-dependent pathway",
    "current, forecasted, expired, or archived",
    "company, a principal investigator, or a consortium",
    "domestic, state, manufacturing-location, or international restrictions",
    "still match the founder’s actual project and goal",
  ]) {
    assert.equal(
      workbenchSource.includes(expectedCopy),
      true,
      `missing confirmation check: ${expectedCopy}`,
    );
  }

  assert.match(
    workbenchSource,
    /does not confirm eligibility, a live funding window, or application acceptance/,
  );
});
