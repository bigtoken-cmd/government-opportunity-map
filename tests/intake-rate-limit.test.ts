import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeIntakeRequest,
  withIntakeRateLimit,
} from "../src/lib/intake/intake-rate-limit";

function limiter(success: boolean, keys: string[]) {
  return {
    limit: async ({ key }: { key: string }) => {
      keys.push(key);
      return { success };
    },
  };
}

test("intake authorization uses existing route, client, and global protections", async () => {
  const keys: string[] = [];
  const request = new Request("https://example.test/api/intake/bundle", {
    headers: { "cf-connecting-ip": "203.0.113.9" },
  });
  const authorization = await authorizeIntakeRequest(request, {
    loadEnvironment: async () => ({
      OPPORTUNITY_SEARCH_CLIENT_LIMITER: limiter(true, keys),
      OPPORTUNITY_SEMANTIC_CLIENT_LIMITER: limiter(true, keys),
      OPPORTUNITY_SEMANTIC_GLOBAL_LIMITER: limiter(true, keys),
    }),
  });

  assert.equal(authorization, "allowed");
  assert.deepEqual(keys, [
    "intake:203.0.113.9",
    "intake-extraction:203.0.113.9",
    "intake-extraction:global",
  ]);
});

test("intake rate limiting stops work before the route handler", async () => {
  let handlerCalls = 0;
  const post = withIntakeRateLimit(async () => {
    handlerCalls += 1;
    return Response.json({ ok: true });
  }, {
    loadEnvironment: async () => ({
      OPPORTUNITY_SEARCH_CLIENT_LIMITER: limiter(false, []),
      OPPORTUNITY_SEMANTIC_CLIENT_LIMITER: limiter(true, []),
      OPPORTUNITY_SEMANTIC_GLOBAL_LIMITER: limiter(true, []),
    }),
  });

  const response = await post(new Request("https://example.test/api/intake/website"));
  assert.equal(response.status, 429);
  assert.equal(handlerCalls, 0);
});

test("missing intake protection fails closed in authorization", async () => {
  const authorization = await authorizeIntakeRequest(
    new Request("https://example.test/api/intake/evidence"),
    { loadEnvironment: async () => ({}) },
  );
  assert.equal(authorization, "unavailable");
});
