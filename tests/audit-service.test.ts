// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import { publicFixtureSchema } from "@/lib/contracts";
import { deterministicMockOutput } from "@/lib/mock-audit.server";
import { AuditServiceError, MockAuditGateway, OpenAICompatibleAuditGateway, buildModelInput, executeLiveAudit, type AuditModelGateway } from "@/lib/audit-service.server";

const request = { schemaVersion: "audit-api/v1" as const, fixtureId: "ashglass-clocktower-v1", clientRequestId: "service-test", intent: { mode: "live" as const } };

describe("audit service", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("projects only public model input", () => {
    const projected = buildModelInput(publicFixtureSchema.parse(ashglass));
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("RG-C01");
    expect(serialized).not.toContain("expected");
    expect(serialized).not.toContain("ground");
    expect(projected.rules).toHaveLength(10);
    expect(projected.spans).toHaveLength(18);
  });

  it("runs the deterministic gateway through validation and assigns server IDs", async () => {
    const response = await executeLiveAudit(request, { gateway: new MockAuditGateway() });
    expect(response.ok).toBe(true);
    expect(response.audit.source.mode).toBe("mock");
    expect(response.audit.findings.map((finding) => finding.id)).toEqual(["finding-01", "finding-02"]);
    expect(response.audit.findings.map((finding) => finding.kind)).toEqual(["contradiction", "ambiguity"]);
  });

  it("types malformed output before it reaches a client DTO", async () => {
    const gateway: AuditModelGateway = { generate: async () => ({ output: { wrong: true }, provider: "test", endpointHost: "test", requestedModel: "broken", returnedModel: "broken", rawResponse: {} }) };
    await expect(executeLiveAudit(request, { gateway })).rejects.toMatchObject({ code: "MALFORMED_OUTPUT", status: 422 });
  });

  it("re-parses provider-shaped output with the stronger canonical schema", async () => {
    const valid = await new MockAuditGateway().generate();
    const output = structuredClone(valid.output) as { findings: Array<{ supported_readings: unknown[] }> };
    output.findings[1].supported_readings = [];
    const gateway: AuditModelGateway = { generate: async () => ({ ...valid, output }) };
    await expect(executeLiveAudit(request, { gateway })).rejects.toMatchObject({ code: "MALFORMED_OUTPUT", status: 422 });
  });

  it("types invalid citations before normalization", async () => {
    const valid = await new MockAuditGateway().generate();
    const output = structuredClone(valid.output) as { findings: Array<{ rule_ids: string[] }> };
    output.findings[0].rule_ids[0] = "UNKNOWN-RULE";
    const gateway: AuditModelGateway = { generate: async () => ({ ...valid, output }) };
    await expect(executeLiveAudit(request, { gateway })).rejects.toMatchObject({ code: "INVALID_CITATIONS", status: 422 });
  });

  it("rejects captured intent because no truthful capture exists", async () => {
    await expect(executeLiveAudit({ ...request, intent: { mode: "captured", offerToken: "signed-but-no-capture" } }, { gateway: new MockAuditGateway() })).rejects.toEqual(expect.any(AuditServiceError));
  });

  it("sends OpenRouter a strict chat-completions request without putting the key in the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "generation-test",
      object: "chat.completion",
      created: 1,
      model: "openai/gpt-oss-120b:free",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(deterministicMockOutput) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new OpenAICompatibleAuditGateway({
      provider: "openrouter",
      apiEndpoint: "https://openrouter.ai/api/v1",
      endpointHost: "openrouter.ai",
      model: "openai/gpt-oss-120b:free",
      apiKey: "session-secret",
      credentialSource: "request",
    });

    const generated = await gateway.generate(buildModelInput(publicFixtureSchema.parse(ashglass)));
    expect(generated).toMatchObject({ provider: "openrouter", endpointHost: "openrouter.ai", requestedModel: "openai/gpt-oss-120b:free" });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      model: "openai/gpt-oss-120b:free",
      max_tokens: 16_000,
      provider: { require_parameters: true },
      response_format: { type: "json_schema", json_schema: { name: "misrule_audit", strict: true } },
    });
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(JSON.stringify(body)).not.toContain("session-secret");
  });

  it("returns unparseable provider text for canonical rejection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "generation-invalid-json",
      object: "chat.completion",
      created: 1,
      model: "google/gemini-2.5-flash",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "not-json" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new OpenAICompatibleAuditGateway({
      provider: "openrouter",
      apiEndpoint: "https://openrouter.ai/api/v1",
      endpointHost: "openrouter.ai",
      model: "google/gemini-2.5-flash",
      apiKey: "session-secret",
      credentialSource: "request",
    });

    await expect(gateway.generate(buildModelInput(publicFixtureSchema.parse(ashglass)))).resolves.toMatchObject({ output: "not-json" });
  });

  it("types provider model or parameter rejection separately from outage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "No endpoints found", code: 404 } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })));
    const gateway = new OpenAICompatibleAuditGateway({
      provider: "openrouter",
      apiEndpoint: "https://openrouter.ai/api/v1",
      endpointHost: "openrouter.ai",
      model: "retired/model",
      apiKey: "session-secret",
      credentialSource: "request",
    });

    await expect(gateway.generate(buildModelInput(publicFixtureSchema.parse(ashglass)))).rejects.toMatchObject({
      code: "UPSTREAM_REQUEST_REJECTED",
      status: 422,
      retryable: false,
    });
  });
});
