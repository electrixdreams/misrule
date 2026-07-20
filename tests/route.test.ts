import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/audit/route";

describe("POST /api/audit", () => {
  const previousMode = process.env.MISRULE_AUDIT_MODE;
  afterEach(() => {
    if (previousMode === undefined) delete process.env.MISRULE_AUDIT_MODE;
    else process.env.MISRULE_AUDIT_MODE = previousMode;
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
});
