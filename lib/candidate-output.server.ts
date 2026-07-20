import "server-only";

import { z } from "zod";
import { modelFindingSchema, modelFindingTransportSchema, validateModelOutputSemantics, type ModelFinding } from "@/lib/model-output.server";
import type { WorldPack } from "@/lib/world-pack";

const candidateId = z.string().trim().min(1).max(96);

export const candidateOutputTransportSchema = z
  .object({
    schema_version: z.literal("candidate-output/v1"),
    candidates: z.array(modelFindingTransportSchema).max(20),
    unresolved_questions: z.array(z.string()).max(20),
  })
  .strict();

export const candidateOutputSchema = z
  .object({
    schema_version: z.literal("candidate-output/v1"),
    candidates: z.array(modelFindingSchema).max(20),
    unresolved_questions: z.array(z.string().trim().min(1).max(4_000)).max(20),
  })
  .strict();

export type CandidateOutput = z.infer<typeof candidateOutputSchema>;
export type CanonicalCandidate = {
  candidate_id: string;
  proposed_finding: ModelFinding;
};

export type CandidateValidationResult =
  | { ok: true; output: CandidateOutput; candidates: CanonicalCandidate[] }
  | { ok: false; issues: unknown[] };

export function assignCandidateIds(output: CandidateOutput): CanonicalCandidate[] {
  return output.candidates.map((candidate, index) => ({
    candidate_id: `candidate-${String(index + 1).padStart(2, "0")}`,
    proposed_finding: candidate,
  }));
}

export function validateCandidateOutput(output: unknown, pack: WorldPack): CandidateValidationResult {
  const shape = candidateOutputSchema.safeParse(output);
  if (!shape.success) {
    return { ok: false, issues: shape.error.issues.map((issue) => ({ code: issue.code, path: issue.path, message: issue.message })) };
  }
  const semanticIssues = validateModelOutputSemantics(
    { schema_version: "model-output/v1", findings: shape.data.candidates, unresolved_questions: shape.data.unresolved_questions },
    pack,
  );
  if (semanticIssues.length > 0) return { ok: false, issues: semanticIssues };
  return { ok: true, output: shape.data, candidates: assignCandidateIds(shape.data) };
}

export function candidateOutputFromModelOutput(output: unknown): unknown {
  if (!output || typeof output !== "object" || !("schema_version" in output)) return output;
  const modelLike = output as { schema_version?: unknown; findings?: unknown; unresolved_questions?: unknown };
  if (modelLike.schema_version !== "model-output/v1") return output;
  return {
    schema_version: "candidate-output/v1",
    candidates: modelLike.findings,
    unresolved_questions: modelLike.unresolved_questions,
  };
}

export function modelOutputFromCandidates(output: CandidateOutput) {
  return {
    schema_version: "model-output/v1" as const,
    findings: output.candidates,
    unresolved_questions: output.unresolved_questions,
  };
}

export function isCandidateId(value: string) {
  return candidateId.safeParse(value).success;
}
