import assert from "node:assert/strict";
import test from "node:test";
import { POST as search } from "../src/app/api/opportunities/search/route";
import {
  createWebsitePost,
  fetchWebsiteEvidence,
  normalizePublicWebsiteUrl,
} from "../src/lib/intake/website-route-handler";
import type { SourceResultStatus } from "../src/lib/sources/source-contracts";

const SOURCE_STATUS_VOCABULARY: Record<SourceResultStatus, true> = {
  live: true,
  cached: true,
  "cached-fallback": true,
  unavailable: true,
};

function sortedKeys(value: object) {
  return Object.keys(value).sort();
}

function lunaResponse(claims: unknown) {
  return new Response(JSON.stringify({
    status: "completed",
    incomplete_details: null,
    output: [{
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{
        type: "output_text",
        text: JSON.stringify({ claims }),
      }],
    }],
  }), {
    headers: { "content-type": "application/json" },
  });
}

test("search route rejects malformed JSON", async () => {
  const response = await search(new Request("https://example.test/api/opportunities/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Request body must be valid JSON." });
});

test("search route rejects an oversized body before source or model work", async () => {
  const response = await search(new Request("https://example.test/api/opportunities/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: { description: "x".repeat(70 * 1024) } }),
  }));
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "Request body is too large." });
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
  assert.deepEqual(
    sortedKeys(body),
    ["discovery", "externalProcessingDisclosure", "query", "semanticReview", "sources", "warnings"],
  );
  assert.equal(body.semanticReview.reason, "missing_api_key");
  assert.deepEqual(
    sortedKeys(body.query),
    ["assistanceListing", "keyword"],
  );
  assert.deepEqual(
    sortedKeys(body.discovery),
    ["historicalAwards", "programs", "recommendations", "resultMeta"],
  );
  assert.equal(body.discovery.resultMeta.defaultVisible, 5);
  assert.equal(body.discovery.resultMeta.resultCap, 20);
  assert.equal(body.discovery.resultMeta.returnedCount, body.discovery.recommendations.length);
  assert.equal(body.sources.length, 4);
  assert.deepEqual(
    body.sources.map((source: { family: string }) => source.family),
    ["grants", "assistance-listings", "usaspending", "sbir"],
  );
  for (const source of body.sources) {
    assert.deepEqual(
      sortedKeys(source),
      [
        "family",
        "name",
        "recordCount",
        "retrievedAt",
        "sourceUrl",
        "status",
        "warning",
      ],
    );
    assert.equal(SOURCE_STATUS_VOCABULARY[source.status as SourceResultStatus], true);
    assert.equal(typeof source.recordCount, "number");
    assert.ok(source.warning);
  }
  assert.ok(body.discovery.recommendations.length > 0);
  for (const recommendation of body.discovery.recommendations) {
    assert.deepEqual(
      sortedKeys(recommendation),
      ["intelligence", "match", "opportunity"],
    );
    assert.deepEqual(
      sortedKeys(recommendation.intelligence),
      ["concerns", "decisionSummary", "historicalSupport", "nextAction", "routeType", "whyFit"],
    );
    assert.ok(["direct", "partner", "verify", "watch"].includes(recommendation.intelligence.routeType));
    assert.ok(recommendation.intelligence.decisionSummary);
    assert.ok(recommendation.intelligence.nextAction.text);
    assert.deepEqual(
      sortedKeys(recommendation.match),
      [
        "companyId",
        "decision",
        "eligibility",
        "fitStatus",
        "matchedConceptGroups",
        "opportunityId",
        "reason",
        "scopeDomainMatch",
        "scopeExactTermMatch",
        "score",
        "titleDomainMatch",
        "unknownCriticalFacts",
      ],
    );
    assert.deepEqual(
      sortedKeys(recommendation.match.score),
      [
        "amount",
        "controlledConcepts",
        "customerUse",
        "exactTerms",
        "geography",
        "mission",
        "technologyAndRd",
        "total",
      ],
    );
    assert.equal(
      recommendation.match.opportunityId,
      recommendation.opportunity.id,
    );
    assert.ok(
      ["Strong Fit", "Potential Fit", "No Fit"].includes(
        recommendation.match.fitStatus,
      ),
    );
  }
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
    body: JSON.stringify({ url: "water.example.com" }),
    headers: { "Content-Type": "application/json" },
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.profile, {
    companyName: "Water Works",
    website: "https://water.example.com/",
    description: "We reduce municipal water loss with sensors.",
    industry: "Water technology",
    technology: "municipal water, water efficiency",
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

test("website intake invokes Luna and returns the processing disclosure", async () => {
  let providerCalls = 0;
  const post = createWebsitePost(
    async () => new Response(
      "<html><head><title>Acme Water Labs</title></head><body>Acme Water Labs builds municipal water sensors for public utilities.</body></html>",
      {
        headers: {
          "content-type": "text/html",
        },
      },
    ),
    {
      apiKey: "test-only-key",
      fetcher: async () => {
        providerCalls += 1;
        return lunaResponse([{
          field: "technology",
          value: "municipal water sensors",
          evidenceExcerpt: "builds municipal water sensors for public utilities",
        }]);
      },
    },
  );
  const response = await post(new Request("https://example.test/api/intake/website", {
    method: "POST",
    body: JSON.stringify({
      url: "https://water.example.com",
    }),
    headers: { "Content-Type": "application/json" },
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(providerCalls, 1);
  assert.equal(body.profile.technology, "municipal water sensors");
  assert.equal(body.externalProcessing.completed, true);
  assert.match(body.externalProcessingDisclosure, /sent to OpenAI/);
  assert.match(body.externalProcessingDisclosure, /does not decide eligibility/);
});

test("website intake discovers useful pages from site structure without site-specific routes", async () => {
  const requestedPaths: string[] = [];
  const pages: Record<string, string> = {
    "/": [
      "<html><head><title>Northstar Systems</title></head><body>",
      "<header><nav>",
      "<a href=\"/our-story\">Our Story</a>",
      "<a href=\"/work\">What We Do</a>",
      "<a href=\"/fields\">Who We Serve</a>",
      "<a href=\"/login\">Sign in</a>",
      "</nav></header>",
      "<a href=\"/journal/2026/post\">Latest post</a>",
      "<footer><a href=\"/privacy\">Privacy</a><a href=\"/our-story\">Company</a></footer>",
      "</body></html>",
    ].join(""),
    "/our-story": "<html><body>Founded in 2021 to make industrial robotics safer.</body></html>",
    "/work": "<html><body>We turn expert human judgment into robotics training data.</body></html>",
    "/fields": "<html><body>We serve manufacturing, logistics, and healthcare teams.</body></html>",
    "/login": "<html><body>Account login</body></html>",
    "/journal/2026/post": "<html><body>News post</body></html>",
    "/privacy": "<html><body>Privacy policy</body></html>",
  };
  const snapshot = await fetchWebsiteEvidence("northstar.example.com", async (input) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    requestedPaths.push(url.pathname);
    return new Response(pages[url.pathname] ?? "", {
      status: pages[url.pathname] ? 200 : 404,
      headers: { "content-type": "text/html" },
    });
  });

  assert.equal(snapshot.profile.website, "https://northstar.example.com/");
  assert.ok(requestedPaths.includes("/our-story"));
  assert.ok(requestedPaths.includes("/work"));
  assert.ok(requestedPaths.includes("/fields"));
  assert.match(snapshot.evidenceText, /industrial robotics safer/);
  assert.match(snapshot.evidenceText, /robotics training data/);
  assert.match(snapshot.evidenceText, /manufacturing, logistics, and healthcare/);
  assert.ok(snapshot.reviewedUrls.length <= 6);
});

test("website intake falls back to a same-origin sitemap when navigation is client-rendered", async () => {
  const pages: Record<string, { body: string; type: string }> = {
    "/": {
      body: [
        "<html><head><title>Atlas Labs</title></head><body><div id=\"app\"></div><nav>",
        "<a href=\"/privacy\">Privacy</a><a href=\"/terms\">Terms</a>",
        "<a href=\"/login\">Sign in</a><a href=\"/contact\">Contact</a>",
        "<a href=\"/news\">News</a></nav></body></html>",
      ].join(""),
      type: "text/html",
    },
    "/sitemap.xml": {
      body: [
        "<urlset>",
        "<url><loc>https://atlas.example.com/</loc></url>",
        "<url><loc>https://atlas.example.com/identity</loc></url>",
        "<url><loc>https://atlas.example.com/craft</loc></url>",
        "<url><loc>https://atlas.example.com/sectors</loc></url>",
        "<url><loc>https://atlas.example.com/proof</loc></url>",
        "<url><loc>https://atlas.example.com/standards</loc></url>",
        "</urlset>",
      ].join(""),
      type: "application/xml",
    },
    "/identity": { body: "<html><body>Atlas Labs was founded in 2022.</body></html>", type: "text/html" },
    "/craft": { body: "<html><body>We build autonomous inspection systems.</body></html>", type: "text/html" },
    "/sectors": { body: "<html><body>We serve energy and transportation operators.</body></html>", type: "text/html" },
    "/proof": { body: "<html><body>Field validation and test results.</body></html>", type: "text/html" },
    "/standards": { body: "<html><body>Safety and compliance practices.</body></html>", type: "text/html" },
  };
  const snapshot = await fetchWebsiteEvidence("atlas.example.com", async (input) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const value = pages[url.pathname];
    return new Response(value?.body ?? "", {
      status: value ? 200 : 404,
      headers: { "content-type": value?.type ?? "text/plain" },
    });
  });

  assert.ok(snapshot.reviewedUrls.includes("https://atlas.example.com/craft"));
  assert.match(snapshot.evidenceText, /autonomous inspection systems/);
  assert.match(snapshot.evidenceText, /energy and transportation operators/);
  assert.equal(snapshot.profile.yearFounded, "2022");
});

test("website intake extracts readable first-party application text from a thin SPA shell", async () => {
  const snapshot = await fetchWebsiteEvidence("spa.example.com", async (input) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    if (url.pathname === "/") {
      return new Response(
        "<html><head><title>Signal Forge</title><script type=\"module\" src=\"/assets/app.js\"></script></head><body><div id=\"root\"></div></body></html>",
        { headers: { "content-type": "text/html" } },
      );
    }
    if (url.pathname === "/assets/app.js") {
      return new Response([
        "const capability=\"We build autonomous inspection systems for industrial field teams.\";",
        "const customers='Our customers operate energy and transportation infrastructure.';",
        "const noise=\"display:flex items-center gap-4 hover:bg-black\";",
      ].join(""), { headers: { "content-type": "text/javascript" } });
    }
    return new Response("not found", { status: 404 });
  });

  assert.deepEqual(snapshot.reviewedAssets, ["https://spa.example.com/assets/app.js"]);
  assert.match(snapshot.evidenceText, /autonomous inspection systems/);
  assert.match(snapshot.evidenceText, /energy and transportation infrastructure/);
  assert.equal(snapshot.evidenceText.includes("display:flex items-center"), false);
});

test("website intake rejects private literals and redirect targets before requesting them", async () => {
  let privateCalls = 0;
  await assert.rejects(
    fetchWebsiteEvidence("https://[::ffff:127.0.0.1]", async () => {
      privateCalls += 1;
      return new Response("unexpected");
    }),
    /public company website/,
  );
  assert.equal(privateCalls, 0);

  let redirectCalls = 0;
  await assert.rejects(
    fetchWebsiteEvidence("public.example.com", async () => {
      redirectCalls += 1;
      return new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/internal" },
      });
    }),
    /public company website/,
  );
  assert.equal(redirectCalls, 1);
});

test("website intake enforces decoded streaming byte limits without Content-Length", async () => {
  const oversizedBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(600_000));
      controller.enqueue(new Uint8Array(600_000));
      controller.close();
    },
  });
  await assert.rejects(
    fetchWebsiteEvidence("bounded.example.com", async () => new Response(oversizedBody, {
      headers: { "content-type": "text/html" },
    })),
    /too large to review safely/,
  );
});

test("website URL markers never create company concepts by themselves", async () => {
  const snapshot = await fetchWebsiteEvidence("markers.example.com", async (input) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    if (url.pathname === "/") {
      return new Response("<html><head><title>Marker Company</title></head><body><a href=\"/robotics\">Learn more</a></body></html>", {
        headers: { "content-type": "text/html" },
      });
    }
    if (url.pathname === "/robotics") {
      return new Response("<html><body>Learn more about our work.</body></html>", {
        headers: { "content-type": "text/html" },
      });
    }
    return new Response("not found", { status: 404 });
  });

  assert.equal(snapshot.profile.industry, "");
  assert.equal(snapshot.profile.technology, "");
  assert.equal(normalizePublicWebsiteUrl("example.com").toString(), "https://example.com/");
});
