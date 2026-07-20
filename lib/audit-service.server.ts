import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { AuditErrorCode, AuditRequest, AuditResultDto, AuditSuccessResponse, PublicFixture } from "@/lib/contracts";
import { FixtureRepositoryError, loadPublicFixture } from "@/lib/fixture-catalog.server";
import { deterministicMockOutput } from "@/lib/mock-audit.server";
import { modelAuditOutputSchema, validateModelOutputSemantics, type ModelAuditOutput } from "@/lib/model-output.server";

export const PROMPT_VERSION = "misrule-audit/v1";
export const MODEL_SCHEMA_VERSION = "model-output/v1";

export type AuditModelInput = {
  schemaVersion: "audit-input/v1";
  fixture: { fixtureId: string; fixtureVersion: string };
  world: { worldId: string; title: string; premise: string };
  books: Array<{ bookId: string; title: string; sourceLabel: string }>;
  rules: Array<{ ruleId: string; type: string; scope: { kind: "world" | "book"; refId: string }; text: string }>;
  spans: Array<{ spanId: string; bookId: string; source: { label: string; scene: string; chapter?: string }; text: string }>;
};

export type GatewayResult = {
  output: unknown;
  requestedModel: string;
  returnedModel: string;
  rawResponse: unknown;
};

export interface AuditModelGateway {
  generate(input: AuditModelInput): Promise<GatewayResult>;
}

export class AuditServiceError extends Error {
  constructor(
    readonly code: AuditErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export function buildModelInput(fixture: PublicFixture): AuditModelInput {
  return {
    schemaVersion: "audit-input/v1",
    fixture: { fixtureId: fixture.fixtureId, fixtureVersion: fixture.fixtureVersion },
    world: { worldId: fixture.world.worldId, title: fixture.world.title, premise: fixture.world.premise },
    books: [...fixture.books]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((book) => ({ bookId: book.bookId, title: book.title, sourceLabel: book.sourceLabel })),
    rules: [...fixture.rules]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((rule) => ({
        ruleId: rule.ruleId,
        type: rule.type,
        scope: rule.scope.kind === "world" ? { kind: "world" as const, refId: rule.scope.worldId } : { kind: "book" as const, refId: rule.scope.bookId },
        text: rule.text,
      })),
    spans: [...fixture.spans]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((span) => ({ spanId: span.spanId, bookId: span.bookId, source: span.source, text: span.text })),
  };
}

function normalize(output: ModelAuditOutput, fixture: PublicFixture, requestedModel: string, returnedModel: string): AuditResultDto {
  const rules = new Map(fixture.rules.map((rule) => [rule.ruleId, rule]));
  const spans = new Map(fixture.spans.map((span) => [span.spanId, span]));
  return {
    schemaVersion: "audit-api/v1",
    auditId: `audit-${randomUUID()}`,
    fixtureId: fixture.fixtureId,
    fixtureVersion: fixture.fixtureVersion,
    createdAt: new Date().toISOString(),
    source:
      requestedModel === "deterministic-mock"
        ? { mode: "mock", requestedModel: "deterministic-mock", model: "deterministic-mock" }
        : { mode: "live", requestedModel, model: returnedModel },
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

function classifyProviderError(error: unknown): AuditServiceError {
  if (error instanceof AuditServiceError) return error;
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) return new AuditServiceError("UPSTREAM_AUTH_ERROR", "The live audit service could not authenticate.", 503, false);
    if (error.status === 429) return new AuditServiceError("UPSTREAM_RATE_LIMIT", "The live audit service is rate limited.", 429, true);
    if (error.status && error.status >= 500) return new AuditServiceError("UPSTREAM_UNAVAILABLE", "The live audit service is temporarily unavailable.", 502, true);
  }
  if (error instanceof Error && /timeout|timed out|abort/i.test(error.message)) return new AuditServiceError("UPSTREAM_TIMEOUT", "The live audit timed out.", 504, true);
  return new AuditServiceError("UPSTREAM_UNAVAILABLE", "The live audit service could not be reached.", 502, true);
}

export class OpenAIAuditGateway implements AuditModelGateway {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model = "gpt-5.6-sol",
  ) {
    this.client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 0 });
  }

  async generate(input: AuditModelInput): Promise<GatewayResult> {
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        reasoning: { effort: "medium" },
        store: false,
        instructions:
          "Audit only the supplied fictional-world rules and narrative spans. Surface contradictions only when the cited path closes under the stated rules. Preserve unresolved evidence as ambiguity when one missing fact supports both a contradiction and non-contradiction reading. Cite exact supplied IDs, invent no exceptions or facts, and return only the strict schema.",
        input: JSON.stringify(input),
        text: { format: zodTextFormat(modelAuditOutputSchema, "misrule_audit") },
      });

      if (response.status === "incomplete") throw new AuditServiceError("MODEL_OUTPUT_INCOMPLETE", "The model response was incomplete.", 502, true);
      const refusal = response.output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content)
        .find((content) => content.type === "refusal");
      if (refusal) throw new AuditServiceError("MODEL_REFUSAL", "The model declined the audit.", 422, false);
      if (!response.output_parsed) throw new AuditServiceError("MALFORMED_OUTPUT", "The model returned no parseable audit.", 422, true);
      return { output: response.output_parsed, requestedModel: this.model, returnedModel: response.model, rawResponse: response };
    } catch (error) {
      throw classifyProviderError(error);
    }
  }
}

export class MockAuditGateway implements AuditModelGateway {
  async generate(): Promise<GatewayResult> {
    return { output: deterministicMockOutput, requestedModel: "deterministic-mock", returnedModel: "deterministic-mock", rawResponse: { mode: "mock", output: deterministicMockOutput } };
  }
}

async function preserveEvidence(directory: string | undefined, evidence: Record<string, unknown>) {
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  const filename = `audit-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}.json`;
  await writeFile(path.join(directory, filename), `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

export async function executeLiveAudit(
  request: AuditRequest,
  dependencies: { gateway: AuditModelGateway; evidenceDirectory?: string },
): Promise<AuditSuccessResponse> {
  if (request.intent.mode !== "live") throw new AuditServiceError("FALLBACK_UNAVAILABLE", "No captured audit is mounted for this checkpoint.", 503, false);
  let fixture: PublicFixture;
  try {
    fixture = loadPublicFixture(request.fixtureId);
  } catch (error) {
    if (error instanceof FixtureRepositoryError) throw new AuditServiceError(error.code, error.message, error.code === "FIXTURE_NOT_FOUND" ? 404 : 500, false);
    throw error;
  }

  const started = Date.now();
  const input = buildModelInput(fixture);
  const gatewayResult = await dependencies.gateway.generate(input);
  const shape = modelAuditOutputSchema.safeParse(gatewayResult.output);
  if (!shape.success) throw new AuditServiceError("MALFORMED_OUTPUT", "The model output did not match the required audit structure.", 422, true);
  const semanticIssues = validateModelOutputSemantics(shape.data, fixture);
  if (semanticIssues.length > 0) throw new AuditServiceError("INVALID_CITATIONS", "The model output contained invalid or incomplete evidence paths.", 422, true);

  const audit = normalize(shape.data, fixture, gatewayResult.requestedModel, gatewayResult.returnedModel);
  const totalMs = Date.now() - started;
  await preserveEvidence(dependencies.evidenceDirectory, {
    evidenceVersion: "misrule-route-proof/v1",
    clientRequestId: request.clientRequestId,
    fixtureDigest: createHash("sha256").update(JSON.stringify(fixture)).digest("hex"),
    promptVersion: PROMPT_VERSION,
    modelSchemaVersion: MODEL_SCHEMA_VERSION,
    requestedModel: gatewayResult.requestedModel,
    returnedModel: gatewayResult.returnedModel,
    modelInput: input,
    rawResponse: gatewayResult.rawResponse,
    normalizedAudit: audit,
    validation: { shape: "PASS", semantics: "PASS", issueCount: 0 },
    latencyMs: totalMs,
  });
  return { ok: true, requestId: request.clientRequestId, audit, timing: { totalMs } };
}

export function createDefaultGateway(): AuditModelGateway {
  if (process.env.MISRULE_AUDIT_MODE === "mock") return new MockAuditGateway();
  if (!process.env.OPENAI_API_KEY) throw new AuditServiceError("SERVICE_MISCONFIGURED", "Live audit access is not configured.", 503, false);
  return new OpenAIAuditGateway(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || "gpt-5.6-sol");
}
