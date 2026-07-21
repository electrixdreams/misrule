import { z } from "zod";
import { worldPackSchema } from "@/lib/world-pack";

const id = z.string().trim().min(1).max(96);
const nonEmpty = z.string().trim().min(1).max(4_000);

const sourceReferenceSchema = z.object({ id, label: nonEmpty }).strict();
const traceStepDtoSchema = z
  .object({
    ordinal: z.number().int().positive(),
    kind: z.enum(["rule", "span", "inference"]),
    refId: id.nullable(),
    text: nonEmpty,
  })
  .strict();
const supportedReadingDtoSchema = z
  .object({
    label: nonEmpty,
    outcome: z.enum(["contradiction_supported", "contradiction_not_supported"]),
    explanation: nonEmpty,
  })
  .strict();

export const findingDtoSchema = z
  .object({
    id,
    kind: z.enum(["contradiction", "ambiguity"]),
    title: nonEmpty,
    ruleRefs: z.array(sourceReferenceSchema).min(1),
    spanRefs: z.array(sourceReferenceSchema).min(1),
    trace: z.array(traceStepDtoSchema).min(1),
    explanation: nonEmpty,
    missingFact: nonEmpty.nullable(),
    whyUnresolved: nonEmpty.nullable(),
    supportedReadings: z.array(supportedReadingDtoSchema).max(2),
  })
  .strict();

export const auditResultDtoSchema = z
  .object({
    schemaVersion: z.literal("audit-api/v2"),
    auditId: id,
    packId: id,
    packVersion: nonEmpty,
    createdAt: z.iso.datetime({ offset: true }),
    source: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("live"), requestedModel: nonEmpty, model: nonEmpty }).strict(),
      z.object({ mode: z.literal("mock"), requestedModel: z.literal("deterministic-mock"), model: z.literal("deterministic-mock") }).strict(),
      z
        .object({
          mode: z.literal("captured"),
          requestedModel: nonEmpty,
          model: nonEmpty,
          capturedAt: z.iso.datetime({ offset: true }),
          fallbackReason: z.enum(["upstream_timeout", "upstream_rate_limit", "upstream_unavailable", "network_failure"]),
        })
        .strict(),
    ]),
    findings: z.array(findingDtoSchema),
    unresolvedQuestions: z.array(nonEmpty).max(20),
  })
  .strict();

export type FindingDto = z.infer<typeof findingDtoSchema>;
export type AuditResultDto = z.infer<typeof auditResultDtoSchema>;

export const auditProviderSchema = z.enum(["openrouter", "openai-compatible"]);

export const runtimeSettingsSchema = z
  .object({
    provider: auditProviderSchema,
    apiEndpoint: z.url().trim().max(500),
    model: z.string().trim().min(1).max(200),
    apiKey: z.string().trim().min(1).max(4_000).optional(),
  })
  .strict();

export const publicRuntimeDefaultsSchema = z
  .object({
    runtimeMode: z.enum(["configurable", "locked"]),
    provider: auditProviderSchema,
    apiEndpoint: z.url().trim().max(500),
    model: z.string().trim().min(1).max(200),
    hasServerApiKey: z.boolean(),
    allowedEndpointHosts: z.array(z.string().trim().min(1).max(253)).min(1).max(24),
  })
  .strict();

export type AuditProvider = z.infer<typeof auditProviderSchema>;
export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;
export type PublicRuntimeDefaults = z.infer<typeof publicRuntimeDefaultsSchema>;

export const auditWorldPackSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bundled"), packId: id }).strict(),
  z.object({ kind: z.literal("inline"), pack: worldPackSchema }).strict(),
]);

export type AuditWorldPackSource = z.infer<typeof auditWorldPackSourceSchema>;

export const auditRequestSchema = z
  .object({
    schemaVersion: z.literal("audit-api/v2"),
    clientRequestId: id,
    source: auditWorldPackSourceSchema,
    intent: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("live") }).strict(),
      z.object({ mode: z.literal("captured"), offerToken: nonEmpty }).strict(),
    ]),
    runtime: runtimeSettingsSchema.optional(),
  })
  .strict();

export type AuditRequest = z.infer<typeof auditRequestSchema>;

export const auditErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "REQUEST_TOO_LARGE",
  "WORLD_PACK_TOO_LARGE",
  "WORLD_PACK_NOT_FOUND",
  "WORLD_PACK_INVALID",
  "SERVICE_MISCONFIGURED",
  "UPSTREAM_AUTH_ERROR",
  "UPSTREAM_REQUEST_REJECTED",
  "UPSTREAM_RATE_LIMIT",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_UNAVAILABLE",
  "MODEL_REFUSAL",
  "MODEL_OUTPUT_INCOMPLETE",
  "MALFORMED_OUTPUT",
  "INVALID_CITATIONS",
  "FALLBACK_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export type AuditErrorCode = z.infer<typeof auditErrorCodeSchema>;

const fallbackOfferSchema = z
  .object({
    token: nonEmpty,
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const auditSuccessResponseSchema = z
  .object({
    ok: z.literal(true),
    requestId: id,
    audit: auditResultDtoSchema,
    timing: z.object({ totalMs: z.number().int().nonnegative() }).strict(),
  })
  .strict();

export const auditErrorResponseSchema = z
  .object({
    ok: z.literal(false),
    requestId: id,
    error: z
      .object({
        code: auditErrorCodeSchema,
        message: nonEmpty,
        retryable: z.boolean(),
        fallbackOffer: fallbackOfferSchema.nullable(),
        incidentId: id.optional(),
      })
      .strict(),
  })
  .strict();

export type AuditSuccessResponse = z.infer<typeof auditSuccessResponseSchema>;
export type AuditErrorResponse = z.infer<typeof auditErrorResponseSchema>;
export type AuditResponse = AuditSuccessResponse | AuditErrorResponse;

export type { NarrativeSpan, WorldPack, WorldRule } from "@/lib/world-pack";
