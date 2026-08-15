import assert from "node:assert/strict";
import test from "node:test";
import {
  excerptSupportsMappedAmount,
  extractFinancialFacts,
} from "../src/lib/intake/evidence-facts";

test("pre-seed slide copy fills capitalRaised without inventing a second amount", () => {
  const facts = extractFinancialFacts(
    "Helios Filtration\nPre-seed raise $1.5M\nSeeking $4 million for municipal pilots\nRevenue $120k last year",
  );
  assert.equal(facts.capitalRaised, "$1.5M");
  assert.equal(facts.capitalNeed, "$4 million");
  assert.equal(facts.revenue, "$120k");
});

test("mapped capitalRaised amounts keep the same dollar value across $2M and $2 million", () => {
  assert.equal(excerptSupportsMappedAmount("pre-seed raise of $2M", "$2 million"), true);
  assert.equal(excerptSupportsMappedAmount("pre-seed raise of $2M", "$5 million"), false);
});
