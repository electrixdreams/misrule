// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import portable from "@/tests/fixtures/portable-two-book-world-pack.json";
import { worldPackSchema } from "@/lib/world-pack";
import { deterministicMockOutput } from "@/lib/mock-audit.server";
import { zodResponseFormat } from "openai/helpers/zod";
import { adjudicationOutputTransportSchema } from "@/lib/adjudication-output.server";
import { candidateOutputTransportSchema } from "@/lib/candidate-output.server";
import {
  ADJUDICATION_PROMPT_VERSION,
  ADJUDICATION_SCHEMA_VERSION,
  AuditServiceError,
  CANDIDATE_PROMPT_VERSION,
  CANDIDATE_SCHEMA_VERSION,
  MockAuditGateway,
  OpenAICompatibleAuditGateway,
  buildModelInput,
  executeLiveAudit,
  type AuditModelGateway,
  type GatewayStageResult,
} from "@/lib/audit-service.server";

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

function stageResult(stage: GatewayStageResult["stage"], output: unknown): GatewayStageResult {
  return {
    stage,
    promptVersion: stage === "candidate-generation" ? CANDIDATE_PROMPT_VERSION : ADJUDICATION_PROMPT_VERSION,
    schemaVersion: stage === "candidate-generation" ? CANDIDATE_SCHEMA_VERSION : ADJUDICATION_SCHEMA_VERSION,
    output,
    provider: "test",
    endpointHost: "test",
    requestedModel: "test-model",
    returnedModel: "test-model",
    rawResponse: { output },
    latencyMs: 0,
  };
}

function candidateOutputFrom(findings: unknown[] = portableOutput.findings, unresolvedQuestions: string[] = portableOutput.unresolved_questions) {
  return {
    schema_version: "candidate-output/v1" as const,
    candidates: findings,
    unresolved_questions: unresolvedQuestions,
  };
}

function acceptDecision(candidateId: string, finding: unknown) {
  return { candidate_id: candidateId, decision: "accept" as const, finding };
}

function rejectDecision(candidateId: string) {
  return {
    candidate_id: candidateId,
    decision: "reject" as const,
    rejection_reason: "consistent_with_rules" as const,
    explanation: "The cited path remains consistent with the supplied rules.",
  };
}

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

  it("accepts only adjudicated findings and treats a rejection as a successful zero-finding audit", async () => {
    const pack = worldPackSchema.parse(portable);
    const adjudicationOutput = { schema_version: "adjudication-output/v1" as const, decisions: [rejectDecision("candidate-01")] };
    const response = await executeLiveAudit(
      { ...request, clientRequestId: "reject-service", source: { kind: "inline", pack } },
      { gateway: new MockAuditGateway({ ...portableOutput, findings: [portableOutput.findings[0]] }, adjudicationOutput) },
    );
    expect(response.audit.schemaVersion).toBe("audit-api/v2");
    expect(response.audit.findings).toEqual([]);
    expect(response.audit.unresolvedQuestions).toEqual(portableOutput.unresolved_questions);
  });

  it("skips adjudication when candidate generation returns zero candidates", async () => {
    const adjudicateCandidates = vi.fn();
    const gateway: AuditModelGateway = {
      generateCandidates: async () => stageResult("candidate-generation", candidateOutputFrom([], ["No supported candidates were found."])),
      adjudicateCandidates,
    };
    const response = await executeLiveAudit(request, { gateway });
    expect(response.audit.findings).toEqual([]);
    expect(response.audit.unresolvedQuestions).toEqual(["No supported candidates were found."]);
    expect(adjudicateCandidates).not.toHaveBeenCalled();
  });

  it("allows adjudication to reclassify a candidate using only candidate evidence", async () => {
    const pack = worldPackSchema.parse(portable);
    const reclassifiedFinding = {
      ...portableOutput.findings[0],
      kind: "ambiguity" as const,
      missing_fact: "Which tide entered first after the bell.",
      why_unresolved: "The notes do not establish sequence between the two entries.",
      supported_readings: [
        { label: "White first", outcome: "contradiction_supported" as const, explanation: "The second entry violates the single-tide rule." },
        { label: "Same tide reading", outcome: "contradiction_not_supported" as const, explanation: "If the notes name one event two ways, no second entry is established." },
      ],
    };
    const adjudicationOutput = { schema_version: "adjudication-output/v1" as const, decisions: [acceptDecision("candidate-01", reclassifiedFinding)] };
    const response = await executeLiveAudit(
      { ...request, clientRequestId: "reclassify-service", source: { kind: "inline", pack } },
      { gateway: new MockAuditGateway({ ...portableOutput, findings: [portableOutput.findings[0]] }, adjudicationOutput) },
    );
    expect(response.audit.findings).toHaveLength(1);
    expect(response.audit.findings[0].kind).toBe("ambiguity");
    expect(response.audit.findings[0].ruleRefs.map((reference) => reference.id)).toEqual(["LAW-A"]);
  });

  it("fails closed when adjudication accepts a finding with added citations", async () => {
    const pack = worldPackSchema.parse(portable);
    const expandedFinding = {
      ...portableOutput.findings[0],
      rule_ids: ["LAW-A", "LAW-B"],
      path_steps: [
        ...portableOutput.findings[0].path_steps,
        { kind: "rule" as const, ref_id: "LAW-B", text: "The dusk bell rang once." },
      ],
    };
    await expect(executeLiveAudit(
      { ...request, clientRequestId: "expanded-citation-service", source: { kind: "inline", pack } },
      { gateway: new MockAuditGateway({ ...portableOutput, findings: [portableOutput.findings[0]] }, { schema_version: "adjudication-output/v1", decisions: [acceptDecision("candidate-01", expandedFinding)] }) },
    )).rejects.toMatchObject({ code: "INVALID_CITATIONS", status: 422 });
  });

  it("fails closed on missing, duplicate, and unknown adjudication decision IDs", async () => {
    const pack = worldPackSchema.parse(portable);
    const cases = [
      { schema_version: "adjudication-output/v1" as const, decisions: [] },
      { schema_version: "adjudication-output/v1" as const, decisions: [rejectDecision("candidate-01"), rejectDecision("candidate-01")] },
      { schema_version: "adjudication-output/v1" as const, decisions: [rejectDecision("candidate-99")] },
    ];
    for (const adjudicationOutput of cases) {
      await expect(executeLiveAudit(
        { ...request, clientRequestId: "decision-id-service", source: { kind: "inline", pack } },
        { gateway: new MockAuditGateway({ ...portableOutput, findings: [portableOutput.findings[0]] }, adjudicationOutput) },
      )).rejects.toMatchObject({ status: 422 });
    }
  });

  it("fails closed on duplicate accepted final findings", async () => {
    const pack = worldPackSchema.parse(portable);
    const ambiguityCandidate = {
      ...portableOutput.findings[0],
      kind: "ambiguity" as const,
      missing_fact: "Whether the notes describe two tide entries or one entry twice.",
      why_unresolved: "The notes share the same bell but do not identify whether the entries are distinct.",
      supported_readings: [
        { label: "Distinct entries", outcome: "contradiction_supported" as const, explanation: "Two tide entries violate the single-tide rule." },
        { label: "One entry twice", outcome: "contradiction_not_supported" as const, explanation: "One entry repeated in two notes does not violate the rule." },
      ],
    };
    const adjudicationOutput = {
      schema_version: "adjudication-output/v1" as const,
      decisions: [acceptDecision("candidate-01", portableOutput.findings[0]), acceptDecision("candidate-02", portableOutput.findings[0])],
    };
    await expect(executeLiveAudit(
      { ...request, clientRequestId: "duplicate-final-service", source: { kind: "inline", pack } },
      { gateway: new MockAuditGateway({ ...portableOutput, findings: [portableOutput.findings[0], ambiguityCandidate] }, adjudicationOutput) },
    )).rejects.toMatchObject({ code: "INVALID_CITATIONS", status: 422 });
  });

  it("rejects invalid inline packs and unknown bundled packs before gateway invocation", async () => {
    const pack = worldPackSchema.parse(portable);
    const invalidPack = { ...pack, spans: [{ ...pack.spans[0], bookId: "missing" }, pack.spans[1]] };
    const generateCandidates = vi.fn();
    await expect(executeLiveAudit(
      { ...request, source: { kind: "inline", pack: invalidPack } } as never,
      { gateway: { generateCandidates, adjudicateCandidates: vi.fn() } },
    )).rejects.toMatchObject({ code: "WORLD_PACK_INVALID", status: 400 });
    await expect(executeLiveAudit(
      { ...request, source: { kind: "bundled", packId: "not-mounted" } },
      { gateway: { generateCandidates, adjudicateCandidates: vi.fn() } },
    )).rejects.toMatchObject({ code: "WORLD_PACK_NOT_FOUND", status: 404 });
    expect(generateCandidates).not.toHaveBeenCalled();
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
    const generateCandidates = vi.fn();
    await expect(executeLiveAudit(
      { ...request, source: { kind: "inline", pack: oversized } },
      { gateway: { generateCandidates, adjudicateCandidates: vi.fn() } },
    )).rejects.toMatchObject({ code: "WORLD_PACK_TOO_LARGE", status: 413 });
    expect(generateCandidates).not.toHaveBeenCalled();
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
      const files = await readdir(directory);
      expect(files).toHaveLength(1);
      const evidence = JSON.parse(await readFile(join(directory, files[0]), "utf8"));
      expect(evidence).toMatchObject({
        evidenceVersion: "misrule-route-proof/v2",
        promptVersions: { candidates: "misrule-candidates/v1", adjudication: "misrule-adjudication/v1" },
        schemaVersions: { candidates: "candidate-output/v1", adjudication: "adjudication-output/v1", final: "model-output/v1" },
        canonicalCandidateValidation: { status: "PASS", candidateCount: 2 },
        canonicalAdjudicationValidation: { status: "PASS", decisionCount: 2, acceptedCount: 2, rejectedCount: 0 },
        acceptedCount: 2,
        rejectedCount: 0,
        finalValidation: { status: "PASS", issueCount: 0 },
      });
      expect(evidence.candidateInput).toBeDefined();
      expect(evidence.adjudicationInput).toBeDefined();
      expect(evidence.rawCandidateResponse).toBeDefined();
      expect(evidence.rawAdjudicationResponse).toBeDefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("types malformed output before it reaches a client DTO", async () => {
    const gateway: AuditModelGateway = {
      generateCandidates: async () => stageResult("candidate-generation", { wrong: true }),
      adjudicateCandidates: vi.fn(),
    };
    await expect(executeLiveAudit(request, { gateway })).rejects.toMatchObject({ code: "MALFORMED_OUTPUT", status: 422 });
  });

  it("types malformed adjudication output before final assembly", async () => {
    const pack = worldPackSchema.parse(portable);
    await expect(executeLiveAudit(
      { ...request, clientRequestId: "malformed-adjudication-service", source: { kind: "inline", pack } },
      { gateway: new MockAuditGateway({ ...portableOutput, findings: [portableOutput.findings[0]] }, { wrong: true }) },
    )).rejects.toMatchObject({ code: "MALFORMED_OUTPUT", status: 422 });
  });

  it("re-parses provider-shaped output with the stronger canonical schema", async () => {
    const valid = await new MockAuditGateway().generateCandidates(buildModelInput(worldPackSchema.parse(ashglass)));
    const output = structuredClone(valid.output) as { candidates: Array<{ supported_readings: unknown[] }> };
    output.candidates[1].supported_readings = [];
    const gateway: AuditModelGateway = {
      generateCandidates: async () => ({ ...valid, output }),
      adjudicateCandidates: vi.fn(),
    };
    await expect(executeLiveAudit(request, { gateway })).rejects.toMatchObject({ code: "MALFORMED_OUTPUT", status: 422 });
  });

  it("types invalid citations before normalization", async () => {
    const valid = await new MockAuditGateway().generateCandidates(buildModelInput(worldPackSchema.parse(ashglass)));
    const output = structuredClone(valid.output) as { candidates: Array<{ rule_ids: string[] }> };
    output.candidates[0].rule_ids[0] = "UNKNOWN-RULE";
    const gateway: AuditModelGateway = {
      generateCandidates: async () => ({ ...valid, output }),
      adjudicateCandidates: vi.fn(),
    };
    await expect(executeLiveAudit(request, { gateway })).rejects.toMatchObject({ code: "INVALID_CITATIONS", status: 422 });
  });

  it("rejects captured intent because no truthful capture exists", async () => {
    await expect(executeLiveAudit({ ...request, intent: { mode: "captured", offerToken: "signed-but-no-capture" } }, { gateway: new MockAuditGateway() })).rejects.toEqual(expect.any(AuditServiceError));
  });

  it("sends OpenRouter two strict chat-completions requests without putting the key in either body", async () => {
    const candidateOutput = candidateOutputFrom(deterministicMockOutput.findings, deterministicMockOutput.unresolved_questions);
    const adjudicationOutput = {
      schema_version: "adjudication-output/v1" as const,
      decisions: deterministicMockOutput.findings.map((finding, index) => acceptDecision(`candidate-${String(index + 1).padStart(2, "0")}`, finding)),
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      id: "generation-test",
      object: "chat.completion",
      created: 1,
      model: "openai/gpt-oss-120b:free",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(candidateOutput) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })).mockResolvedValueOnce(new Response(JSON.stringify({
      id: "adjudication-test",
      object: "chat.completion",
      created: 2,
      model: "openai/gpt-oss-120b:free",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(adjudicationOutput) } }],
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

    const response = await executeLiveAudit(request, { gateway });
    expect(response.audit).toMatchObject({ schemaVersion: "audit-api/v2", source: { mode: "live", requestedModel: "openai/gpt-oss-120b:free" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://openrouter.ai/api/v1/chat/completions");
    const candidateBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const adjudicationBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(candidateBody).toMatchObject({
      model: "openai/gpt-oss-120b:free",
      max_tokens: 16_000,
      provider: { require_parameters: true },
      response_format: { type: "json_schema", json_schema: { name: "misrule_candidates", strict: true } },
    });
    expect(adjudicationBody).toMatchObject({
      model: "openai/gpt-oss-120b:free",
      max_tokens: 16_000,
      provider: { require_parameters: true },
      response_format: { type: "json_schema", json_schema: { name: "misrule_adjudication", strict: true } },
    });
    expect(candidateBody).not.toHaveProperty("max_completion_tokens");
    expect(adjudicationBody).not.toHaveProperty("max_completion_tokens");
    expect(JSON.stringify(candidateBody)).not.toContain("session-secret");
    expect(JSON.stringify(adjudicationBody)).not.toContain("session-secret");
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

    await expect(gateway.generateCandidates(buildModelInput(worldPackSchema.parse(ashglass)))).resolves.toMatchObject({ output: "not-json" });
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

    await expect(gateway.generateCandidates(buildModelInput(worldPackSchema.parse(ashglass)))).rejects.toMatchObject({
      code: "UPSTREAM_REQUEST_REJECTED",
      status: 422,
      retryable: false,
    });
  });

  it.each([400, 404, 422])("keeps upstream %s public mapping sanitized while preserving private status", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: `unsupported response_format for status ${status}`, code: `code-${status}`, type: "invalid_request_error" },
    }), {
      status,
      headers: { "Content-Type": "application/json", "x-request-id": `req-${status}` },
    })));
    const gateway = new OpenAICompatibleAuditGateway({
      provider: "openrouter",
      apiEndpoint: "https://openrouter.ai/api/v1",
      endpointHost: "openrouter.ai",
      model: "google/gemini-2.5-flash",
      apiKey: "session-secret",
      credentialSource: "request",
    });

    await expect(gateway.generateCandidates(buildModelInput(worldPackSchema.parse(ashglass)))).rejects.toMatchObject({
      code: "UPSTREAM_REQUEST_REJECTED",
      status: 422,
      retryable: false,
      providerFailureDiagnostic: {
        stage: "candidate-generation",
        upstreamStatus: status,
        upstreamCode: `code-${status}`,
        upstreamType: "invalid_request_error",
        upstreamRequestId: `req-${status}`,
        requestedModel: "google/gemini-2.5-flash",
      },
    });
  });

  it("uses provider-portable transport schema_version enums instead of JSON Schema const", () => {
    const candidateSchema = zodResponseFormat(candidateOutputTransportSchema, "misrule_candidates").json_schema.schema as {
      properties: { schema_version: unknown };
    };
    const adjudicationSchema = zodResponseFormat(adjudicationOutputTransportSchema, "misrule_adjudication").json_schema.schema as {
      properties: { schema_version: unknown };
    };
    const serialized = JSON.stringify({ candidateSchema, adjudicationSchema });
    expect(serialized).not.toContain("\"const\"");
    expect(candidateSchema.properties.schema_version).toMatchObject({ type: "string", enum: ["candidate-output/v1"] });
    expect(adjudicationSchema.properties.schema_version).toMatchObject({ type: "string", enum: ["adjudication-output/v1"] });
  });

  it("writes safe bundled provider-failure evidence for a candidate-stage rejection", async () => {
    const directory = await mkdtemp(join(tmpdir(), "misrule-provider-candidate-fail-"));
    const storyExcerpt = "The clerk dated the emergency session to the seventeenth day of Rainfall, Year 415.";
    try {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: {
          message: `schema rejected; Bearer sk-secret-1234567890; excerpt: ${storyExcerpt}`,
          code: "invalid_schema",
          type: "invalid_request_error",
        },
      }), {
        status: 422,
        headers: { "Content-Type": "application/json", "x-request-id": "req-candidate" },
      }));
      vi.stubGlobal("fetch", fetchMock);
      const gateway = new OpenAICompatibleAuditGateway({
        provider: "openrouter",
        apiEndpoint: "https://openrouter.ai/api/v1",
        endpointHost: "openrouter.ai",
        model: "google/gemini-2.5-flash",
        apiKey: "session-secret",
        credentialSource: "request",
      });

      await expect(executeLiveAudit(request, { gateway, evidenceDirectory: directory })).rejects.toMatchObject({
        code: "UPSTREAM_REQUEST_REJECTED",
        status: 422,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const files = await readdir(directory);
      expect(files).toHaveLength(1);
      const evidence = JSON.parse(await readFile(join(directory, files[0]), "utf8"));
      expect(evidence).toMatchObject({
        evidenceVersion: "misrule-route-proof/v2",
        clientRequestId: "service-test",
        failedStage: "candidate-generation",
        provider: "openrouter",
        endpointHost: "openrouter.ai",
        requestedModel: "google/gemini-2.5-flash",
        normalizedAudit: null,
        finalValidation: { status: "NOT_RUN" },
        providerFailure: {
          upstreamStatus: 422,
          upstreamCode: "invalid_schema",
          upstreamType: "invalid_request_error",
          upstreamRequestId: "req-candidate",
        },
      });
      const serialized = JSON.stringify(evidence);
      expect(serialized).not.toContain("session-secret");
      expect(serialized).not.toContain("Authorization");
      expect(serialized).not.toContain("sk-secret-1234567890");
      expect(serialized).not.toContain(storyExcerpt);
      expect(evidence).not.toHaveProperty("candidateInput");
      expect(evidence).not.toHaveProperty("rawCandidateResponse");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("writes safe bundled provider-failure evidence for an adjudication-stage rejection", async () => {
    const directory = await mkdtemp(join(tmpdir(), "misrule-provider-adjudication-fail-"));
    try {
      const candidateBody = candidateOutputFrom([deterministicMockOutput.findings[0]], deterministicMockOutput.unresolved_questions);
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({
          id: "generation-ok",
          object: "chat.completion",
          created: 1,
          model: "google/gemini-2.5-flash",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(candidateBody) } }],
        }), { status: 200, headers: { "Content-Type": "application/json" } }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          error: { message: "adjudication schema rejected", code: "invalid_schema", type: "invalid_request_error" },
        }), { status: 400, headers: { "Content-Type": "application/json", "x-request-id": "req-adjudication" } }));
      vi.stubGlobal("fetch", fetchMock);
      const gateway = new OpenAICompatibleAuditGateway({
        provider: "openrouter",
        apiEndpoint: "https://openrouter.ai/api/v1",
        endpointHost: "openrouter.ai",
        model: "google/gemini-2.5-flash",
        apiKey: "session-secret",
        credentialSource: "request",
      });

      await expect(executeLiveAudit(request, { gateway, evidenceDirectory: directory })).rejects.toMatchObject({
        code: "UPSTREAM_REQUEST_REJECTED",
        status: 422,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const files = await readdir(directory);
      expect(files).toHaveLength(1);
      const evidence = JSON.parse(await readFile(join(directory, files[0]), "utf8"));
      expect(evidence).toMatchObject({
        failedStage: "focused-adjudication",
        providerFailure: {
          upstreamStatus: 400,
          upstreamCode: "invalid_schema",
          upstreamRequestId: "req-adjudication",
          promptVersion: ADJUDICATION_PROMPT_VERSION,
          schemaVersion: ADJUDICATION_SCHEMA_VERSION,
        },
        normalizedAudit: null,
        finalValidation: { status: "NOT_RUN" },
      });
      expect(JSON.stringify(evidence)).not.toContain("session-secret");
      expect(evidence).not.toHaveProperty("adjudicationInput");
      expect(evidence).not.toHaveProperty("rawAdjudicationResponse");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("writes no evidence for inline provider-stage rejections", async () => {
    const directory = await mkdtemp(join(tmpdir(), "misrule-provider-inline-fail-"));
    try {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: { message: "inline schema rejected", code: "invalid_schema" },
      }), { status: 422, headers: { "Content-Type": "application/json" } })));
      const gateway = new OpenAICompatibleAuditGateway({
        provider: "openrouter",
        apiEndpoint: "https://openrouter.ai/api/v1",
        endpointHost: "openrouter.ai",
        model: "google/gemini-2.5-flash",
        apiKey: "session-secret",
        credentialSource: "request",
      });

      await expect(executeLiveAudit(
        { ...request, clientRequestId: "inline-provider-fail", source: { kind: "inline", pack: worldPackSchema.parse(portable) } },
        { gateway, evidenceDirectory: directory },
      )).rejects.toMatchObject({ code: "UPSTREAM_REQUEST_REJECTED", status: 422 });
      expect(await readdir(directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
