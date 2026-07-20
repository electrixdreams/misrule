// Pure, testable Misrule audit evaluator (evaluator version 2).
//
// This module contains no application, model, server, or UI logic. It scores a
// route audit response against a ground-truth fixture using EXACT citation-set
// semantics only: a positive case is matched only when the predicted finding's
// kind, sorted rule-ID set, and sorted span-ID set are all exactly equal to the
// expected case. No fuzzy matching, title similarity, explanation grading,
// LLM-as-judge behavior, or partial credit is applied to precision/recall/F1.
//
// Classification precedence (deterministic):
//   1. Duplicate detection runs first across predictions by identity
//      (kind + sorted rule IDs + sorted span IDs). The first occurrence keeps
//      its content class; every later identical occurrence is `duplicate_prediction`.
//   2. Exact categories (checked against ground truth) take precedence over
//      overlap categories:
//        a. exact_positive      — exact kind + exact rule/span sets of a positive case
//        b. exact_kind_mismatch — exact rule/span sets of a positive case, wrong kind
//        c. exact_distractor   — exact rule/span sets of a distractor case (kind-independent)
//   3. Overlap categories (positive precedence over distractor):
//        a. positive_subset
//        b. positive_superset
//        c. positive_partial_overlap
//        d. distractor_overlap
//   4. unmatched            — no relationship to any ground-truth case
//
// Every ground-truth case receives exactly one case result; every predicted
// finding receives exactly one diagnostic classification.

function sortIds(values) {
  return [...values].sort();
}

function sameIds(left, right) {
  return JSON.stringify(sortIds(left)) === JSON.stringify(sortIds(right));
}

function isSubsetOf(subset, superset) {
  return subset.every((value) => superset.includes(value));
}

// A prediction is a proper subset of a case when both its rule and span sets
// are contained in the case AND at least one dimension is strictly smaller
// (not both equal). Exact equality in both dimensions is handled by the exact
// categories above and never reaches this branch.
function isProperSubset(ruleA, spanA, ruleB, spanB) {
  return isSubsetOf(ruleA, ruleB) && isSubsetOf(spanA, spanB) && (!sameIds(ruleA, ruleB) || !sameIds(spanA, spanB));
}

function isProperSuperset(ruleA, spanA, ruleB, spanB) {
  return isSubsetOf(ruleB, ruleA) && isSubsetOf(spanB, spanA) && (!sameIds(ruleA, ruleB) || !sameIds(spanA, spanB));
}

function partialOverlap(ruleA, spanA, ruleB, spanB) {
  const ruleOverlap = ruleA.some((value) => ruleB.includes(value));
  const spanOverlap = spanA.some((value) => spanB.includes(value));
  return ruleOverlap || spanOverlap;
}

function summarizePrediction(finding) {
  return {
    findingId: finding.id,
    kind: finding.kind,
    ruleIds: sortIds((finding.ruleRefs || []).map((item) => item.id)),
    spanIds: sortIds((finding.spanRefs || []).map((item) => item.id)),
    missingFact: finding.missingFact ?? null,
  };
}

function summarizeCase(item) {
  return {
    caseId: item.caseId,
    expected: item.expected,
    ruleIds: sortIds(item.ruleIds || []),
    spanIds: sortIds(item.spanIds || []),
    missingFact: item.missingFact ?? null,
  };
}

function identityOf(prediction) {
  return `${prediction.kind}|${prediction.ruleIds.join(",")}|${prediction.spanIds.join(",")}`;
}

export function evaluate({ response, groundTruth }) {
  if (response?.ok !== true || !Array.isArray(response?.audit?.findings)) {
    throw new Error("Route response is not a successful Misrule audit.");
  }
  if (!Array.isArray(groundTruth?.cases)) {
    throw new Error("Ground truth has no cases array.");
  }

  const predictions = response.audit.findings.map(summarizePrediction);
  const cases = groundTruth.cases.map(summarizeCase);
  const positiveCases = cases.filter((item) => item.expected !== "none");
  const distractors = cases.filter((item) => item.expected === "none");

  // --- v1 exact-match scoring (preserved semantics) -----------------------
  const exactMatches = [];
  const matchedFindings = new Set();
  for (const expected of positiveCases) {
    const match = predictions.find(
      (prediction) =>
        prediction.kind === expected.expected &&
        sameIds(prediction.ruleIds, expected.ruleIds) &&
        sameIds(prediction.spanIds, expected.spanIds),
    );
    if (match) {
      exactMatches.push({ caseId: expected.caseId, findingId: match.findingId, kind: expected.expected });
      matchedFindings.add(match.findingId);
    }
  }

  const falseNegatives = positiveCases
    .filter((item) => !exactMatches.some((match) => match.caseId === item.caseId))
    .map((item) => ({ caseId: item.caseId, expected: item.expected, ruleIds: item.ruleIds, spanIds: item.spanIds }));

  const falsePositives = predictions.filter((item) => !matchedFindings.has(item.findingId));

  const distractorViolations = distractors.flatMap((item) =>
    predictions
      .filter((prediction) => sameIds(prediction.ruleIds, item.ruleIds) && sameIds(prediction.spanIds, item.spanIds))
      .map((prediction) => ({ caseId: item.caseId, findingId: prediction.findingId, predictedKind: prediction.kind })),
  );

  const precision = predictions.length ? exactMatches.length / predictions.length : 0;
  const recall = positiveCases.length ? exactMatches.length / positiveCases.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const byKind = Object.fromEntries(["contradiction", "ambiguity"].map((kind) => {
    const expected = positiveCases.filter((item) => item.expected === kind);
    const predicted = predictions.filter((item) => item.kind === kind);
    const matched = exactMatches.filter((item) => item.kind === kind);
    const kindPrecision = predicted.length ? matched.length / predicted.length : 0;
    const kindRecall = expected.length ? matched.length / expected.length : 0;
    return [kind, {
      expected: expected.length,
      predicted: predicted.length,
      exactMatches: matched.length,
      precision: kindPrecision,
      recall: kindRecall,
    }];
  }));

  // --- v2 caseResults (one record per ground-truth case) ------------------
  const caseResults = cases.map((item) => {
    const base = {
      caseId: item.caseId,
      expectedKind: item.expected,
      expectedRuleIds: item.ruleIds,
      expectedSpanIds: item.spanIds,
      matchedFindingId: null,
    };
    if (item.expected === "none") {
      const violation = predictions.find(
        (prediction) => sameIds(prediction.ruleIds, item.ruleIds) && sameIds(prediction.spanIds, item.spanIds),
      );
      return violation
        ? { ...base, status: "distractor_violation", matchedFindingId: violation.findingId }
        : { ...base, status: "distractor_clear" };
    }
    const match = predictions.find(
      (prediction) =>
        prediction.kind === item.expected &&
        sameIds(prediction.ruleIds, item.ruleIds) &&
        sameIds(prediction.spanIds, item.spanIds),
    );
    if (match) {
      const result = { ...base, status: "exact_match", matchedFindingId: match.findingId };
      if (item.expected === "ambiguity") {
        // Diagnostics only: wording is not automatically scored.
        result.expectedMissingFact = item.missingFact;
        result.predictedMissingFact = match.missingFact;
      }
      return result;
    }
    return { ...base, status: "false_negative" };
  });

  // --- v2 predictionDiagnostics (one classification per prediction) --------
  const seenIdentities = new Set();
  const predictionDiagnostics = predictions.map((prediction) => {
    const diagnostic = {
      findingId: prediction.findingId,
      kind: prediction.kind,
      ruleIds: prediction.ruleIds,
      spanIds: prediction.spanIds,
      classification: null,
      relatedCaseId: null,
    };
    const identity = identityOf(prediction);
    if (seenIdentities.has(identity)) {
      diagnostic.classification = "duplicate_prediction";
      return diagnostic;
    }
    seenIdentities.add(identity);

    const positiveExact = positiveCases.find(
      (item) => item.expected === prediction.kind && sameIds(prediction.ruleIds, item.ruleIds) && sameIds(prediction.spanIds, item.spanIds),
    );
    if (positiveExact) {
      diagnostic.classification = "exact_positive";
      diagnostic.relatedCaseId = positiveExact.caseId;
      return diagnostic;
    }

    const positiveExactRefs = positiveCases.find(
      (item) => sameIds(prediction.ruleIds, item.ruleIds) && sameIds(prediction.spanIds, item.spanIds),
    );
    if (positiveExactRefs) {
      diagnostic.classification = "exact_kind_mismatch";
      diagnostic.relatedCaseId = positiveExactRefs.caseId;
      return diagnostic;
    }

    const distractorExact = distractors.find(
      (item) => sameIds(prediction.ruleIds, item.ruleIds) && sameIds(prediction.spanIds, item.spanIds),
    );
    if (distractorExact) {
      diagnostic.classification = "exact_distractor";
      diagnostic.relatedCaseId = distractorExact.caseId;
      return diagnostic;
    }

    const positiveSubset = positiveCases.find((item) => isProperSubset(prediction.ruleIds, prediction.spanIds, item.ruleIds, item.spanIds));
    if (positiveSubset) {
      diagnostic.classification = "positive_subset";
      diagnostic.relatedCaseId = positiveSubset.caseId;
      return diagnostic;
    }

    const positiveSuperset = positiveCases.find((item) => isProperSuperset(prediction.ruleIds, prediction.spanIds, item.ruleIds, item.spanIds));
    if (positiveSuperset) {
      diagnostic.classification = "positive_superset";
      diagnostic.relatedCaseId = positiveSuperset.caseId;
      return diagnostic;
    }

    const positivePartial = positiveCases.find((item) => partialOverlap(prediction.ruleIds, prediction.spanIds, item.ruleIds, item.spanIds));
    if (positivePartial) {
      diagnostic.classification = "positive_partial_overlap";
      diagnostic.relatedCaseId = positivePartial.caseId;
      return diagnostic;
    }

    const distractorPartial = distractors.find((item) => partialOverlap(prediction.ruleIds, prediction.spanIds, item.ruleIds, item.spanIds));
    if (distractorPartial) {
      diagnostic.classification = "distractor_overlap";
      diagnostic.relatedCaseId = distractorPartial.caseId;
      return diagnostic;
    }

    diagnostic.classification = "unmatched";
    return diagnostic;
  });

  // --- v2 gate summary ----------------------------------------------------
  const exactPositiveCount = predictionDiagnostics.filter((item) => item.classification === "exact_positive").length;
  const duplicateCount = predictionDiagnostics.filter((item) => item.classification === "duplicate_prediction").length;
  const distractorViolationCases = caseResults.filter((item) => item.status === "distractor_violation").length;
  const positiveCaseResults = caseResults.filter((item) => item.expectedKind !== "none");

  const allPositiveCasesMatched = positiveCaseResults.every((item) => item.status === "exact_match");
  const zeroFalsePositives = exactPositiveCount === predictions.length;
  const zeroDistractorViolations = distractorViolationCases === 0;
  const zeroDuplicatePredictions = duplicateCount === 0;
  const pass = allPositiveCasesMatched && zeroFalsePositives && zeroDistractorViolations && zeroDuplicatePredictions;

  return {
    evaluatorVersion: "misrule-evaluator/v2",
    fixtureId: groundTruth.fixtureId,
    fixtureVersion: groundTruth.fixtureVersion,
    requestId: response.requestId,
    source: response.audit.source,
    method: "Exact finding kind plus exact sorted rule and span citation sets; distractors must receive no exact-set finding.",
    counts: {
      expectedPositiveCases: positiveCases.length,
      predictedFindings: predictions.length,
      exactMatches: exactMatches.length,
      falsePositives: falsePositives.length,
      falseNegatives: falseNegatives.length,
      distractorCases: distractors.length,
      distractorViolations: distractorViolations.length,
    },
    metrics: { precision, recall, f1, byKind },
    gate: {
      allPositiveCasesMatched,
      zeroFalsePositives,
      zeroDistractorViolations,
      zeroDuplicatePredictions,
      pass,
    },
    caseResults,
    predictionDiagnostics,
    exactMatches,
    falsePositives,
    falseNegatives,
    distractorViolations,
  };
}

export default evaluate;
