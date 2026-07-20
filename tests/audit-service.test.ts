// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import portable from "@/tests/fixtures/portable-two-book-world-pack.json";
import { worldPackSchema } from "@/lib/world-pack";
import { deterministicMockOutput } from "@/lib/mock-audit.server";
import { AuditServiceError, MockAuditGateway, OpenAICompatibleAuditGateway, buildModelInput, executeLiveAudit, type AuditModelGateway } from "@/lib/audit-service.server";

const request = {
  schemaVersion: "audit-api/v2" as const,
  clientRequestId: "service-test",
  source: { kind: "bundled" as const, packId: "ashglass-clocktower-v1" },
  intent: { mode: "live" as const },
};

const portableOutput = {
  schema_version: "model-output/v1" as const,
  findings: [
    {
      kind: "contradiction" as const,
      title: "Two tides follow one bell",
      rule_ids: ["LAW-A"],
      span_ids: ["NOTE-A", "NOTE-B"],
      path_steps: [
        { kind: "rule" as const, ref_id: "LAW-A", text: "Only one tide may enter." },
        { kind: "span" as const, ref_id: "NOTE-A", text: "The white tide entered." },
        { kind: "span" as const, ref_id: "NOTE-B", text: "The black tide entered." },
      ],
      explanation: "Both records place a different tide after the same bell.",
      missing_fact: null,
      why_unresolved: null,
      supported_readings: [],
    },
    {
      kind: "ambiguity" as const,
      title: "Which bell governed the dusk entry?",
      rule_ids: ["LAW-B"],
      span_ids: ["NOTE-B"],
      path_steps: [
        { kind: "rule" as const, ref_id: "LAW-B", text: "The dusk bell rang once." },
        { kind: "span" as const, ref_id: "NOTE-B", text: "The black tide entered after the same bell." },
      ],
      explanation: "The record does not identify which earlier bell it means.",
      missing_fact: "Whether the referenced bell was the dusk bell.",
      why_unresolved: "The source says only the same bell.",
      supported_readings: [
        { label: "Dusk bell", outcome: "contradiction_supported" as const, explanation: "The dusk rule controls the entry." },
        { label: "Other bell", outcome: "contradiction_not_supported" as const, explanation: "The dusk rule does not control the entry." },
      ],
    },
  ],
  unresolved_questions: ["Which bell did NOTE-B reference?"],
};

describe("audit service", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("projects only public model input", () => {
    const projected = buildModelInput(worldPackSchema.parse(ashglass));
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

  it("runs a two-book non-RG inline pack through projection, validation, citations, and normalization", async () => {
    const pack = worldPackSchema.parse(portable);
    const response = await executeLiveAudit(
      { ...request, clientRequestId: "portable-service", source: { kind: "inline", pack } },
      { gateway: new MockAuditGateway(portableOutput) },
    );
    expect(response.audit).toMatchObject({ schemaVersion: "audit-api/v2", packId: "portable-world-v1", packVersion: "1.0.0" });
    expect(response.audit.findings.map((finding) => finding.kind)).toEqual(["contradiction", "ambiguity"]);
    expect(response.audit.findings[0].ruleRefs[0].id).toBe("LAW-A");
    expect(response.audit.findings[0].spanRefs.map((reference) => reference.id)).toEqual(["NOTE-A", "NOTE-B"]);
    expect(buildModelInput(pack).books.map((book) => book.bookId)).toEqual(["volume-dawn", "volume-dusk"]);
  });

  it("rejects invalid inline packs and unknown bundled packs before gateway invocation", async () => {
    const pack = worldPackSchema.parse(portable);
    const invalidPack = { ...pack, spans: [{ ...pack.spans[0], bookId: "missing" }, pack.spans[1]] };
    const generate = vi.fn();
    await expect(executeLiveAudit(
      { ...request, source: { kind: "inline", pack: invalidPack } } as never,
      { gateway: { generate } },
    )).rejects.toMatchObject({ code: "WORLD_PACK_INVALID", status: 400 });
    await expect(executeLiveAudit(
      { ...request, source: { kind: "bundled", packId: "not-mounted" } },
      { gateway: { generate } },
    )).rejects.toMatchObject({ code: "WORLD_PACK_NOT_FOUND", status: 404 });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects a valid but oversized inline pack before model invocation", async () => {
    const pack = worldPackSchema.parse(portable);
    const oversized = worldPackSchema.parse({
      ...pack,
      spans: Array.from({ length: 200 }, (_, index) => ({
        ...pack.spans[index % pack.spans.length],
        spanId: `OVERSIZED-${index}`,
        displayOrder: index,
        text: "x".repeat(4_000),
      })),
    });
    const generate = vi.fn();
    await expect(executeLiveAudit(
      { ...request, source: { kind: "inline", pack: oversized } },
      { gateway: { generate } },
    )).rejects.toMatchObject({ code: "WORLD_PACK_TOO_LARGE", status: 413 });
    expect(generate).not.toHaveBeenCalled();
  });

  it("never preserves inline author material but retains bundled synthetic evidence eligibility", async () => {
    const directory = await mkdtemp(join(tmpdir(), "misrule-world-pack-evidence-"));
    try {
      const pack = worldPackSchema.parse(portable);
      await executeLiveAudit(
        { ...request, source: { kind: "inline", pack } },
        { gateway: new MockAuditGateway(portableOutput), evidenceDirectory: directory },
      );
      expect(await readdir(directory)).toEqual([]);

      await executeLiveAudit(request, { gateway: new MockAuditGateway(), evidenceDirectory: directory });
      expect(await readdir(directory)).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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

    const generated = await gateway.generate(buildModelInput(worldPackSchema.parse(ashglass)));
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

    await expect(gateway.generate(buildModelInput(worldPackSchema.parse(ashglass)))).resolves.toMatchObject({ output: "not-json" });
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

    await expect(gateway.generate(buildModelInput(worldPackSchema.parse(ashglass)))).rejects.toMatchObject({
      code: "UPSTREAM_REQUEST_REJECTED",
      status: 422,
      retryable: false,
    });
  });
});
