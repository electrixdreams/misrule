export type CaseStatus =
  | "exact_match"
  | "false_negative"
  | "distractor_clear"
  | "distractor_violation";

export type PredictionClassification =
  | "exact_positive"
  | "exact_kind_mismatch"
  | "exact_distractor"
  | "duplicate_prediction"
  | "positive_subset"
  | "positive_superset"
  | "positive_partial_overlap"
  | "distractor_overlap"
  | "unmatched";

export interface CaseResult {
  caseId: string;
  expectedKind: string;
  expectedRuleIds: string[];
  expectedSpanIds: string[];
  matchedFindingId: string | null;
  status: CaseStatus;
  expectedMissingFact?: string | null;
  predictedMissingFact?: string | null;
}

export interface PredictionDiagnostic {
  findingId: string;
  kind: string;
  ruleIds: string[];
  spanIds: string[];
  classification: PredictionClassification;
  relatedCaseId: string | null;
}

export interface GateSummary {
  allPositiveCasesMatched: boolean;
  zeroFalsePositives: boolean;
  zeroDistractorViolations: boolean;
  zeroDuplicatePredictions: boolean;
  pass: boolean;
}

export interface EvaluatorCounts {
  expectedPositiveCases: number;
  predictedFindings: number;
  exactMatches: number;
  falsePositives: number;
  falseNegatives: number;
  distractorCases: number;
  distractorViolations: number;
}

export interface EvaluatorResult {
  evaluatorVersion: string;
  fixtureId: string | undefined;
  fixtureVersion: string | undefined;
  requestId: unknown;
  source: unknown;
  method: string;
  counts: EvaluatorCounts;
  metrics: {
    precision: number;
    recall: number;
    f1: number;
    byKind: Record<string, { expected: number; predicted: number; exactMatches: number; precision: number; recall: number }>;
  };
  gate: GateSummary;
  caseResults: CaseResult[];
  predictionDiagnostics: PredictionDiagnostic[];
  exactMatches: unknown[];
  falsePositives: unknown[];
  falseNegatives: unknown[];
  distractorViolations: unknown[];
}

export function evaluate(input: { response: unknown; groundTruth: unknown }): EvaluatorResult;
export default evaluate;
