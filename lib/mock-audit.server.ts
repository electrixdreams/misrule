import "server-only";

import type { ModelAuditOutput } from "@/lib/model-output.server";

export const deterministicMockOutput: ModelAuditOutput = {
  schema_version: "model-output/v1",
  findings: [
    {
      kind: "contradiction",
      title: "The Dead Captain Returns in the Flesh",
      rule_ids: ["RG-R03", "RG-R04"],
      span_ids: ["RG-S01", "RG-S02"],
      path_steps: [
        { kind: "rule", ref_id: "RG-R03", text: "Orin Vale died and was cremated in Year 412." },
        { kind: "span", ref_id: "RG-S01", text: "In Year 415 the council seal verifies the visitor’s bloodprint as ORIN VALE." },
        { kind: "rule", ref_id: "RG-R04", text: "The dead cannot return to bodily life, and memory echoes lack physical properties." },
        { kind: "span", ref_id: "RG-S02", text: "The visitor leaves wet contact and has warmth and a steady pulse." },
        { kind: "inference", ref_id: null, text: "The verified visitor is a living physical body, not a memory echo." },
      ],
      explanation: "The cited route closes: the same Orin Vale is physically alive three years after his death in a world that forbids bodily return.",
      missing_fact: null,
      why_unresolved: null,
      supported_readings: [],
    },
    {
      kind: "ambiguity",
      title: "Was the Red Vision Fixed?",
      rule_ids: ["RG-R09"],
      span_ids: ["RG-S09", "RG-S10"],
      path_steps: [
        { kind: "rule", ref_id: "RG-R09", text: "A vision is fixed only when the North Star appears reflected in the seeing basin." },
        { kind: "span", ref_id: "RG-S09", text: "Clouds reveal and hide stars, but the basin’s reflection is never described." },
        { kind: "span", ref_id: "RG-S10", text: "Dawn arrives without the predicted destruction." },
        { kind: "inference", ref_id: null, text: "The prediction failed, but the evidence does not establish which rule-defined class applied." },
      ],
      explanation: "The failed prediction contradicts the rule only if the vision was star-marked.",
      missing_fact: "Whether the North Star appeared reflected in the seeing basin when the vision formed.",
      why_unresolved: "Sky visibility does not establish basin reflection, and cloud cover does not establish its absence.",
      supported_readings: [
        { label: "Star-marked reading", outcome: "contradiction_supported", explanation: "If the North Star appeared in the basin, the fixed vision failed its deadline." },
        { label: "Ordinary-vision reading", outcome: "contradiction_not_supported", explanation: "If it did not appear, the vision remained a possible future and may fail." },
      ],
    },
  ],
  unresolved_questions: ["Was the North Star reflected in Nera’s seeing basin?"],
};
