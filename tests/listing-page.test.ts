import assert from "node:assert/strict";
import test from "node:test";
import {
  parseListingHowToApply,
  parseSimilarOpportunityIds,
} from "../src/lib/listing-page";

const html = `
  <h1>Water Reclamation Research</h1>
  <section>How to Apply Submit through Grants.gov Workspace before the deadline.</section>
  <h2>Similar Opportunities (identified by AI)</h2>
  <a href="/search-results-detail/361968">HHS-2026-ACF-ANA-NTA-0038</a>
  <a href="https://www.grants.gov/search-results-detail/400111">Related water notice</a>
  <a href="/search-results-detail/362396">Current notice should be ignored</a>
`;

test("similar opportunity IDs are read from the official Grants.gov similar block", () => {
  assert.deepEqual(
    parseSimilarOpportunityIds(html, "grants-362396"),
    ["361968", "400111"],
  );
});

test("missing similar blocks do not invent opportunity IDs", () => {
  assert.deepEqual(parseSimilarOpportunityIds("<p>No related notices.</p>", "grants-1"), []);
});

test("how-to-apply text is stripped from listing HTML", () => {
  assert.match(parseListingHowToApply(html), /Grants.gov Workspace/);
});
