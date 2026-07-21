// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import groundTruth from "@/fixtures/ashglass-clocktower-v1/ground-truth.server.json";
import portable from "@/tests/fixtures/portable-two-book-world-pack.json";
import { evaluate } from "../scripts/lib/evaluate-audit.mjs";
import perfectFivePositive from "@/tests/fixtures/evaluator/perfect-five-positive.json";
import exactDistractor from "@/tests/fixtures/evaluator/exact-distractor-false-positive.json";
import duplicatePrediction from "@/tests/fixtures/evaluator/duplicate-prediction.json";
import { deterministicMockOutput } from "@/lib/mock-audit.server";
import { worldPackSchema } from "@/lib/world-pack";
import {
  ADJUDICATION_PROMPT_VERSION,
  ADJUDICATION_SCHEMA_VERSION,
  CANDIDATE_PROMPT_VERSION,
  CANDIDATE_SCHEMA_VERSION,
  MockAuditGateway,
  OpenAICompatibleAuditGateway,
  AuditServiceError,
  buildModelInput,
  executeLiveAudit,
  type AuditModelGateway,
  type GatewayStageResult,
} from "@/lib/audit-service.server";
import { PA, PB, SCENARIOS, accept, candidateOutput, adjudicationOutput } from "@/tests/fixtures/audit-quality/builders";

const pack = worldPackSchema.parse(portable);

function stageResult(stage: GatewayStageResult["stage"], output: unknown): GatewayStageResult {
  return {
    stage,
    promptVersion: stage === "candidate-generation" ? CANDIDATE_PROMPT_VERSION : ADJUDICATION_PROMPT_VERSION,
    schemaVersion: stage === "candidate-generation" ? CANDIDATE_SCHEMA_VERSION : ADJUDICATION_SCHEMA_VERSION,
    outputTransport: "json_schema",
    output,
    provider: "test",
    endpointHost: "test",
    requestedModel: "test-model",
    returnedModel: "test-model",
    upstreamRequestId: null,
    openRouterRequestId: null,
    generationId: null,
    routerMetadata: null,
    rawResponse: { output },
    latencyMs: 0,
    temperature: 0,
  };
}

function inlineRequest(clientRequestId: string) {
  return {
    schemaVersion: "audit-api/v2" as const,
    clientRequestId,
    source: { kind: "inline" as const, pack },
    intent: { mode: "live" as const },
  };
}

const bundledRequest = {
  schemaVersion: "audit-api/v2" as const,
  clientRequestId: "adversarial-bundled",
  source: { kind: "bundled" as const, packId: "ashglass-clocktower-v1" },
  intent: { mode: "live" as const },
};

// Returns an AuditModelGateway whose candidate stage yields `candidate` and
// whose adjudication stage yields `adjudication` (when provided). When
// `adjudication` is null the adjudication stage is left unconfigured so a
// spurious call would throw, allowing call-count assertions.
function makeGateway(candidate: unknown, adjudication: unknown | null): { gateway: AuditModelGateway; adjudicate: ReturnType<typeof vi.fn> } {
  const adjudicate = vi.fn();
  if (adjudication !== null) adjudicate.mockResolvedValue(stageResult("focused-adjudication", adjudication));
  return {
    adjudicate,
    gateway: {
      generateCandidates: async () => stageResult("candidate-generation", candidate),
      adjudicateCandidates: adjudicate,
    },
  };
}

type Expected =
  | { success: true; findings: number; kind?: "contradiction" | "ambiguity"; unresolved?: string[] }
  | { fail: number };

const EXPECTED: Record<string, Expected> = {
  "supported-contradiction-accepted": { success: true, findings: 1, kind: "contradiction" },
  "consistent-distractor-rejected": { success: true, findings: 0 },
  "true-two-sided-ambiguity-accepted": { success: true, findings: 1, kind: "ambiguity" },
  "supposed-ambiguity-rejected": { success: true, findings: 0 },
  "book-scope-mismatch-rejected": { success: true, findings: 0 },
  "identity-timing-assumption-rejected": { success: true, findings: 0 },
  "invented-bridge-fact-rejected": { success: true, findings: 0 },
  "reclassified-contradiction-to-ambiguity": { success: true, findings: 1, kind: "ambiguity" },
  "duplicate-subsumed-rejected": { success: true, findings: 1, kind: "contradiction" },
  "all-candidates-rejected": { success: true, findings: 0 },
  "zero-candidates": { success: true, findings: 0, unresolved: ["No supported candidates were found."] },
  "malformed-candidate-transport": { fail: 422 },
  "unknown-citation-candidate": { fail: 422 },
  "malformed-adjudication-transport": { fail: 422 },
  "omitted-decision": { fail: 422 },
  "duplicate-decision-id": { fail: 422 },
  "unknown-decision-id": { fail: 422 },
  "accepted-finding-adds-citation": { fail: 422 },
  "duplicate-accepted-final-finding": { fail: 422 },
  "valid-no-findings-final": { success: true, findings: 0, unresolved: ["No supported candidates were found."] },
};

describe("12C adversarial corpus — every required category", () => {
  afterEach(() => vi.unstubAllGlobals());

  for (const scenario of SCENARIOS) {
    const expected = EXPECTED[scenario.id];
    it(`category ${scenario.category}: ${scenario.description}`, async () => {
      const { gateway } = makeGateway(scenario.candidate, scenario.adjudication);
      if ("fail" in expected) {
        await expect(executeLiveAudit(inlineRequest(scenario.id), { gateway })).rejects.toMatchObject({ status: expected.fail });
      } else {
        const response = await executeLiveAudit(inlineRequest(scenario.id), { gateway });
        expect(response.ok).toBe(true);
        expect(response.audit.findings).toHaveLength(expected.findings);
        if (expected.kind) expect(response.audit.findings[0]?.kind).toBe(expected.kind);
        if (expected.unresolved) expect(response.audit.unresolvedQuestions).toEqual(expected.unresolved);
      }
    });
  }
});

describe("12C pipeline control", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("invokes the candidate stage exactly once and the adjudication stage exactly once when candidates exist", async () => {
    const { gateway, adjudicate } = makeGateway(candidateOutput([PA]), adjudicationOutput([accept("candidate-01", PA)]));
    const response = await executeLiveAudit(inlineRequest("control-two-stages"), { gateway });
    expect(response.ok).toBe(true);
    expect(response.audit.findings).toHaveLength(1);
    expect(adjudicate).toHaveBeenCalledTimes(1);
  });

  it("skips adjudication entirely when candidate generation returns zero candidates", async () => {
    const { gateway, adjudicate } = makeGateway(candidateOutput([], ["none"]), null);
    const response = await executeLiveAudit(inlineRequest("control-zero"), { gateway });
    expect(response.ok).toBe(true);
    expect(response.audit.findings).toEqual([]);
    expect(adjudicate).not.toHaveBeenCalled();
  });

  it("does not reach adjudication for a malformed candidate payload", async () => {
    const malformed = { ...candidateOutput([PA]), surprise: true };
    const { gateway, adjudicate } = makeGateway(malformed, null);
    await expect(executeLiveAudit(inlineRequest("control-malformed"), { gateway })).rejects.toMatchObject({ status: 422 });
    expect(adjudicate).not.toHaveBeenCalled();
  });

  it("returns no partial audit when a stage fails validation", async () => {
    const { gateway } = makeGateway(candidateOutput([PA]), { schema_version: "adjudication-output/v1", oops: true });
    await expect(executeLiveAudit(inlineRequest("control-no-partial"), { gateway })).rejects.toMatchObject({ code: "MALFORMED_OUTPUT", status: 422 });
  });
});

describe("12C semantic policy enforcement", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts only a subset of candidate refs in the final finding", async () => {
    // PA cites LAW-A + NOTE-A/NOTE-B; the accepted finding may drop NOTE-A.
    const narrowed = { ...PA, span_ids: ["NOTE-B"], path_steps: PA.path_steps.filter((step) => step.kind !== "span" || step.ref_id === "NOTE-B") };
    const { gateway } = makeGateway(candidateOutput([PA]), adjudicationOutput([accept("candidate-01", narrowed)]));
    const response = await executeLiveAudit(inlineRequest("policy-subset"), { gateway });
    expect(response.audit.findings).toHaveLength(1);
    expect(response.audit.findings[0].spanRefs.map((ref: { id: string }) => ref.id)).toEqual(["NOTE-B"]);
  });

  it("fails closed when an accepted finding expands beyond candidate refs", async () => {
    const expanded = { ...PA, rule_ids: ["LAW-A", "LAW-B"], path_steps: [...PA.path_steps, { kind: "rule" as const, ref_id: "LAW-B", text: "The dusk bell rang once." }] };
    const { gateway } = makeGateway(candidateOutput([PA]), adjudicationOutput([accept("candidate-01", expanded)]));
    await expect(executeLiveAudit(inlineRequest("policy-added"), { gateway })).rejects.toMatchObject({ code: "INVALID_CITATIONS", status: 422 });
  });

  it("enforces exact decision coverage for every candidate", async () => {
    const { gateway } = makeGateway(candidateOutput([PA, PB]), adjudicationOutput([accept("candidate-01", PA)]));
    await expect(executeLiveAudit(inlineRequest("policy-coverage"), { gateway })).rejects.toMatchObject({ status: 422 });
  });

  it("rejects duplicate accepted final findings", async () => {
    const { gateway } = makeGateway(candidateOutput([PA, PB]), adjudicationOutput([accept("candidate-01", PA), accept("candidate-02", PA)]));
    await expect(executeLiveAudit(inlineRequest("policy-dup-final"), { gateway })).rejects.toMatchObject({ code: "INVALID_CITATIONS", status: 422 });
  });

  it("reclassifies a candidate within its evidence", async () => {
    const { gateway } = makeGateway(candidateOutput([PA]), adjudicationOutput([accept("candidate-01", { ...PA, kind: "ambiguity" as const, missing_fact: "Whether the entries are distinct.", why_unresolved: "Notes never identify them as distinct.", supported_readings: [{ label: "a", outcome: "contradiction_supported" as const, explanation: "x" }, { label: "b", outcome: "contradiction_not_supported" as const, explanation: "y" }] })]));
    const response = await executeLiveAudit(inlineRequest("policy-reclassify"), { gateway });
    expect(response.audit.findings).toHaveLength(1);
    expect(response.audit.findings[0].kind).toBe("ambiguity");
  });

  it("returns a successful zero-finding audit when all candidates are rejected", async () => {
    const { gateway } = makeGateway(
      candidateOutput([PA, PB]),
      adjudicationOutput([{ candidate_id: "candidate-01", decision: "reject", rejection_reason: "consistent_with_rules", explanation: "x" }, { candidate_id: "candidate-02", decision: "reject", rejection_reason: "consistent_with_rules", explanation: "y" }]),
    );
    const response = await executeLiveAudit(inlineRequest("policy-all-rejected"), { gateway });
    expect(response.ok).toBe(true);
    expect(response.audit.findings).toEqual([]);
  });
});

describe("12C provider transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  function openrouterGateway() {
    return new OpenAICompatibleAuditGateway({
      provider: "openrouter",
      apiEndpoint: "https://openrouter.ai/api/v1",
      endpointHost: "openrouter.ai",
      model: "openai/gpt-oss-120b:free",
      apiKey: "session-secret",
      credentialSource: "request",
      outputTransport: "json_schema",
    });
  }

  function mockFetchSequence(responses: unknown[]) {
    const fetchMock = vi.fn();
    responses.forEach((body) => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    return fetchMock;
  }

  it("sends OpenRouter exactly two strict requests with distinct schema names and the same model/endpoint", async () => {
    const candidateBody = candidateOutput(deterministicMockOutput.findings, deterministicMockOutput.unresolved_questions);
    const adjudicationBody = adjudicationOutput(deterministicMockOutput.findings.map((finding, index) => accept(`candidate-${String(index + 1).padStart(2, "0")}`, finding)));
    const fetchMock = mockFetchSequence([
      { id: "gen", object: "chat.completion", model: "openai/gpt-oss-120b:free", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(candidateBody) } }] },
      { id: "adj", object: "chat.completion", model: "openai/gpt-oss-120b:free", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(adjudicationBody) } }] },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const gateway = openrouterGateway();
    const response = await executeLiveAudit(bundledRequest, { gateway });
    expect(response.audit).toMatchObject({ schemaVersion: "audit-api/v2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url0 = String(fetchMock.mock.calls[0][0]);
    const url1 = String(fetchMock.mock.calls[1][0]);
    expect(url0).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(url1).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body0 = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const body1 = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    // Same resolved model and endpoint for both stages.
    expect(body0.model).toBe("openai/gpt-oss-120b:free");
    expect(body1.model).toBe("openai/gpt-oss-120b:free");
    // Distinct strict schema names.
    expect(body0.response_format.json_schema.name).toBe("misrule_candidates");
    expect(body1.response_format.json_schema.name).toBe("misrule_adjudication");
    // OpenRouter limits retained + key absent + no retry implied.
    expect(body0).toMatchObject({ max_tokens: 16_000, provider: { require_parameters: true } });
    expect(body0.temperature).toBe(0);
    expect(body1).toMatchObject({ max_tokens: 16_000, temperature: 0, provider: { require_parameters: true } });
    expect(JSON.stringify(body0)).not.toContain("session-secret");
    expect(JSON.stringify(body1)).not.toContain("session-secret");
  });

  it("sends OpenRouter exactly one request for a zero-candidate response", async () => {
    const zeroBody = candidateOutput([], ["No supported candidates were found."]);
    const fetchMock = mockFetchSequence([
      { id: "gen", object: "chat.completion", model: "openai/gpt-oss-120b:free", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(zeroBody) } }] },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const gateway = openrouterGateway();
    const response = await executeLiveAudit(bundledRequest, { gateway });
    expect(response.audit.findings).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a failed upstream request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "boom", code: 500 } }), { status: 500, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = openrouterGateway();
    await expect(gateway.generateCandidates(buildModelInput(worldPackSchema.parse(ashglass)))).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("12C evidence boundaries", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("staged bundled evidence identifies both stages and their returned model metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "misrule-adversarial-evidence-"));
    try {
      await executeLiveAudit(bundledRequest, { gateway: new MockAuditGateway(), evidenceDirectory: directory });
      const files = await readdir(directory);
      expect(files).toHaveLength(1);
      const evidence = JSON.parse(await readFile(join(directory, files[0]), "utf8"));
      // Both stages are staged.
      expect(evidence.candidateInput).toBeDefined();
      expect(evidence.adjudicationInput).toBeDefined();
      expect(evidence.rawCandidateResponse).toBeDefined();
      expect(evidence.rawAdjudicationResponse).toBeDefined();
      expect(evidence.canonicalCandidateValidation).toMatchObject({ status: "PASS" });
      expect(evidence.canonicalAdjudicationValidation).toMatchObject({ status: "PASS", decisionCount: 2, acceptedCount: 2, rejectedCount: 0 });
      expect(evidence.acceptedCount).toBe(2);
      expect(evidence.rejectedCount).toBe(0);
      expect(evidence.rejectionReasons).toEqual([]);
      expect(evidence.normalizedAudit).toMatchObject({ schemaVersion: "audit-api/v2" });
      expect(evidence.stageLatencyMs).toMatchObject({ candidates: 0, adjudication: 0 });
      // Both stages are explicitly identified with their returned model metadata.
      expect(evidence.stages.candidateGeneration.returnedModel).toBe("deterministic-mock");
      expect(evidence.stages.focusedAdjudication).not.toBeNull();
      expect(evidence.stages.focusedAdjudication.returnedModel).toBe("deterministic-mock");
      // Top-level provider identity matches both stages.
      expect(evidence.provider).toBe("deterministic-mock");
      expect(evidence.returnedModel).toBe("deterministic-mock");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("never writes an evidence file for an inline audit, even on success", async () => {
    const directory = await mkdtemp(join(tmpdir(), "misrule-adversarial-inline-"));
    try {
      await executeLiveAudit(inlineRequest("evidence-inline"), { gateway: new MockAuditGateway(candidateOutput([PA]), adjudicationOutput([accept("candidate-01", PA)])), evidenceDirectory: directory });
      expect(await readdir(directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("exposes no raw stage output in the public audit DTO", async () => {
    const response = await executeLiveAudit(inlineRequest("evidence-dto"), { gateway: new MockAuditGateway(candidateOutput([PA]), adjudicationOutput([accept("candidate-01", PA)])) });
    const serialized = JSON.stringify(response.audit);
    expect(serialized).not.toContain("rawCandidateResponse");
    expect(serialized).not.toContain("rawAdjudicationResponse");
    expect(serialized).not.toContain("candidate-output/v1");
    expect(serialized).not.toContain("adjudication-output/v1");
    expect(response.audit).toMatchObject({ schemaVersion: "audit-api/v2" });
  });

  it("returns a generic error with no raw output when validation fails", async () => {
    const { gateway } = makeGateway(candidateOutput([PA]), adjudicationOutput([accept("candidate-01", { ...PA, rule_ids: ["LAW-A", "LAW-B"], path_steps: [...PA.path_steps, { kind: "rule" as const, ref_id: "LAW-B", text: "x" }] })]));
    let caught: unknown;
    try {
      await executeLiveAudit(inlineRequest("evidence-error"), { gateway });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    const message = (caught as { message: string }).message;
    expect(message).not.toContain("rawCandidateResponse");
    expect(message).not.toContain("candidate-output/v1");
  });
});

describe("12C.1 inline failure evidence exclusion", () => {
  it("writes no evidence file when an inline audit fails candidate validation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "misrule-121-candidate-fail-"));
    try {
      // Malformed candidate transport reaches canonical validation and fails.
      const { gateway } = makeGateway({ ...candidateOutput([PA]), surprise: true }, null);
      await expect(
        executeLiveAudit(inlineRequest("121-candidate-fail"), { gateway, evidenceDirectory: directory }),
      ).rejects.toBeInstanceOf(AuditServiceError);
      await expect(
        executeLiveAudit(inlineRequest("121-candidate-fail"), { gateway, evidenceDirectory: directory }),
      ).rejects.toMatchObject({ status: 422 });
      // No evidence file (candidate or otherwise) is written anywhere under the directory.
      expect(await readdir(directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("writes no evidence file when an inline audit fails adjudication validation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "misrule-121-adjudication-fail-"));
    try {
      // Valid candidate output, but the accepted finding expands beyond the
      // candidate evidence so canonical adjudication validation fails closed.
      const { gateway } = makeGateway(
        candidateOutput([PA]),
        adjudicationOutput([accept("candidate-01", { ...PA, rule_ids: ["LAW-A", "LAW-B"], path_steps: [...PA.path_steps, { kind: "rule" as const, ref_id: "LAW-B", text: "x" }] })]),
      );
      await expect(
        executeLiveAudit(inlineRequest("121-adjudication-fail"), { gateway, evidenceDirectory: directory }),
      ).rejects.toBeInstanceOf(AuditServiceError);
      await expect(
        executeLiveAudit(inlineRequest("121-adjudication-fail"), { gateway, evidenceDirectory: directory }),
      ).rejects.toMatchObject({ code: "INVALID_CITATIONS", status: 422 });
      // No candidate input, adjudication input, raw stage response, or
      // validation artifact is persisted anywhere under the directory.
      expect(await readdir(directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("12C explicit verification items", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("item 1: exact duplicate candidate identities fail closed at candidate validation", async () => {
    const { gateway, adjudicate } = makeGateway(candidateOutput([PA, PA]), null);
    await expect(executeLiveAudit(inlineRequest("item1"), { gateway })).rejects.toMatchObject({ status: 422 });
    expect(adjudicate).not.toHaveBeenCalled();
  });

  it("item 2: non-identical duplicate/subsumed candidates reach adjudication and one is rejected", async () => {
    const { gateway, adjudicate } = makeGateway(
      candidateOutput([PA, PB]),
      adjudicationOutput([accept("candidate-01", PA), { candidate_id: "candidate-02", decision: "reject", rejection_reason: "duplicate_or_subsumed", explanation: "subsumed" }]),
    );
    const response = await executeLiveAudit(inlineRequest("item2"), { gateway });
    expect(response.audit.findings).toHaveLength(1);
    expect(adjudicate).toHaveBeenCalledTimes(1);
  });

  it("item 3: both stages use the same resolved provider/model/endpoint", async () => {
    const candidateBody = candidateOutput(deterministicMockOutput.findings, deterministicMockOutput.unresolved_questions);
    const adjudicationBody = adjudicationOutput(deterministicMockOutput.findings.map((finding, index) => accept(`candidate-${String(index + 1).padStart(2, "0")}`, finding)));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "gen", object: "chat.completion", model: "openai/gpt-oss-120b:free", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(candidateBody) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "adj", object: "chat.completion", model: "openai/gpt-oss-120b:free", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(adjudicationBody) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new OpenAICompatibleAuditGateway({
      provider: "openrouter",
      apiEndpoint: "https://openrouter.ai/api/v1",
      endpointHost: "openrouter.ai",
      model: "openai/gpt-oss-120b:free",
      apiKey: "session-secret",
      credentialSource: "request",
      outputTransport: "json_schema",
    });
    const response = await executeLiveAudit(bundledRequest, { gateway });
    expect(response.ok).toBe(true);
    const request0 = fetchMock.mock.calls[0][0];
    const request1 = fetchMock.mock.calls[1][0];
    expect(request0).toBe(request1);
    const body0 = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const body1 = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body0.model).toBe(body1.model);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("item 4: staged bundled evidence identifies both stages and their returned model metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "misrule-item4-"));
    try {
      await executeLiveAudit(bundledRequest, { gateway: new MockAuditGateway(), evidenceDirectory: directory });
      const files = await readdir(directory);
      const evidence = JSON.parse(await readFile(join(directory, files[0]), "utf8"));
      expect(evidence.canonicalCandidateValidation.status).toBe("PASS");
      expect(evidence.canonicalAdjudicationValidation.status).toBe("PASS");
      expect(evidence.stages.candidateGeneration.returnedModel).toBeDefined();
      expect(evidence.stages.focusedAdjudication.returnedModel).toBeDefined();
      expect(evidence.stages.candidateGeneration.returnedModel).toBe(evidence.stages.focusedAdjudication.returnedModel);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("item 5: a zero-candidate OpenAI-compatible response results in exactly one HTTP request", async () => {
    const zeroBody = candidateOutput([], ["No supported candidates were found."]);
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: "gen", object: "chat.completion", model: "openai/gpt-oss-120b:free", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(zeroBody) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new OpenAICompatibleAuditGateway({
      provider: "openrouter",
      apiEndpoint: "https://openrouter.ai/api/v1",
      endpointHost: "openrouter.ai",
      model: "openai/gpt-oss-120b:free",
      apiKey: "session-secret",
      credentialSource: "request",
      outputTransport: "json_schema",
    });
    const response = await executeLiveAudit(bundledRequest, { gateway });
    expect(response.audit.findings).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("12C evaluator gate integration", () => {
  it("passes the gate for a deterministic perfect final Ashglass response", () => {
    const result = evaluate({ response: perfectFivePositive, groundTruth });
    expect(result.evaluatorVersion).toBe("misrule-evaluator/v2");
    expect(result.gate.pass).toBe(true);
    expect(result.counts.distractorViolations).toBe(0);
    expect(result.counts.falsePositives).toBe(0);
  });

  it("fails the gate for a response containing a distractor, with exact_distractor diagnostics", () => {
    const result = evaluate({ response: exactDistractor, groundTruth });
    expect(result.gate.pass).toBe(false);
    expect(result.gate.zeroDistractorViolations).toBe(false);
    const diagnostic = result.predictionDiagnostics.find((item: { findingId: string }) => item.findingId === "F-D01");
    expect(diagnostic?.classification).toBe("exact_distractor");
    expect(diagnostic?.relatedCaseId).toBe("RG-D01");
  });

  it("fails the gate for a response containing a duplicate prediction, with duplicate_prediction diagnostics", () => {
    const result = evaluate({ response: duplicatePrediction, groundTruth });
    expect(result.gate.pass).toBe(false);
    expect(result.gate.zeroDuplicatePredictions).toBe(false);
    const duplicate = result.predictionDiagnostics.find((item: { findingId: string }) => item.findingId === "F-C01-dup");
    expect(duplicate?.classification).toBe("duplicate_prediction");
  });
});
