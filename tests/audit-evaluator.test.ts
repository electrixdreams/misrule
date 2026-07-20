import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { evaluate } from "../scripts/lib/evaluate-audit.mjs";

function findRepoRoot() {
  let dir = process.cwd();
  const stop = resolve(dir, "..", "..");
  while (dir !== stop) {
    if (existsSync(resolve(dir, "scripts/evaluate-live-audit.mjs"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const ROOT = findRepoRoot();
const GROUND_TRUTH_PATH = resolve(ROOT, "fixtures/ashglass-clocktower-v1/ground-truth.server.json");
const SCRIPT_PATH = resolve(ROOT, "scripts/evaluate-live-audit.mjs");
const FIXTURE_DIR = resolve(ROOT, "tests/fixtures/evaluator/");

const groundTruth = JSON.parse(readFileSync(GROUND_TRUTH_PATH, "utf8"));

function loadResponse(name: string) {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), "utf8"));
}

function fx(name: string) {
  return resolve(FIXTURE_DIR, name);
}

function runCli(args: string[]) {
  try {
    const stdout = execFileSync("node", [SCRIPT_PATH, ...args], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (error: unknown) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

describe("evaluate (v2) — exact-set scoring preserved", () => {
  it("reports evaluator version 2", () => {
    const result = evaluate({ response: loadResponse("perfect-five-positive.json"), groundTruth });
    expect(result.evaluatorVersion).toBe("misrule-evaluator/v2");
  });

  it("produces a perfect gate pass for five exact positives", () => {
    const result = evaluate({ response: loadResponse("perfect-five-positive.json"), groundTruth });

    expect(result.counts).toEqual({
      expectedPositiveCases: 5,
      predictedFindings: 5,
      exactMatches: 5,
      falsePositives: 0,
      falseNegatives: 0,
      distractorCases: 2,
      distractorViolations: 0,
    });
    expect(result.metrics).toMatchObject({ precision: 1, recall: 1, f1: 1 });
    expect(result.metrics.byKind.contradiction).toMatchObject({ expected: 3, predicted: 3, exactMatches: 3 });
    expect(result.metrics.byKind.ambiguity).toMatchObject({ expected: 2, predicted: 2, exactMatches: 2 });

    // Every ground-truth case gets exactly one result.
    expect(result.caseResults).toHaveLength(7);
    for (const item of result.caseResults) {
      if (item.expectedKind === "none") expect(item.status).toBe("distractor_clear");
      else expect(item.status).toBe("exact_match");
    }

    // Every prediction is an exact positive.
    expect(result.predictionDiagnostics).toHaveLength(5);
    for (const item of result.predictionDiagnostics) expect(item.classification).toBe("exact_positive");

    expect(result.gate).toEqual({
      allPositiveCasesMatched: true,
      zeroFalsePositives: true,
      zeroDistractorViolations: true,
      zeroDuplicatePredictions: true,
      pass: true,
    });
  });

  it("flags a missing positive as a false negative and fails the gate", () => {
    const result = evaluate({ response: loadResponse("missing-positive.json"), groundTruth });

    expect(result.counts.falseNegatives).toBe(1);
    expect(result.counts.exactMatches).toBe(4);
    const missing = result.caseResults.find((item) => item.caseId === "RG-C03");
    expect(missing?.status).toBe("false_negative");
    expect(result.gate.allPositiveCasesMatched).toBe(false);
    expect(result.gate.pass).toBe(false);
  });

  it("flags an exact distractor false positive as a violation", () => {
    const result = evaluate({ response: loadResponse("exact-distractor-false-positive.json"), groundTruth });

    const violationCase = result.caseResults.find((item) => item.caseId === "RG-D01");
    expect(violationCase?.status).toBe("distractor_violation");
    expect(violationCase?.matchedFindingId).toBe("F-D01");

    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "F-D01");
    expect(diagnostic?.classification).toBe("exact_distractor");
    expect(diagnostic?.relatedCaseId).toBe("RG-D01");

    expect(result.counts.distractorViolations).toBe(1);
    expect(result.gate.zeroDistractorViolations).toBe(false);
    expect(result.gate.pass).toBe(false);
  });

  it("classifies exact refs with the wrong kind as exact_kind_mismatch", () => {
    const result = evaluate({ response: loadResponse("wrong-kind.json"), groundTruth });

    const c01 = result.caseResults.find((item) => item.caseId === "RG-C01");
    expect(c01?.status).toBe("false_negative");

    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "F-C01-wrong");
    expect(diagnostic?.classification).toBe("exact_kind_mismatch");
    expect(diagnostic?.relatedCaseId).toBe("RG-C01");

    expect(result.gate.allPositiveCasesMatched).toBe(false);
    expect(result.gate.pass).toBe(false);
  });

  it("classifies a prediction that is a subset of a positive case", () => {
    const result = evaluate({ response: loadResponse("subset-overlap.json"), groundTruth });

    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "F-SUBSET");
    expect(diagnostic?.classification).toBe("positive_subset");
    expect(diagnostic?.relatedCaseId).toBe("RG-C01");

    // All positives still matched, but an extra finding breaks the gate.
    expect(result.gate.allPositiveCasesMatched).toBe(true);
    expect(result.gate.zeroFalsePositives).toBe(false);
    expect(result.gate.pass).toBe(false);
  });

  it("classifies a prediction that is a superset of a positive case", () => {
    const result = evaluate({ response: loadResponse("superset-overlap.json"), groundTruth });

    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "F-SUPERSET");
    expect(diagnostic?.classification).toBe("positive_superset");
    expect(diagnostic?.relatedCaseId).toBe("RG-C01");

    expect(result.gate.zeroFalsePositives).toBe(false);
    expect(result.gate.pass).toBe(false);
  });

  it("classifies duplicate predictions and prevents recall inflation", () => {
    const result = evaluate({ response: loadResponse("duplicate-prediction.json"), groundTruth });

    const first = result.predictionDiagnostics.find((item) => item.findingId === "F-C01");
    const duplicate = result.predictionDiagnostics.find((item) => item.findingId === "F-C01-dup");
    expect(first?.classification).toBe("exact_positive");
    expect(duplicate?.classification).toBe("duplicate_prediction");

    // The duplicate counts as a match only once; recall stays at 1.
    expect(result.counts.exactMatches).toBe(5);
    expect(result.metrics.recall).toBe(1);
    expect(result.counts.falsePositives).toBe(1);
    expect(result.gate.zeroDuplicatePredictions).toBe(false);
    expect(result.gate.zeroFalsePositives).toBe(false);
    expect(result.gate.pass).toBe(false);
  });

  it("classifies a fully unmatched prediction", () => {
    const result = evaluate({ response: loadResponse("unmatched-prediction.json"), groundTruth });

    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "F-UNMATCHED");
    expect(diagnostic?.classification).toBe("unmatched");
    expect(diagnostic?.relatedCaseId).toBeNull();
    expect(result.gate.zeroFalsePositives).toBe(false);
    expect(result.gate.pass).toBe(false);
  });

  it("handles a successful response with zero findings without crashing", () => {
    const result = evaluate({ response: loadResponse("zero-findings.json"), groundTruth });

    expect(result.counts.predictedFindings).toBe(0);
    expect(result.counts.exactMatches).toBe(0);
    expect(result.counts.falseNegatives).toBe(5);
    expect(result.metrics.precision).toBe(0);
    expect(result.metrics.recall).toBe(0);
    expect(result.predictionDiagnostics).toHaveLength(0);
    expect(result.gate.allPositiveCasesMatched).toBe(false);
    expect(result.gate.zeroFalsePositives).toBe(true);
    expect(result.gate.pass).toBe(false);
  });

  it("rejects a malformed or unsuccessful route response", () => {
    expect(() => evaluate({ response: loadResponse("malformed.json"), groundTruth })).toThrow();
  });
});

describe("evaluate (v2) — ambiguity missingFact diagnostics", () => {
  it("includes expected and predicted missingFact only for exact ambiguity matches", () => {
    const result = evaluate({ response: loadResponse("perfect-five-positive.json"), groundTruth });

    const a01 = result.caseResults.find((item) => item.caseId === "RG-A01");
    expect(a01?.status).toBe("exact_match");
    expect(a01?.expectedMissingFact).toBe("Whether the North Star appeared reflected in the seeing basin when Nera received the red vision.");
    expect(a01?.predictedMissingFact).toBe("Whether the North Star appeared reflected in the seeing basin when Nera received the red vision.");

    const contradictionCase = result.caseResults.find((item) => item.caseId === "RG-C01");
    expect(contradictionCase).not.toHaveProperty("expectedMissingFact");
  });
});

describe("evaluate (v2) — determinism", () => {
  it("produces identical output across runs", () => {
    const input = { response: loadResponse("exact-distractor-false-positive.json"), groundTruth };
    expect(evaluate(input)).toEqual(evaluate(input));
  });
});

describe("evaluate (v2) — relation completeness (Brief 12A.1)", () => {
  function minimalResponse(findings: unknown[]) {
    return { ok: true, requestId: "req-min", audit: { source: "live", findings } };
  }

  function minimalGroundTruth(cases: unknown[]) {
    return { schemaVersion: "ground-truth/v1", fixtureId: "min", fixtureVersion: "1.0.0", cases };
  }

  function finding(id: string, kind: string, ruleIds: string[], spanIds: string[]) {
    return {
      id,
      kind,
      ruleRefs: ruleIds.map((ruleId) => ({ id: ruleId })),
      spanRefs: spanIds.map((spanId) => ({ id: spanId })),
    };
  }

  // Single positive case used across the subset/superset tests.
  const caseC1 = { caseId: "C1", expected: "contradiction", ruleIds: ["R1", "R2"], spanIds: ["S1", "S2"] };

  it("positive_subset: exact rule set + strict span subset (one dimension strict)", () => {
    const result = evaluate({
      response: minimalResponse([finding("P1", "contradiction", ["R1", "R2"], ["S1"])]),
      groundTruth: minimalGroundTruth([caseC1]),
    });
    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "P1");
    expect(diagnostic?.classification).toBe("positive_subset");
    expect(diagnostic?.relatedCaseId).toBe("C1");
  });

  it("positive_subset: strict rule subset + exact span set (one dimension strict)", () => {
    const result = evaluate({
      response: minimalResponse([finding("P1", "contradiction", ["R1"], ["S1", "S2"])]),
      groundTruth: minimalGroundTruth([caseC1]),
    });
    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "P1");
    expect(diagnostic?.classification).toBe("positive_subset");
    expect(diagnostic?.relatedCaseId).toBe("C1");
  });

  it("positive_subset: strict rule subset + strict span subset (both dimensions strict)", () => {
    const result = evaluate({
      response: minimalResponse([finding("P1", "contradiction", ["R1"], ["S1"])]),
      groundTruth: minimalGroundTruth([caseC1]),
    });
    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "P1");
    expect(diagnostic?.classification).toBe("positive_subset");
    expect(diagnostic?.relatedCaseId).toBe("C1");
  });

  it("exact rule/span equality is not classified as a subset", () => {
    const result = evaluate({
      response: minimalResponse([finding("P1", "contradiction", ["R1", "R2"], ["S1", "S2"])]),
      groundTruth: minimalGroundTruth([caseC1]),
    });
    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "P1");
    expect(diagnostic?.classification).toBe("exact_positive");
    expect(diagnostic?.relatedCaseId).toBe("C1");
  });

  it("positive_superset: exact rule set + strict span superset (one dimension strict)", () => {
    const result = evaluate({
      response: minimalResponse([finding("P1", "contradiction", ["R1", "R2"], ["S1", "S2", "S3"])]),
      groundTruth: minimalGroundTruth([caseC1]),
    });
    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "P1");
    expect(diagnostic?.classification).toBe("positive_superset");
    expect(diagnostic?.relatedCaseId).toBe("C1");
  });

  it("positive_superset: strict rule superset + exact span set (one dimension strict)", () => {
    const result = evaluate({
      response: minimalResponse([finding("P1", "contradiction", ["R1", "R2", "R3"], ["S1", "S2"])]),
      groundTruth: minimalGroundTruth([caseC1]),
    });
    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "P1");
    expect(diagnostic?.classification).toBe("positive_superset");
    expect(diagnostic?.relatedCaseId).toBe("C1");
  });

  it("positive_superset: strict rule superset + strict span superset (both dimensions strict)", () => {
    const result = evaluate({
      response: minimalResponse([finding("P1", "contradiction", ["R1", "R2", "R3"], ["S1", "S2", "S3"])]),
      groundTruth: minimalGroundTruth([caseC1]),
    });
    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "P1");
    expect(diagnostic?.classification).toBe("positive_superset");
    expect(diagnostic?.relatedCaseId).toBe("C1");
  });

  it("exact rule/span equality is not classified as a superset", () => {
    const result = evaluate({
      response: minimalResponse([finding("P1", "contradiction", ["R1", "R2"], ["S1", "S2"])]),
      groundTruth: minimalGroundTruth([caseC1]),
    });
    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "P1");
    expect(diagnostic?.classification).toBe("exact_positive");
    expect(diagnostic?.relatedCaseId).toBe("C1");
  });

  it("positive_partial_overlap when the prediction shares evidence but is neither subset nor superset", () => {
    const result = evaluate({
      response: minimalResponse([finding("P1", "contradiction", ["R1", "R3"], ["S1", "S3"])]),
      groundTruth: minimalGroundTruth([caseC1]),
    });
    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "P1");
    expect(diagnostic?.classification).toBe("positive_partial_overlap");
    expect(diagnostic?.relatedCaseId).toBe("C1");
  });

  it("distractor_overlap when no positive relation wins but the prediction overlaps a distractor", () => {
    const distractorD1 = { caseId: "D1", expected: "none", ruleIds: ["R9", "R10"], spanIds: ["S9", "S10"] };
    const result = evaluate({
      response: minimalResponse([finding("P1", "contradiction", ["R9"], ["S9"])]),
      groundTruth: minimalGroundTruth([caseC1, distractorD1]),
    });
    const diagnostic = result.predictionDiagnostics.find((item) => item.findingId === "P1");
    expect(diagnostic?.classification).toBe("distractor_overlap");
    expect(diagnostic?.relatedCaseId).toBe("D1");
  });
});

describe("CLI wrapper — exit behavior", () => {
  afterAll(() => {
    /* fixtures are static files; nothing to clean up */
  });

  it("exits 0 for a passing gate under --gate", () => {
    const { status, stdout } = runCli(["--gate", fx("perfect-five-positive.json"), GROUND_TRUTH_PATH]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.gate.pass).toBe(true);
    expect(parsed.evaluatorVersion).toBe("misrule-evaluator/v2");
  });

  it("exits 1 for a failing gate under --gate", () => {
    const { status, stdout } = runCli(["--gate", fx("missing-positive.json"), GROUND_TRUTH_PATH]);
    expect(status).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.gate.pass).toBe(false);
  });

  it("exits 0 for any valid evaluation without --gate", () => {
    const { status, stdout } = runCli([fx("missing-positive.json"), GROUND_TRUTH_PATH]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.gate.pass).toBe(false);
  });

  it("exits 2 for an unsuccessful route response", () => {
    const { status, stderr } = runCli([fx("malformed.json"), GROUND_TRUTH_PATH]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/successful Misrule audit/i);
  });

  it("exits 2 when arguments are missing", () => {
    const { status } = runCli([]);
    expect(status).toBe(2);
  });

  it("exits 2 for extra positional arguments", () => {
    const { status, stderr } = runCli([fx("perfect-five-positive.json"), GROUND_TRUTH_PATH, "extra.json"]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/Usage:/);
  });

  it("exits 2 for an unknown flag", () => {
    const { status, stderr } = runCli(["--foo", fx("perfect-five-positive.json"), GROUND_TRUTH_PATH]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/Usage:/);
  });

  it("exits 2 for duplicate --gate", () => {
    const { status, stderr } = runCli(["--gate", "--gate", fx("perfect-five-positive.json"), GROUND_TRUTH_PATH]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/Usage:/);
  });

  it("exits 2 for --gate without exactly two paths", () => {
    const { status, stderr } = runCli(["--gate", fx("perfect-five-positive.json")]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/Usage:/);
  });
});
