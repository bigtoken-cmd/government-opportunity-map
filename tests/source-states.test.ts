import assert from "node:assert/strict";
import test from "node:test";
import { searchAssistanceListings } from "../src/lib/sources/assistance-listings";
import type { AssistanceListingsStore } from "../src/lib/sources/assistance-listings-store";
import { searchGrants } from "../src/lib/sources/grants";
import { searchSbirAwards } from "../src/lib/sources/sbir";
import type { SbirAwardsStore } from "../src/lib/sources/sbir-store";
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

test("snapshot-store failures become honest adapter results instead of rejections", async () => {
  const assistanceStore = {
    metadata: async () => {
      throw new Error("assistance store unavailable");
    },
  } as unknown as AssistanceListingsStore;
  const sbirStore = {
    metadata: async () => {
      throw new Error("SBIR store unavailable");
    },
  } as unknown as SbirAwardsStore;

  const programs = await searchAssistanceListings(
    { assistanceListing: "93.310" },
    { store: assistanceStore, now },
  );
  const sbir = await searchSbirAwards("water", { store: sbirStore, now });

  assert.equal(programs.status, "cached-fallback");
  assert.equal(programs.records[0]?.assistanceListing, "93.310");
  assert.match(programs.warning ?? "", /snapshot store/i);
  assert.equal(sbir.status, "unavailable");
  assert.deepEqual(sbir.records, []);
  assert.match(sbir.warning ?? "", /snapshot store/i);
});
