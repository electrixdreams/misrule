// Reusable adversarial fixture builders for the Misrule deterministic
// reliability suite (Brief 12C).
//
// These builders produce only internal server-only transport payloads
// (candidate-output/v1 and adjudication-output/v1). They are test scaffolding:
// no ground-truth fixture, no evaluator output, and no production code is
// referenced here. The canonical schemas in lib/ are the authority; every
// builder returns a structurally valid object unless the scenario is
// explicitly exercising a malformed or invalid path.
//
// All fixtures are built against the portable two-book World Pack
// (tests/fixtures/portable-two-book-world-pack.json):
//   rules:  LAW-A (world scope), LAW-B (book: volume-dusk)
//   spans:  NOTE-A (book: volume-dawn), NOTE-B (book: volume-dusk)

type RuleStep = { kind: "rule"; ref_id: string; text: string };
type SpanStep = { kind: "span"; ref_id: string; text: string };
type InferenceStep = { kind: "inference"; ref_id: null; text: string };
type TraceStep = RuleStep | SpanStep | InferenceStep;
type SupportedReading = { label: string; outcome: "contradiction_supported" | "contradiction_not_supported"; explanation: string };

export type Finding = {
  kind: "contradiction" | "ambiguity";
  title: string;
  rule_ids: string[];
  span_ids: string[];
  path_steps: TraceStep[];
  explanation: string;
  missing_fact: string | null;
  why_unresolved: string | null;
  supported_readings: SupportedReading[];
};

function ruleStep(refId: string, text: string): RuleStep {
  return { kind: "rule", ref_id: refId, text };
}
function spanStep(refId: string, text: string): SpanStep {
  return { kind: "span", ref_id: refId, text };
}
function inference(text: string): InferenceStep {
  return { kind: "inference", ref_id: null, text };
}

const TWO_READINGS: SupportedReading[] = [
  { label: "Violation reading", outcome: "contradiction_supported", explanation: "The cited path jointly forces a rule violation." },
  { label: "Rule-consistent reading", outcome: "contradiction_not_supported", explanation: "A rule-consistent reading of the cited path remains." },
];

// Fully valid contradiction on LAW-A (world scope) citing NOTE-A + NOTE-B.
export const PA: Finding = {
  kind: "contradiction",
  title: "Two tides break the single-tide rule",
  rule_ids: ["LAW-A"],
  span_ids: ["NOTE-A", "NOTE-B"],
  path_steps: [
    ruleStep("LAW-A", "Only one tide may enter after each bell."),
    spanStep("NOTE-A", "The white tide entered after the bell."),
    spanStep("NOTE-B", "The black tide entered after the same bell."),
    inference("Both tides entered after the same bell, violating the single-tide rule."),
  ],
  explanation: "Both records place a different tide after the same bell, so the single-tide rule is violated.",
  missing_fact: null,
  why_unresolved: null,
  supported_readings: [],
};

// Subsumed contradiction: a strict subset of PA (only NOTE-B).
export const PB: Finding = {
  kind: "contradiction",
  title: "The black tide breaks the single-tide rule",
  rule_ids: ["LAW-A"],
  span_ids: ["NOTE-B"],
  path_steps: [
    ruleStep("LAW-A", "Only one tide may enter after each bell."),
    spanStep("NOTE-B", "The black tide entered after the same bell."),
    inference("The black tide entered, which violates the single-tide rule."),
  ],
  explanation: "The black tide entered after the same bell, so the single-tide rule is violated.",
  missing_fact: null,
  why_unresolved: null,
  supported_readings: [],
};

// Fully valid ambiguity on LAW-B (book: volume-dusk) citing NOTE-B, with a
// decisive missing fact.
export const LA: Finding = {
  kind: "ambiguity",
  title: "Which bell governed the black-tide entry?",
  rule_ids: ["LAW-B"],
  span_ids: ["NOTE-B"],
  path_steps: [
    ruleStep("LAW-B", "The dusk bell rang once."),
    spanStep("NOTE-B", "The black tide entered after the same bell."),
    inference("The record does not identify which bell the same bell refers to."),
  ],
  explanation: "The failed rule depends on whether the referenced bell was the dusk bell.",
  missing_fact: "Whether the same bell was the dusk bell.",
  why_unresolved: "The record names only the same bell, never the dusk bell specifically.",
  supported_readings: TWO_READINGS,
};

// Ambiguity with a trivial, non-decisive missing fact (still structurally valid).
export const LA_TRIVIAL: Finding = {
  ...LA,
  title: "Supposed ambiguity with no decisive missing fact",
  missing_fact: "Whether the tide was wet.",
  why_unresolved: "This has no bearing on which rule applied.",
};

// Book-scope mismatch: LAW-B is scoped to volume-dusk but is applied to
// NOTE-A, which belongs to volume-dawn. Structurally valid (no scope check at
// candidate validation), so it must be rejected at adjudication.
export const SCOPE_MISMATCH: Finding = {
  ...PA,
  title: "LAW-B applied across book boundaries",
  rule_ids: ["LAW-B"],
  span_ids: ["NOTE-A"],
  path_steps: [
    ruleStep("LAW-B", "The dusk bell rang once."),
    spanStep("NOTE-A", "The white tide entered after the bell."),
    inference("LAW-B is applied to a span outside its book scope."),
  ],
  explanation: "LAW-B (volume-dusk) is applied to NOTE-A (volume-dawn).",
};

// Identity/timing assumption: a contradiction that silently assumes one
// identity or timing bridge without evidence. Structurally valid.
export const IDENTITY_ASSUMPTION: Finding = {
  ...PA,
  title: "Assumed single identity of both tides",
  explanation: "The two tides are assumed to be the same vessel's two entries without evidence of identity.",
};

// Invented bridge fact: a contradiction that asserts a bridge fact absent
// from the cited evidence. Structurally valid.
export const INVENTED_BRIDGE: Finding = {
  ...PA,
  title: "Invented harbormaster bridge",
  explanation: "The harbormaster struck the bell to admit both tides, though no source states this.",
};

// PA accepted as an ambiguity by reclassification within the same candidate
// evidence (kind changed, evidence sets unchanged).
export const PA_AS_AMBIGUITY: Finding = {
  kind: "ambiguity",
  title: "Whether both entries are distinct",
  rule_ids: ["LAW-A"],
  span_ids: ["NOTE-A", "NOTE-B"],
  path_steps: [
    ruleStep("LAW-A", "Only one tide may enter after each bell."),
    spanStep("NOTE-A", "The white tide entered after the bell."),
    spanStep("NOTE-B", "The black tide entered after the same bell."),
    inference("The notes do not establish whether the entries are two distinct tides or one entry described twice."),
  ],
  explanation: "The rule is violated only if the two entries are distinct tides.",
  missing_fact: "Whether the white and black entries are two distinct tides.",
  why_unresolved: "The notes share the same bell but never identify the entries as distinct.",
  supported_readings: TWO_READINGS,
};

// PA with a rule added beyond the candidate evidence (LAW-B is not cited by PA).
export const PA_WITH_ADDED_RULE: Finding = {
  ...PA,
  rule_ids: ["LAW-A", "LAW-B"],
  path_steps: [
    ...PA.path_steps.slice(0, 3),
    ruleStep("LAW-B", "The dusk bell rang once."),
    inference("Both tides entered after the same bell, violating the single-tide rule."),
  ],
};

export type CandidateOutputPayload = {
  schema_version: "candidate-output/v1";
  candidates: Finding[];
  unresolved_questions: string[];
};

export type AdjudicationOutputPayload = {
  schema_version: "adjudication-output/v1";
  decisions: unknown[];
};

export function candidateOutput(candidates: Finding[], unresolvedQuestions: string[] = []): CandidateOutputPayload {
  return {
    schema_version: "candidate-output/v1",
    candidates,
    unresolved_questions: unresolvedQuestions,
  };
}

export function adjudicationOutput(decisions: unknown[]): AdjudicationOutputPayload {
  return { schema_version: "adjudication-output/v1", decisions };
}

export function accept(candidateId: string, finding: Finding): unknown {
  return { candidate_id: candidateId, decision: "accept", finding };
}

export function reject(candidateId: string, reason: string, explanation: string): unknown {
  return { candidate_id: candidateId, decision: "reject", rejection_reason: reason, explanation };
}

// --- Named adversarial scenarios -----------------------------------------
//
// Each scenario pairs a candidate-output payload with the adjudication-output
// payload that the deterministic gateway is expected to return. `adjudication`
// is null when the candidate stage is expected to fail closed before
// adjudication is ever invoked.

export type AdversarialScenario = {
  id: string;
  category: number;
  description: string;
  candidate: unknown;
  adjudication: unknown | null;
};

export const SCENARIOS: AdversarialScenario[] = [
  {
    id: "supported-contradiction-accepted",
    category: 1,
    description: "supported contradiction accepted",
    candidate: candidateOutput([PA]),
    adjudication: adjudicationOutput([accept("candidate-01", PA)]),
  },
  {
    id: "consistent-distractor-rejected",
    category: 2,
    description: "consistent distractor candidate rejected",
    candidate: candidateOutput([PA]),
    adjudication: adjudicationOutput([reject("candidate-01", "consistent_with_rules", "The cited path remains consistent with the supplied rules.")]),
  },
  {
    id: "true-two-sided-ambiguity-accepted",
    category: 3,
    description: "true two-sided ambiguity accepted",
    candidate: candidateOutput([LA]),
    adjudication: adjudicationOutput([accept("candidate-01", LA)]),
  },
  {
    id: "supposed-ambiguity-rejected",
    category: 4,
    description: "supposed ambiguity with no decisive missing fact rejected",
    candidate: candidateOutput([LA_TRIVIAL]),
    adjudication: adjudicationOutput([reject("candidate-01", "ambiguity_not_two_sided", "The missing fact does not make both readings compatible with the cited text.")]),
  },
  {
    id: "book-scope-mismatch-rejected",
    category: 5,
    description: "book-scope mismatch rejected",
    candidate: candidateOutput([SCOPE_MISMATCH]),
    adjudication: adjudicationOutput([reject("candidate-01", "scope_mismatch", "LAW-B applies only to volume-dusk but is applied to NOTE-A in volume-dawn.")]),
  },
  {
    id: "identity-timing-assumption-rejected",
    category: 6,
    description: "identity/timing assumption rejected",
    candidate: candidateOutput([IDENTITY_ASSUMPTION]),
    adjudication: adjudicationOutput([reject("candidate-01", "identity_or_timing_unresolved", "The finding assumes a single identity or timing bridge without evidence.")]),
  },
  {
    id: "invented-bridge-fact-rejected",
    category: 7,
    description: "invented bridge fact rejected",
    candidate: candidateOutput([INVENTED_BRIDGE]),
    adjudication: adjudicationOutput([reject("candidate-01", "unsupported_or_invented_fact", "The finding asserts a bridge fact absent from the cited evidence.")]),
  },
  {
    id: "reclassified-contradiction-to-ambiguity",
    category: 8,
    description: "candidate reclassified from contradiction to ambiguity",
    candidate: candidateOutput([PA]),
    adjudication: adjudicationOutput([accept("candidate-01", PA_AS_AMBIGUITY)]),
  },
  {
    id: "duplicate-subsumed-rejected",
    category: 9,
    description: "non-identical duplicate/subsumed candidate rejected",
    candidate: candidateOutput([PA, PB]),
    adjudication: adjudicationOutput([
      accept("candidate-01", PA),
      reject("candidate-02", "duplicate_or_subsumed", "candidate-02 is subsumed by candidate-01."),
    ]),
  },
  {
    id: "all-candidates-rejected",
    category: 10,
    description: "all candidates rejected",
    candidate: candidateOutput([PA, LA]),
    adjudication: adjudicationOutput([
      reject("candidate-01", "consistent_with_rules", "The cited path remains consistent with the supplied rules."),
      reject("candidate-02", "ambiguity_not_two_sided", "The missing fact is not decisive."),
    ]),
  },
  {
    id: "zero-candidates",
    category: 11,
    description: "zero candidates",
    candidate: candidateOutput([], ["No supported candidates were found."]),
    adjudication: null,
  },
  {
    id: "malformed-candidate-transport",
    category: 12,
    description: "malformed candidate transport",
    candidate: { ...candidateOutput([PA]), surprise: true },
    adjudication: null,
  },
  {
    id: "unknown-citation-candidate",
    category: 13,
    description: "candidate with unknown citation",
    candidate: candidateOutput([{ ...PA, rule_ids: ["LAW-Z"], span_ids: ["NOTE-A"] }]),
    adjudication: null,
  },
  {
    id: "malformed-adjudication-transport",
    category: 14,
    description: "malformed adjudication transport",
    candidate: candidateOutput([PA]),
    adjudication: { schema_version: "adjudication-output/v1", oops: true },
  },
  {
    id: "omitted-decision",
    category: 15,
    description: "omitted decision",
    candidate: candidateOutput([PA, LA]),
    adjudication: adjudicationOutput([accept("candidate-01", PA)]),
  },
  {
    id: "duplicate-decision-id",
    category: 16,
    description: "duplicate decision ID",
    candidate: candidateOutput([PA, LA]),
    adjudication: adjudicationOutput([reject("candidate-01", "consistent_with_rules", "x"), reject("candidate-01", "consistent_with_rules", "x")]),
  },
  {
    id: "unknown-decision-id",
    category: 17,
    description: "unknown decision ID",
    candidate: candidateOutput([PA]),
    adjudication: adjudicationOutput([reject("candidate-99", "consistent_with_rules", "x")]),
  },
  {
    id: "accepted-finding-adds-citation",
    category: 18,
    description: "accepted finding introducing a new rule",
    candidate: candidateOutput([PA]),
    adjudication: adjudicationOutput([accept("candidate-01", PA_WITH_ADDED_RULE)]),
  },
  {
    id: "duplicate-accepted-final-finding",
    category: 19,
    description: "duplicate accepted final finding",
    candidate: candidateOutput([PA, LA]),
    adjudication: adjudicationOutput([accept("candidate-01", PA), accept("candidate-02", PA)]),
  },
  {
    id: "valid-no-findings-final",
    category: 20,
    description: "valid no-findings final response",
    candidate: candidateOutput([], ["No supported candidates were found."]),
    adjudication: null,
  },
];
