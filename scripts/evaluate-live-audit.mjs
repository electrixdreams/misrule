#!/usr/bin/env node

import { readFileSync } from "node:fs";

const [, , responsePath, groundTruthPath] = process.argv;
if (!responsePath || !groundTruthPath) {
  console.error("Usage: node scripts/evaluate-live-audit.mjs <route-response.json> <ground-truth.server.json>");
  process.exit(2);
}

const response = JSON.parse(readFileSync(responsePath, "utf8"));
const groundTruth = JSON.parse(readFileSync(groundTruthPath, "utf8"));
if (response?.ok !== true || !Array.isArray(response?.audit?.findings)) {
  throw new Error("Route response is not a successful Misrule audit.");
}
if (!Array.isArray(groundTruth?.cases)) throw new Error("Ground truth has no cases array.");

const sorted = (values) => [...values].sort();
const sameIds = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
const positiveCases = groundTruth.cases.filter((item) => item.expected !== "none");
const distractors = groundTruth.cases.filter((item) => item.expected === "none");
const predictions = response.audit.findings.map((finding) => ({
  findingId: finding.id,
  kind: finding.kind,
  ruleIds: sorted(finding.ruleRefs.map((item) => item.id)),
  spanIds: sorted(finding.spanRefs.map((item) => item.id)),
}));

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
  .map((item) => ({ caseId: item.caseId, expected: item.expected, ruleIds: sorted(item.ruleIds), spanIds: sorted(item.spanIds) }));
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

console.log(JSON.stringify({
  evaluatorVersion: "misrule-evaluator/v1",
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
  exactMatches,
  falsePositives,
  falseNegatives,
  distractorViolations,
}, null, 2));
