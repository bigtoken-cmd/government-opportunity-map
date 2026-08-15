import assert from "node:assert/strict";
import test from "node:test";
import { searchAssistanceListings } from "../src/lib/sources/assistance-listings";
import { searchGrants } from "../src/lib/sources/grants";
import { searchSbirAwards } from "../src/lib/sources/sbir";
import { searchUsaSpending } from "../src/lib/sources/usaspending";

const now = () => new Date("2026-08-14T00:00:00.000Z");

test("a valid empty Grants.gov response stays live while malformed 200 becomes unavailable", async () => {
  const empty = await searchGrants(
    { keyword: "specific concept" },
    { now, fetcher: async () => new Response(JSON.stringify({ errorcode: 0, data: { oppHits: [] } })) },
  );
  const malformed = await searchGrants(
    { keyword: "specific concept" },
    { now, fetcher: async () => new Response(JSON.stringify({ errorcode: 0, data: {} })) },
  );

  assert.equal(empty.status, "live");
  assert.deepEqual(empty.records, []);
  assert.equal(malformed.status, "unavailable");
  assert.deepEqual(malformed.records, []);
});

test("transport failures use only the relevant official fallback", async () => {
  const grants = await searchGrants(
    { keyword: "water" },
    { now, fetcher: async () => { throw new Error("offline"); } },
  );
  const spending = await searchUsaSpending(
    "93.310",
    { now, fetcher: async () => { throw new Error("offline"); } },
  );

  assert.equal(grants.status, "cached-fallback");
  assert.equal(spending.status, "cached-fallback");
  assert.ok(grants.records.every((record) => record.kind === "current_opportunity"));
  assert.ok(spending.records.every((record) => record.kind === "historical_award"));
});

test("program and SBIR adapters never claim current opportunity roles", async () => {
  const programs = await searchAssistanceListings({ assistanceListing: "93.310" }, { mode: "cached", now });
  const sbir = await searchSbirAwards("water", { mode: "cached", now });

  assert.ok(programs.records.every((record) => record.kind === "program_context"));
  assert.ok(sbir.records.every((record) => record.kind === "historical_award"));
  assert.equal(sbir.status, "cached");
});
