import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { AuditRequest, AuditResultDto, AuditSuccessResponse } from "@/lib/contracts";
import { acceptedAdjudicationFromCandidates, adjudicationOutputTransportSchema, validateAdjudicationOutput } from "@/lib/adjudication-output.server";
import { AuditServiceError, type ProviderFailureDiagnostic } from "@/lib/audit-errors";
import { candidateOutputFromModelOutput, candidateOutputTransportSchema, modelOutputFromCandidates, validateCandidateOutput, type CanonicalCandidate } from "@/lib/candidate-output.server";
import { WorldPackRepositoryError, loadBundledWorldPack } from "@/lib/world-pack-catalog.server";
import { deterministicMockOutput } from "@/lib/mock-audit.server";
import { modelAuditOutputSchema, validateModelOutputSemantics, type ModelAuditOutput } from "@/lib/model-output.server";
import { resolveRuntimeSettings, type ResolvedRuntimeSettings } from "@/lib/runtime-settings.server";
import { MAX_WORLD_PACK_BYTES, serializedWorldPackByteLength, worldPackSchema, type WorldPack } from "@/lib/world-pack";

export { AuditServiceError } from "@/lib/audit-errors";

export const CANDIDATE_PROMPT_VERSION = "misrule-candidates/v1";
export const ADJUDICATION_PROMPT_VERSION = "misrule-adjudication/v1";
export const PROMPT_VERSION = CANDIDATE_PROMPT_VERSION;
export const MODEL_SCHEMA_VERSION = "model-output/v1";
export const CANDIDATE_SCHEMA_VERSION = "candidate-output/v1";
export const ADJUDICATION_SCHEMA_VERSION = "adjudication-output/v1";

export type AuditModelInput = {
  schemaVersion: "audit-input/v2";
  pack: { packId: string; packVersion: string };
  world: { worldId: string; title: string; premise: string };
  books: Array<{ bookId: string; title: string; sourceLabel: string }>;
  rules: Array<{ ruleId: string; type: string; scope: { kind: "world" | "book"; refId: string }; text: string }>;
  spans: Array<{ spanId: string; bookId: string; source: { label: string; scene: string; chapter?: string }; text: string }>;
};

export type AuditAdjudicationInput = {
  schemaVersion: "audit-adjudication-input/v1";
  pack: { packId: string; packVersion: string };
  world: { worldId: string; title: string; premise: string };
  candidates: Array<{
    candidateId: string;
    proposedFinding: CanonicalCandidate["proposed_finding"];
    citedRules: Array<{ ruleId: string; title: string; type: string; scope: { kind: "world" | "book"; refId: string }; text: string }>;
    citedSpans: Array<{ spanId: string; bookId: string; source: { label: string; scene: string; chapter?: string }; text: string }>;
    citedBooks: Array<{ bookId: string; title: string; sourceLabel: string }>;
  }>;
};

export type GatewayStageResult = {
  stage: "candidate-generation" | "focused-adjudication";
  promptVersion: string;
  schemaVersion: string;
  output: unknown;
  provider: string;
  endpointHost: string;
  requestedModel: string;
  returnedModel: string;
  rawResponse: unknown;
  latencyMs: number;
};

export interface AuditModelGateway {
  generateCandidates(input: AuditModelInput): Promise<GatewayStageResult>;
  adjudicateCandidates(input: AuditAdjudicationInput): Promise<GatewayStageResult>;
}

export function buildModelInput(pack: WorldPack): AuditModelInput {
  return {
    schemaVersion: "audit-input/v2",
    pack: { packId: pack.packId, packVersion: pack.packVersion },
    world: { worldId: pack.world.worldId, title: pack.world.title, premise: pack.world.premise },
    books: [...pack.books]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((book) => ({ bookId: book.bookId, title: book.title, sourceLabel: book.sourceLabel })),
    rules: [...pack.rules]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((rule) => ({
        ruleId: rule.ruleId,
        type: rule.type,
        scope: rule.scope.kind === "world" ? { kind: "world" as const, refId: rule.scope.worldId } : { kind: "book" as const, refId: rule.scope.bookId },
        text: rule.text,
      })),
    spans: [...pack.spans]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((span) => ({ spanId: span.spanId, bookId: span.bookId, source: span.source, text: span.text })),
  };
}

export function buildAdjudicationInput(pack: WorldPack, candidates: CanonicalCandidate[]): AuditAdjudicationInput {
  const rules = new Map(pack.rules.map((rule) => [rule.ruleId, rule]));
  const spans = new Map(pack.spans.map((span) => [span.spanId, span]));
  const books = new Map(pack.books.map((book) => [book.bookId, book]));
  return {
    schemaVersion: "audit-adjudication-input/v1",
    pack: { packId: pack.packId, packVersion: pack.packVersion },
    world: { worldId: pack.world.worldId, title: pack.world.title, premise: pack.world.premise },
    candidates: candidates.map((candidate) => {
      const citedSpans = candidate.proposed_finding.span_ids.map((spanId) => {
        const span = spans.get(spanId)!;
        return { spanId: span.spanId, bookId: span.bookId, source: span.source, text: span.text };
      });
      const citedBookIds = [...new Set(citedSpans.map((span) => span.bookId))];
      return {
        candidateId: candidate.candidate_id,
        proposedFinding: candidate.proposed_finding,
        citedRules: candidate.proposed_finding.rule_ids.map((ruleId) => {
          const rule = rules.get(ruleId)!;
          return {
            ruleId: rule.ruleId,
            title: rule.title,
            type: rule.type,
            scope: rule.scope.kind === "world" ? { kind: "world" as const, refId: rule.scope.worldId } : { kind: "book" as const, refId: rule.scope.bookId },
            text: rule.text,
          };
        }),
        citedSpans,
        citedBooks: citedBookIds.map((bookId) => {
          const book = books.get(bookId)!;
          return { bookId: book.bookId, title: book.title, sourceLabel: book.sourceLabel };
        }),
      };
    }),
  };
}

export function normalizeAudit(output: ModelAuditOutput, pack: WorldPack, gateway: GatewayStageResult): AuditResultDto {
  const rules = new Map(pack.rules.map((rule) => [rule.ruleId, rule]));
  const spans = new Map(pack.spans.map((span) => [span.spanId, span]));
  return {
    schemaVersion: "audit-api/v2",
    auditId: `audit-${randomUUID()}`,
    packId: pack.packId,
    packVersion: pack.packVersion,
    createdAt: new Date().toISOString(),
    source:
      gateway.requestedModel === "deterministic-mock"
        ? { mode: "mock", requestedModel: "deterministic-mock", model: "deterministic-mock" }
        : { mode: "live", requestedModel: gateway.requestedModel, model: gateway.returnedModel },
    findings: output.findings.map((finding, index) => ({
      id: `finding-${String(index + 1).padStart(2, "0")}`,
      kind: finding.kind,
      title: finding.title,
      ruleRefs: finding.rule_ids.map((ruleId) => ({ id: ruleId, label: rules.get(ruleId)!.title })),
      spanRefs: finding.span_ids.map((spanId) => ({ id: spanId, label: `${spans.get(spanId)!.source.label} · ${spans.get(spanId)!.source.scene}` })),
      trace: finding.path_steps.map((step, ordinal) => ({ ordinal: ordinal + 1, kind: step.kind, refId: step.ref_id, text: step.text })),
      explanation: finding.explanation,
      missingFact: finding.missing_fact,
      whyUnresolved: finding.why_unresolved,
      supportedReadings: finding.supported_readings,
    })),
    unresolvedQuestions: output.unresolved_questions,
  };
}

type ProviderErrorContext = {
  stage: GatewayStageResult["stage"];
  promptVersion: string;
  schemaVersion: string;
  provider: string;
  endpointHost: string;
  requestedModel: string;
  started: number;
};

function primitiveDiagnosticValue(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function headerValue(headers: unknown, name: string): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(name);
  if (typeof headers === "object") {
    const record = headers as Record<string, unknown>;
    const direct = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
    return typeof direct === "string" ? direct : null;
  }
  return null;
}

function sanitizeUpstreamMessage(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const sanitized = value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[redacted-api-key]")
    .replace(/https:\/\/[^\s"'<>?]+[?][^\s"'<>]+/g, "[redacted-url]")
    .replace(/\{(?:[^{}]|\{[^{}]*\}){200,}\}/g, "[redacted-json-body]")
    .replace(/\s+/g, " ")
    .trim();
  if (!sanitized) return null;
  return sanitized.length <= 500 ? sanitized : `${sanitized.slice(0, 497)}...`;
}

function providerFailureDiagnostic(error: InstanceType<typeof OpenAI.APIError>, context: ProviderErrorContext): ProviderFailureDiagnostic {
  const nested = typeof error.error === "object" && error.error !== null ? (error.error as Record<string, unknown>) : {};
  return {
    stage: context.stage,
    provider: context.provider,
    endpointHost: context.endpointHost,
    requestedModel: context.requestedModel,
    upstreamStatus: error.status ?? null,
    upstreamCode: primitiveDiagnosticValue(error.code) ?? primitiveDiagnosticValue(nested.code),
    upstreamType: typeof error.type === "string" ? error.type : typeof nested.type === "string" ? nested.type : null,
    upstreamRequestId:
      typeof error.requestID === "string"
        ? error.requestID
        : headerValue(error.headers, "x-request-id") ?? headerValue(error.headers, "x-openrouter-request-id"),
    sanitizedUpstreamMessage: sanitizeUpstreamMessage(typeof nested.message === "string" ? nested.message : error.message),
    latencyMs: Date.now() - context.started,
    promptVersion: context.promptVersion,
    schemaVersion: context.schemaVersion,
  };
}

function classifyProviderError(error: unknown, context: ProviderErrorContext): AuditServiceError {
  if (error instanceof AuditServiceError) return error;
  if (error instanceof OpenAI.APIError) {
    const diagnostic = providerFailureDiagnostic(error, context);
    if (error.status === 401 || error.status === 403) return new AuditServiceError("UPSTREAM_AUTH_ERROR", "The live audit service could not authenticate.", 503, false, diagnostic);
    if (error.status === 429) return new AuditServiceError("UPSTREAM_RATE_LIMIT", "The live audit service is rate limited.", 429, true, diagnostic);
    if (error.status === 400 || error.status === 404 || error.status === 422) {
      return new AuditServiceError("UPSTREAM_REQUEST_REJECTED", "The provider rejected the selected model or request parameters.", 422, false, diagnostic);
    }
    if (error.status && error.status >= 500) return new AuditServiceError("UPSTREAM_UNAVAILABLE", "The live audit service is temporarily unavailable.", 502, true, diagnostic);
  }
  if (error instanceof Error && /timeout|timed out|abort/i.test(error.message)) return new AuditServiceError("UPSTREAM_TIMEOUT", "The live audit timed out.", 504, true);
  return new AuditServiceError("UPSTREAM_UNAVAILABLE", "The live audit service could not be reached.", 502, true);
}

export class OpenAICompatibleAuditGateway implements AuditModelGateway {
  private readonly client: OpenAI;

  constructor(private readonly settings: ResolvedRuntimeSettings) {
    this.client = new OpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.apiEndpoint,
      timeout: 60_000,
      maxRetries: 0,
      defaultHeaders:
        settings.provider === "openrouter"
          ? { "HTTP-Referer": "https://github.com/electrixdreams/misrule", "X-OpenRouter-Title": "Misrule" }
          : undefined,
    });
  }

  private async requestStructuredOutput(
    stage: GatewayStageResult["stage"],
    promptVersion: string,
    schemaVersion: string,
    schemaName: string,
    schema: typeof candidateOutputTransportSchema | typeof adjudicationOutputTransportSchema,
    systemInstructions: string[],
    input: AuditModelInput | AuditAdjudicationInput,
  ): Promise<GatewayStageResult> {
    const started = Date.now();
    try {
      const request = {
        model: this.settings.model,
        messages: [
          {
            role: "system" as const,
            content: systemInstructions.join(" "),
          },
          { role: "user" as const, content: JSON.stringify(input) },
        ],
        response_format: zodResponseFormat(schema, schemaName),
        ...(this.settings.provider === "openrouter"
          ? { max_tokens: 16_000, provider: { require_parameters: true } }
          : { max_completion_tokens: 16_000 }),
      };
      const response = await this.client.chat.completions.create(request);
      const choice = response.choices[0];
      if (!choice) throw new AuditServiceError("MODEL_OUTPUT_INCOMPLETE", "The model returned no completion choice.", 502, true);
      if (choice.finish_reason === "length") throw new AuditServiceError("MODEL_OUTPUT_INCOMPLETE", "The model response exceeded its output limit.", 502, true);
      if (choice.message.refusal) throw new AuditServiceError("MODEL_REFUSAL", "The model declined the audit.", 422, false);
      if (!choice.message.content) throw new AuditServiceError("MALFORMED_OUTPUT", "The model returned no parseable audit.", 422, true);
      let output: unknown = choice.message.content;
      try {
        output = JSON.parse(choice.message.content);
      } catch {
        // Preserve the unparsed value in server-side evidence. The canonical
        // schema below will reject it without exposing provider text to the
        // browser or attempting a repair.
      }
      return {
        stage,
        promptVersion,
        schemaVersion,
        output,
        provider: this.settings.provider,
        endpointHost: this.settings.endpointHost,
        requestedModel: this.settings.model,
        returnedModel: response.model,
        rawResponse: response,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      throw classifyProviderError(error, {
        stage,
        promptVersion,
        schemaVersion,
        provider: this.settings.provider,
        endpointHost: this.settings.endpointHost,
        requestedModel: this.settings.model,
        started,
      });
    }
  }

  async generateCandidates(input: AuditModelInput): Promise<GatewayStageResult> {
    return this.requestStructuredOutput(
      "candidate-generation",
      CANDIDATE_PROMPT_VERSION,
      CANDIDATE_SCHEMA_VERSION,
      "misrule_candidates",
      candidateOutputTransportSchema,
      [
        "Audit only the supplied fictional-world rules and narrative spans.",
        "Return schema_version exactly as candidate-output/v1.",
        "Optimize for recall: surface every plausible contradiction or legitimate two-sided ambiguity as a candidate.",
        "Use only supplied evidence, cite exact rule and span IDs, include explicit path steps, and invent no exceptions, facts, identities, or timing bridges.",
        "For contradictions, missing_fact and why_unresolved must be null and supported_readings must be empty.",
        "For ambiguities, missing_fact and why_unresolved must be non-empty and supported_readings must contain exactly two entries, one contradiction_supported and one contradiction_not_supported.",
        "Every cited rule or span must appear in path_steps and every rule/span path step must be cited.",
        "Do not choose candidate IDs; return only the strict schema.",
      ],
      input,
    );
  }

  async adjudicateCandidates(input: AuditAdjudicationInput): Promise<GatewayStageResult> {
    return this.requestStructuredOutput(
      "focused-adjudication",
      ADJUDICATION_PROMPT_VERSION,
      ADJUDICATION_SCHEMA_VERSION,
      "misrule_adjudication",
      adjudicationOutputTransportSchema,
      [
        "Adjudicate only the supplied validated candidates and exact cited material.",
        "Return schema_version exactly as adjudication-output/v1 and one decision for every candidate ID.",
        "Optimize for precision: inspect cited rules and spans independently rather than trusting candidate explanations.",
        "Accept a contradiction only when the cited rules apply, the cited path jointly forces a violation, and no rule-consistent reading remains.",
        "Accept an ambiguity only when one specific missing fact makes both contradiction_supported and contradiction_not_supported readings compatible with the cited text.",
        "Reject consistent distractors, scope errors, unresolved identity or timing assumptions, invented bridges, duplicate or subsumed routes, and non-two-sided ambiguities.",
        "Accepted findings may cite only a subset of that candidate's cited rules and spans; never add new evidence.",
        "Return only the strict schema.",
      ],
      input,
    );
  }
}

export class MockAuditGateway implements AuditModelGateway {
  constructor(
    private readonly output: unknown = deterministicMockOutput,
    private readonly adjudicationOutput?: unknown,
  ) {}

  async generateCandidates(_input?: AuditModelInput): Promise<GatewayStageResult> {
    void _input;
    const output = candidateOutputFromModelOutput(this.output);
    return {
      stage: "candidate-generation",
      promptVersion: CANDIDATE_PROMPT_VERSION,
      schemaVersion: CANDIDATE_SCHEMA_VERSION,
      output,
      provider: "deterministic-mock",
      endpointHost: "local",
      requestedModel: "deterministic-mock",
      returnedModel: "deterministic-mock",
      rawResponse: { mode: "mock", output },
      latencyMs: 0,
    };
  }

  async adjudicateCandidates(input: AuditAdjudicationInput): Promise<GatewayStageResult> {
    const output = this.adjudicationOutput ?? acceptedAdjudicationFromCandidates(
      input.candidates.map((candidate) => ({
        candidate_id: candidate.candidateId,
        proposed_finding: candidate.proposedFinding,
      })),
    );
    return {
      stage: "focused-adjudication",
      promptVersion: ADJUDICATION_PROMPT_VERSION,
      schemaVersion: ADJUDICATION_SCHEMA_VERSION,
      output,
      provider: "deterministic-mock",
      endpointHost: "local",
      requestedModel: "deterministic-mock",
      returnedModel: "deterministic-mock",
      rawResponse: { mode: "mock", output },
      latencyMs: 0,
    };
  }
}

async function preserveEvidence(directory: string | undefined, evidence: Record<string, unknown>) {
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  const filename = `audit-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}.json`;
  await writeFile(path.join(directory, filename), `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

function redactPackMaterialFromMessage(message: string | null, pack: WorldPack) {
  if (!message) return null;
  let redacted = message;
  for (const textValue of [...pack.rules.map((rule) => rule.text), ...pack.spans.map((span) => span.text)]) {
    const text = textValue.trim();
    if (text.length >= 16) redacted = redacted.replaceAll(text, "[redacted-pack-text]");
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const trimmed = sentence.trim();
      if (trimmed.length >= 16) redacted = redacted.replaceAll(trimmed, "[redacted-pack-text]");
    }
  }
  return redacted;
}

function providerFailureEvidence(diagnostic: ProviderFailureDiagnostic, pack: WorldPack) {
  return {
    ...diagnostic,
    sanitizedUpstreamMessage: redactPackMaterialFromMessage(diagnostic.sanitizedUpstreamMessage, pack),
  };
}

async function preserveProviderFailureEvidence(
  directory: string | undefined,
  request: AuditRequest,
  pack: WorldPack,
  diagnostic: ProviderFailureDiagnostic | undefined,
  started: number,
  stagesNotRun: string[],
) {
  if (!directory || !diagnostic) return;
  await preserveEvidence(directory, {
    evidenceVersion: "misrule-route-proof/v2",
    clientRequestId: request.clientRequestId,
    packDigest: createHash("sha256").update(JSON.stringify(pack)).digest("hex"),
    failedStage: diagnostic.stage,
    promptVersions: { candidates: CANDIDATE_PROMPT_VERSION, adjudication: ADJUDICATION_PROMPT_VERSION },
    schemaVersions: { candidates: CANDIDATE_SCHEMA_VERSION, adjudication: ADJUDICATION_SCHEMA_VERSION, final: MODEL_SCHEMA_VERSION },
    provider: diagnostic.provider,
    endpointHost: diagnostic.endpointHost,
    requestedModel: diagnostic.requestedModel,
    providerFailure: providerFailureEvidence(diagnostic, pack),
    stagesNotRun,
    normalizedAudit: null,
    finalValidation: { status: "NOT_RUN" },
    totalLatencyMs: Date.now() - started,
  });
}

// Per-stage transport identity, recorded explicitly so staged bundled
// evidence identifies both stages and their returned model metadata
// independent of the underlying gateway's raw-response shape.
function stageEvidenceBlock(candidate: GatewayStageResult, adjudication: GatewayStageResult | null) {
  return {
    stages: {
      candidateGeneration: {
        provider: candidate.provider,
        endpointHost: candidate.endpointHost,
        requestedModel: candidate.requestedModel,
        returnedModel: candidate.returnedModel,
      },
      focusedAdjudication: adjudication
        ? {
            provider: adjudication.provider,
            endpointHost: adjudication.endpointHost,
            requestedModel: adjudication.requestedModel,
            returnedModel: adjudication.returnedModel,
          }
        : null,
    },
  };
}

function validationErrorCode(issues: unknown[]) {
  const serialized = JSON.stringify(issues);
  return /UNKNOWN_|CITATION|TRACED|STEP_|READING|DUPLICATE_FINDING|ADDED_/.test(serialized) ? "INVALID_CITATIONS" : "MALFORMED_OUTPUT";
}

function validationErrorMessage(code: "INVALID_CITATIONS" | "MALFORMED_OUTPUT") {
  return code === "INVALID_CITATIONS"
    ? "The model output contained invalid or incomplete evidence paths."
    : "The model output did not match the required audit structure.";
}

function validateFinalOutput(output: ModelAuditOutput, pack: WorldPack) {
  const shape = modelAuditOutputSchema.safeParse(output);
  if (!shape.success) {
    return { ok: false as const, issues: shape.error.issues.map((issue) => ({ code: issue.code, path: issue.path, message: issue.message })) };
  }
  const semanticIssues = validateModelOutputSemantics(shape.data, pack);
  if (semanticIssues.length > 0) return { ok: false as const, issues: semanticIssues };
  return { ok: true as const, output: shape.data };
}

export async function executeLiveAudit(
  request: AuditRequest,
  dependencies: { gateway: AuditModelGateway; evidenceDirectory?: string },
): Promise<AuditSuccessResponse> {
  if (request.intent.mode !== "live") throw new AuditServiceError("FALLBACK_UNAVAILABLE", "No captured audit is mounted for this checkpoint.", 503, false);
  let pack: WorldPack;
  let evidenceEligible = false;
  if (request.source.kind === "bundled") {
    try {
      pack = loadBundledWorldPack(request.source.packId);
      evidenceEligible = true;
    } catch (error) {
      if (error instanceof WorldPackRepositoryError) {
        throw new AuditServiceError(error.code, error.message, error.code === "WORLD_PACK_NOT_FOUND" ? 404 : 500, false);
      }
      throw error;
    }
  } else {
    const parsed = worldPackSchema.safeParse(request.source.pack);
    if (!parsed.success) throw new AuditServiceError("WORLD_PACK_INVALID", "The inline World Pack failed validation.", 400, false);
    pack = parsed.data;
    if (serializedWorldPackByteLength(pack) > MAX_WORLD_PACK_BYTES) {
      throw new AuditServiceError("WORLD_PACK_TOO_LARGE", "The inline World Pack exceeds the allowed size.", 413, false);
    }
  }

  const started = Date.now();
  const candidateInput = buildModelInput(pack);
  let candidateStage: GatewayStageResult;
  try {
    candidateStage = await dependencies.gateway.generateCandidates(candidateInput);
  } catch (error) {
    if (error instanceof AuditServiceError) {
      await preserveProviderFailureEvidence(
        evidenceEligible ? dependencies.evidenceDirectory : undefined,
        request,
        pack,
        error.providerFailureDiagnostic,
        started,
        ["canonical-candidate-validation", "focused-adjudication", "canonical-adjudication-validation", "final-validation"],
      );
    }
    throw error;
  }
  const evidenceBase = {
    evidenceVersion: "misrule-route-proof/v2",
    clientRequestId: request.clientRequestId,
    packDigest: createHash("sha256").update(JSON.stringify(pack)).digest("hex"),
    promptVersions: { candidates: CANDIDATE_PROMPT_VERSION, adjudication: ADJUDICATION_PROMPT_VERSION },
    schemaVersions: { candidates: CANDIDATE_SCHEMA_VERSION, adjudication: ADJUDICATION_SCHEMA_VERSION, final: MODEL_SCHEMA_VERSION },
    provider: candidateStage.provider,
    endpointHost: candidateStage.endpointHost,
    requestedModel: candidateStage.requestedModel,
    returnedModel: candidateStage.returnedModel,
    candidateInput,
    rawCandidateResponse: candidateStage.rawResponse,
    stageLatencyMs: { candidates: candidateStage.latencyMs, adjudication: null as number | null },
  };

  let finalOutput: ModelAuditOutput;
  let adjudicationInput: AuditAdjudicationInput | null = null;
  let adjudicationStage: GatewayStageResult | null = null;
  let acceptedCount = 0;
  let rejectedCount = 0;
  let rejectionReasons: string[] = [];
  let adjudicationValidationEvidence: Record<string, unknown> = { status: "SKIPPED_ZERO_CANDIDATES" };

  const candidateValidation = validateCandidateOutput(candidateStage.output, pack);
  if (!candidateValidation.ok) {
    const code = validationErrorCode(candidateValidation.issues);
    await preserveEvidence(evidenceEligible ? dependencies.evidenceDirectory : undefined, {
      ...evidenceBase,
      ...stageEvidenceBlock(candidateStage, adjudicationStage),
      canonicalCandidateValidation: { status: "FAIL", issues: candidateValidation.issues },
      adjudicationInput: null,
      rawAdjudicationResponse: null,
      canonicalAdjudicationValidation: { status: "NOT_RUN" },
      acceptedCount: 0,
      rejectedCount: 0,
      rejectionReasons: [],
      normalizedAudit: null,
      finalValidation: { status: "NOT_RUN" },
      totalLatencyMs: Date.now() - started,
    });
    throw new AuditServiceError(code, validationErrorMessage(code), 422, true);
  }

  if (candidateValidation.candidates.length === 0) {
    finalOutput = modelOutputFromCandidates(candidateValidation.output);
  } else {
    adjudicationInput = buildAdjudicationInput(pack, candidateValidation.candidates);
    try {
      adjudicationStage = await dependencies.gateway.adjudicateCandidates(adjudicationInput);
    } catch (error) {
      if (error instanceof AuditServiceError) {
        await preserveProviderFailureEvidence(
          evidenceEligible ? dependencies.evidenceDirectory : undefined,
          request,
          pack,
          error.providerFailureDiagnostic,
          started,
          ["canonical-adjudication-validation", "final-validation"],
        );
      }
      throw error;
    }
    const adjudicationValidation = validateAdjudicationOutput(
      adjudicationStage.output,
      candidateValidation.candidates,
      pack,
      candidateValidation.output.unresolved_questions,
    );
    if (!adjudicationValidation.ok) {
      const code = validationErrorCode(adjudicationValidation.issues);
      await preserveEvidence(evidenceEligible ? dependencies.evidenceDirectory : undefined, {
        ...evidenceBase,
        ...stageEvidenceBlock(candidateStage, adjudicationStage),
        adjudicationInput,
        rawAdjudicationResponse: adjudicationStage.rawResponse,
        stageLatencyMs: { candidates: candidateStage.latencyMs, adjudication: adjudicationStage.latencyMs },
        canonicalCandidateValidation: { status: "PASS", candidateCount: candidateValidation.candidates.length },
        canonicalAdjudicationValidation: { status: "FAIL", issues: adjudicationValidation.issues },
        acceptedCount: 0,
        rejectedCount: 0,
        rejectionReasons: [],
        normalizedAudit: null,
        finalValidation: { status: "NOT_RUN" },
        totalLatencyMs: Date.now() - started,
      });
      throw new AuditServiceError(code, validationErrorMessage(code), 422, true);
    }
    finalOutput = adjudicationValidation.finalOutput;
    acceptedCount = adjudicationValidation.acceptedCount;
    rejectedCount = adjudicationValidation.rejectedCount;
    rejectionReasons = adjudicationValidation.rejectionReasons;
    adjudicationValidationEvidence = {
      status: "PASS",
      decisionCount: adjudicationValidation.output.decisions.length,
      acceptedCount,
      rejectedCount,
    };
  }

  const finalValidation = validateFinalOutput(finalOutput, pack);
  if (!finalValidation.ok) {
    const code = validationErrorCode(finalValidation.issues);
    await preserveEvidence(evidenceEligible ? dependencies.evidenceDirectory : undefined, {
      ...evidenceBase,
      ...stageEvidenceBlock(candidateStage, adjudicationStage),
      adjudicationInput,
      rawAdjudicationResponse: adjudicationStage?.rawResponse ?? null,
      stageLatencyMs: { candidates: candidateStage.latencyMs, adjudication: adjudicationStage?.latencyMs ?? null },
      canonicalCandidateValidation: { status: "PASS", candidateCount: candidateValidation.candidates.length },
      canonicalAdjudicationValidation: adjudicationValidationEvidence,
      acceptedCount,
      rejectedCount,
      rejectionReasons,
      normalizedAudit: null,
      finalValidation: { status: "FAIL", issues: finalValidation.issues },
      totalLatencyMs: Date.now() - started,
    });
    throw new AuditServiceError(code, validationErrorMessage(code), 422, true);
  }

  const audit = normalizeAudit(finalValidation.output, pack, candidateStage);
  const totalMs = Date.now() - started;
  await preserveEvidence(evidenceEligible ? dependencies.evidenceDirectory : undefined, {
    ...evidenceBase,
    ...stageEvidenceBlock(candidateStage, adjudicationStage),
    adjudicationInput,
    rawAdjudicationResponse: adjudicationStage?.rawResponse ?? null,
    stageLatencyMs: { candidates: candidateStage.latencyMs, adjudication: adjudicationStage?.latencyMs ?? null },
    canonicalCandidateValidation: { status: "PASS", candidateCount: candidateValidation.candidates.length },
    canonicalAdjudicationValidation: adjudicationValidationEvidence,
    acceptedCount,
    rejectedCount,
    rejectionReasons,
    normalizedAudit: audit,
    finalValidation: { status: "PASS", issueCount: 0 },
    totalLatencyMs: totalMs,
  });
  return { ok: true, requestId: request.clientRequestId, audit, timing: { totalMs } };
}

export function createDefaultGateway(request: AuditRequest): AuditModelGateway {
  if (process.env.MISRULE_AUDIT_MODE === "mock") return new MockAuditGateway();
  return new OpenAICompatibleAuditGateway(resolveRuntimeSettings(request));
}
