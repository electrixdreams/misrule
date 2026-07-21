import "server-only";

import { z } from "zod";
import { isCandidateId, type CanonicalCandidate } from "@/lib/candidate-output.server";
import {
  modelFindingSchema,
  modelFindingTransportFromCanonical,
  modelFindingTransportSchema,
  modelFindingFromTransport,
  validateModelOutputSemantics,
  type ModelAuditOutput,
  type ModelFinding,
} from "@/lib/model-output.server";
import type { WorldPack } from "@/lib/world-pack";

const candidateId = z.string().trim().min(1).max(96);
const text = z.string().trim().min(1).max(4_000);

export const rejectionReasonSchema = z.enum([
  "path_does_not_close",
  "rule_not_applicable",
  "scope_mismatch",
  "identity_or_timing_unresolved",
  "consistent_with_rules",
  "ambiguity_not_two_sided",
  "duplicate_or_subsumed",
  "unsupported_or_invented_fact",
  "other",
]);

const acceptedDecisionSchema = z
  .object({
    candidate_id: candidateId,
    decision: z.literal("accept"),
    finding: modelFindingSchema,
  })
  .strict();

const rejectedDecisionSchema = z
  .object({
    candidate_id: candidateId,
    decision: z.literal("reject"),
    rejection_reason: rejectionReasonSchema,
    explanation: text,
  })
  .strict();

const transportAcceptedDecisionSchema = z
  .object({
    candidate_id: z.string(),
    decision: z.enum(["accept"]),
    finding: modelFindingTransportSchema,
  })
  .strict();

const transportRejectedDecisionSchema = z
  .object({
    candidate_id: z.string(),
    decision: z.enum(["reject"]),
    rejection_reason: rejectionReasonSchema,
    explanation: z.string(),
  })
  .strict();

export const adjudicationOutputTransportSchema = z
  .object({
    schema_version: z.enum(["adjudication-output/v1"]),
    decisions: z.array(z.discriminatedUnion("decision", [transportAcceptedDecisionSchema, transportRejectedDecisionSchema])),
  })
  .strict();

export const adjudicationOutputSchema = z
  .object({
    schema_version: z.literal("adjudication-output/v1"),
    decisions: z.array(z.discriminatedUnion("decision", [acceptedDecisionSchema, rejectedDecisionSchema])).max(20),
  })
  .strict();

export type RejectionReason = z.infer<typeof rejectionReasonSchema>;
export type AdjudicationOutput = z.infer<typeof adjudicationOutputSchema>;
export type AdjudicationDecision = AdjudicationOutput["decisions"][number];
export type AdjudicationTransportOutput = z.infer<typeof adjudicationOutputTransportSchema>;

export type AdjudicationValidationResult =
  | { ok: true; output: AdjudicationOutput; finalOutput: ModelAuditOutput; acceptedCount: number; rejectedCount: number; rejectionReasons: RejectionReason[] }
  | { ok: false; issues: unknown[] };

function sortedKey(values: string[]) {
  return [...values].sort().join(",");
}

function subsetOf(values: string[], allowed: Set<string>) {
  return values.every((value) => allowed.has(value));
}

export function acceptedAdjudicationFromCandidates(candidates: CanonicalCandidate[]): AdjudicationOutput {
  return {
    schema_version: "adjudication-output/v1",
    decisions: candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      decision: "accept" as const,
      finding: candidate.proposed_finding,
    })),
  };
}

export function adjudicationTransportOutputFromCanonical(output: AdjudicationOutput): AdjudicationTransportOutput {
  return {
    schema_version: "adjudication-output/v1",
    decisions: output.decisions.map((decision) => {
      if (decision.decision === "reject") return decision;
      return {
        candidate_id: decision.candidate_id,
        decision: "accept" as const,
        finding: modelFindingTransportFromCanonical(decision.finding),
      };
    }),
  };
}

export function acceptedAdjudicationTransportFromCandidates(candidates: CanonicalCandidate[]): AdjudicationTransportOutput {
  return adjudicationTransportOutputFromCanonical(acceptedAdjudicationFromCandidates(candidates));
}

export function validateAdjudicationOutput(output: unknown, candidates: CanonicalCandidate[], pack: WorldPack, unresolvedQuestions: string[]): AdjudicationValidationResult {
  const transport = adjudicationOutputTransportSchema.safeParse(output);
  if (!transport.success) {
    return { ok: false, issues: transport.error.issues.map((issue) => ({ code: issue.code, path: issue.path, message: issue.message })) };
  }
  const decisions: AdjudicationDecision[] = [];
  const conversionIssues: unknown[] = [];
  for (const [decisionIndex, decision] of transport.data.decisions.entries()) {
    if (decision.decision === "reject") {
      decisions.push(decision);
      continue;
    }
    const converted = modelFindingFromTransport(decision.finding, decisionIndex, ["decisions", decisionIndex, "finding"]);
    if (converted.ok) {
      decisions.push({ candidate_id: decision.candidate_id, decision: "accept", finding: converted.finding });
    } else {
      conversionIssues.push(...converted.issues);
    }
  }
  if (conversionIssues.length > 0) return { ok: false, issues: conversionIssues };

  const shape = adjudicationOutputSchema.safeParse({ schema_version: "adjudication-output/v1", decisions });
  if (!shape.success) {
    return { ok: false, issues: shape.error.issues.map((issue) => ({ code: issue.code, path: issue.path, message: issue.message })) };
  }

  const issues: unknown[] = [];
  const expectedIds = new Set(candidates.map((candidate) => candidate.candidate_id));
  const candidatesById = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const seenIds = new Set<string>();
  const finalFindings: ModelFinding[] = [];
  const rejectionReasons: RejectionReason[] = [];

  for (const [decisionIndex, decision] of shape.data.decisions.entries()) {
    if (!isCandidateId(decision.candidate_id)) {
      issues.push({ decisionIndex, code: "INVALID_DECISION_ID", message: `Decision candidate ID ${decision.candidate_id} is invalid.` });
    }
    if (!expectedIds.has(decision.candidate_id)) {
      issues.push({ decisionIndex, code: "UNKNOWN_DECISION_ID", message: `Decision references unknown candidate ${decision.candidate_id}.` });
      continue;
    }
    if (seenIds.has(decision.candidate_id)) {
      issues.push({ decisionIndex, code: "DUPLICATE_DECISION_ID", message: `Candidate ${decision.candidate_id} was adjudicated more than once.` });
      continue;
    }
    seenIds.add(decision.candidate_id);

    if (decision.decision === "reject") {
      rejectionReasons.push(decision.rejection_reason);
      continue;
    }

    const candidate = candidatesById.get(decision.candidate_id)!;
    const allowedRuleIds = new Set(candidate.proposed_finding.rule_ids);
    const allowedSpanIds = new Set(candidate.proposed_finding.span_ids);
    if (!subsetOf(decision.finding.rule_ids, allowedRuleIds)) {
      issues.push({ decisionIndex, code: "ADDED_RULE_CITATION", message: `Accepted finding for ${decision.candidate_id} cites a rule outside the candidate evidence.` });
    }
    if (!subsetOf(decision.finding.span_ids, allowedSpanIds)) {
      issues.push({ decisionIndex, code: "ADDED_SPAN_CITATION", message: `Accepted finding for ${decision.candidate_id} cites a span outside the candidate evidence.` });
    }
    finalFindings.push(decision.finding);
  }

  for (const expectedId of expectedIds) {
    if (!seenIds.has(expectedId)) issues.push({ code: "MISSING_DECISION_ID", message: `Candidate ${expectedId} was not adjudicated.` });
  }

  const acceptedIdentities = new Set<string>();
  for (const [findingIndex, finding] of finalFindings.entries()) {
    const identity = `${finding.kind}|${sortedKey(finding.rule_ids)}|${sortedKey(finding.span_ids)}`;
    if (acceptedIdentities.has(identity)) {
      issues.push({ findingIndex, code: "DUPLICATE_ACCEPTED_FINDING", message: "Accepted findings must be unique by kind and cited evidence sets." });
    }
    acceptedIdentities.add(identity);
  }

  const finalOutput: ModelAuditOutput = { schema_version: "model-output/v1", findings: finalFindings, unresolved_questions: unresolvedQuestions };
  const finalShape = modelFindingSchema.array().max(12).safeParse(finalFindings);
  if (!finalShape.success) {
    issues.push(...finalShape.error.issues.map((issue) => ({ code: issue.code, path: issue.path, message: issue.message })));
  }
  issues.push(...validateModelOutputSemantics(finalOutput, pack));

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    output: shape.data,
    finalOutput,
    acceptedCount: finalFindings.length,
    rejectedCount: shape.data.decisions.length - finalFindings.length,
    rejectionReasons,
  };
}
