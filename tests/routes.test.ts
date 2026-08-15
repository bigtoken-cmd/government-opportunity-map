import assert from "node:assert/strict";
import test from "node:test";
import { POST as search } from "../src/app/api/opportunities/search/route";
import { createWebsitePost } from "../src/app/api/intake/website/route";

test("search route rejects malformed JSON", async () => {
  const response = await search(new Request("https://example.test/api/opportunities/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Request body must be valid JSON." });
});

test("search route rejects a missing confirmed description", async () => {
  const response = await search(new Request("https://example.test/api/opportunities/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: { companyName: "Missing description" }, mode: "cached" }),
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "A confirmed company description is required." });
});

test("cached search returns role-separated records and source warnings", async () => {
  const response = await search(new Request("https://example.test/api/opportunities/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "cached",
      profile: {
        id: "route-water",
        companyName: "Water company",
        description: "Municipal water sensor research.",
        industry: "",
        technology: "",
        location: "Utah, United States",
        capitalNeed: "",
        useOfFunds: "",
        customers: "",
        researchActivities: "Research and development",
        applicantType: "U.S. for-profit small business",
        samStatus: "Unknown",
        uei: "",
      },
    }),
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.sources.length, 4);
  assert.ok(body.sources.every((source: { warning: string | null }) => source.warning));
  assert.ok(body.discovery.recommendations.every(
    (item: { opportunity: { recordKind: string } }) => item.opportunity.recordKind === "opportunity",
  ));
  assert.ok(body.discovery.programs.every((item: { kind: string }) => item.kind === "program_context"));
  assert.ok(body.discovery.historicalAwards.every((item: { kind: string }) => item.kind === "historical_award"));
});

test("website intake returns evidence-only fields from injected fetch", async () => {
  const post = createWebsitePost(async () => new Response(
    "<html><head><title>Water Works</title><meta name=\"description\" content=\"We reduce municipal water loss with sensors.\"></head><body></body></html>",
    {
      headers: {
        "content-type": "text/html",
      },
    },
  ));
  const response = await post(new Request("https://example.test/api/intake/website", {
    method: "POST",
    body: JSON.stringify({ url: "https://water.example.com" }),
    headers: { "Content-Type": "application/json" },
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.profile, {
    companyName: "Water Works",
    website: "https://water.example.com/",
    description: "We reduce municipal water loss with sensors.",
    industry: "Water technology",
    technology: "Water technology",
    yearFounded: "",
  });
  assert.deepEqual(body.evidence, [
    { field: "Company name", value: "Water Works", sourceUrl: "https://water.example.com/" },
    {
      field: "Company description",
      value: "We reduce municipal water loss with sensors.",
      sourceUrl: "https://water.example.com/",
    },
  ]);
  assert.match(body.warning, /Confirm every field/);
});
