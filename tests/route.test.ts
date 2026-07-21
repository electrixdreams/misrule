// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/audit/route";

describe("POST /api/audit", () => {
  const previousEnv = {
    MISRULE_AUDIT_MODE: process.env.MISRULE_AUDIT_MODE,
    MISRULE_PROVIDER: process.env.MISRULE_PROVIDER,
    MISRULE_API_ENDPOINT: process.env.MISRULE_API_ENDPOINT,
    MISRULE_MODEL: process.env.MISRULE_MODEL,
    MISRULE_OUTPUT_TRANSPORT: process.env.MISRULE_OUTPUT_TRANSPORT,
    MISRULE_ALLOWED_PROVIDER_HOSTS: process.env.MISRULE_ALLOWED_PROVIDER_HOSTS,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    MISRULE_EVIDENCE_DIR: process.env.MISRULE_EVIDENCE_DIR,
    MISRULE_RUNTIME_MODE: process.env.MISRULE_RUNTIME_MODE,
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("rejects unsupported browser input", async () => {
    const response = await POST(new Request("http://localhost/api/audit", { method: "POST", body: JSON.stringify({ fixtureId: "ashglass-clocktower-v1", rules: [] }) }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it("returns a sanitized deterministic response through the actual route boundary", async () => {
    process.env.MISRULE_AUDIT_MODE = "mock";
    const response = await POST(new Request("http://localhost/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: "audit-api/v2", clientRequestId: "route-test", source: { kind: "bundled", packId: "ashglass-clocktower-v1" }, intent: { mode: "live" } }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ ok: true, requestId: "route-test", audit: { source: { mode: "mock" } } });
    expect(JSON.stringify(body)).not.toContain("rawResponse");
    expect(JSON.stringify(body)).not.toContain("schema_version");
  });

  it("rejects oversized declared and streamed request bodies with sanitized typed errors", async () => {
    const declared = await POST(new Request("http://localhost/api/audit", {
      method: "POST",
      headers: { "Content-Length": String(1024 * 1024 + 1) },
      body: "{}",
    }));
    expect(declared.status).toBe(413);
    await expect(declared.json()).resolves.toMatchObject({ error: { code: "REQUEST_TOO_LARGE", retryable: false } });

    const streamed = await POST(new Request("http://localhost/api/audit", {
      method: "POST",
      body: JSON.stringify({ padding: "x".repeat(1024 * 1024) }),
    }));
    expect(streamed.status).toBe(413);
    await expect(streamed.json()).resolves.toMatchObject({ error: { code: "REQUEST_TOO_LARGE", retryable: false } });
  });

  it("rejects an oversized inline pack before request-contract validation", async () => {
    const response = await POST(new Request("http://localhost/api/audit", {
      method: "POST",
      body: JSON.stringify({
        schemaVersion: "audit-api/v2",
        clientRequestId: "oversized-pack",
        source: { kind: "inline", pack: { text: "x".repeat(768 * 1024) } },
        intent: { mode: "live" },
      }),
    }));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ requestId: "oversized-pack", error: { code: "WORLD_PACK_TOO_LARGE", retryable: false } });
  });

  it("keeps provider rejection diagnostics out of the public error response", async () => {
    process.env.MISRULE_AUDIT_MODE = "live";
    process.env.MISRULE_PROVIDER = "openrouter";
    process.env.MISRULE_API_ENDPOINT = "https://openrouter.ai/api/v1";
    process.env.MISRULE_MODEL = "google/gemini-2.5-flash";
    process.env.MISRULE_ALLOWED_PROVIDER_HOSTS = "openrouter.ai";
    process.env.OPENROUTER_API_KEY = "server-secret";
    delete process.env.MISRULE_EVIDENCE_DIR;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "unsupported response_format json_schema", code: "invalid_schema", type: "invalid_request_error" },
    }), {
      status: 422,
      headers: { "Content-Type": "application/json", "x-request-id": "req-public" },
    })));

    const response = await POST(new Request("http://localhost/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaVersion: "audit-api/v2",
        clientRequestId: "route-provider-rejection",
        source: { kind: "bundled", packId: "ashglass-clocktower-v1" },
        intent: { mode: "live" },
      }),
    }));
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(422);
    expect(body).toEqual({
      ok: false,
      requestId: "route-provider-rejection",
      error: {
        code: "UPSTREAM_REQUEST_REJECTED",
        message: "The provider rejected the selected model or request parameters.",
        retryable: false,
        fallbackOffer: null,
      },
    });
    expect(JSON.stringify(body)).not.toContain("providerFailure");
    expect(JSON.stringify(body)).not.toContain("upstreamStatus");
    expect(JSON.stringify(body)).not.toContain("req-public");
    expect(JSON.stringify(body)).not.toContain("server-secret");
  });

  it("rejects forged locked-mode runtime overrides before a provider call", async () => {
    process.env.MISRULE_AUDIT_MODE = "live";
    process.env.MISRULE_RUNTIME_MODE = "locked";
    process.env.MISRULE_PROVIDER = "openrouter";
    process.env.MISRULE_API_ENDPOINT = "https://openrouter.ai/api/v1";
    process.env.MISRULE_MODEL = "google/gemini-2.5-flash";
    process.env.MISRULE_OUTPUT_TRANSPORT = "json_object";
    process.env.MISRULE_ALLOWED_PROVIDER_HOSTS = "openrouter.ai";
    process.env.OPENROUTER_API_KEY = "server-secret";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("http://localhost/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaVersion: "audit-api/v2",
        clientRequestId: "forged-runtime",
        source: { kind: "bundled", packId: "ashglass-clocktower-v1" },
        intent: { mode: "live" },
        runtime: {
          provider: "openai-compatible",
          apiEndpoint: "https://api.openai.com/v1",
          model: "forged/model",
          apiKey: "forged-key",
        },
      }),
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, requestId: "forged-runtime", error: { code: "INVALID_REQUEST" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
