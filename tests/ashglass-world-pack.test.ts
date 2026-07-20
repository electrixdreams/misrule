import { describe, expect, it } from "vitest";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import portable from "@/tests/fixtures/portable-two-book-world-pack.json";
import { worldPackSchema } from "@/lib/world-pack";

describe("World Packs", () => {
  it("freezes the exact C2 corrections and canonical totals", () => {
    const pack = worldPackSchema.parse(ashglass);
    expect(pack.rules).toHaveLength(10);
    expect(pack.spans).toHaveLength(18);
    expect(pack.rules.find((rule) => rule.ruleId === "RG-R09")).toEqual(expect.objectContaining({
      type: "conditional",
      title: "Star-Marked Visions",
      text: "Oracle Nera’s visions show possible futures unless the North Star appears reflected in the seeing basin; a star-marked vision is fixed and must occur before its stated deadline.",
    }));
    expect(pack.spans.find((span) => span.spanId === "RG-S01")?.text).toBe("The clerk dated the emergency session to the seventeenth day of Rainfall, Year 415. At the threshold, the council’s identity seal verified the visitor’s bloodprint and kindled the registered name ORIN VALE across its silver plate. As the eastern bells struck nine, every councillor turned toward the chamber doors.");
    expect(pack.spans.find((span) => span.spanId === "RG-S09")?.text).toBe("Clouds moved across the open roof above the oracle chamber, alternately hiding and revealing the stars. Nera gripped the rim of the seeing basin and whispered, “Before dawn, the east tower drowns in red light; glass runs from its clocks like rain.” The acolyte recorded the vision word for word.");
  });

  it("keeps ground truth out of the public World Pack", () => {
    const serialized = JSON.stringify(ashglass);
    expect(serialized).not.toContain("RG-C01");
    expect(serialized).not.toContain("groundTruth");
    expect(serialized).not.toContain("missingFact");
  });

  it("accepts a second world with two books and non-RG identifiers", () => {
    const pack = worldPackSchema.parse(portable);
    expect(pack.books).toHaveLength(2);
    expect(pack.rules[0].ruleId).toBe("LAW-A");
    expect(pack.spans[0].spanId).toBe("NOTE-A");
  });

  it("rejects duplicate book identifiers", () => {
    const pack = worldPackSchema.parse(ashglass);
    const duplicate = { ...pack.books[0], ordinal: pack.books[0].ordinal + 1 };
    expect(worldPackSchema.safeParse({ ...pack, books: [...pack.books, duplicate] }).success).toBe(false);
  });

  it("rejects broken world/book relationships", () => {
    const pack = worldPackSchema.parse(portable);
    const broken = { ...pack, spans: [{ ...pack.spans[0], bookId: "unknown-book" }, pack.spans[1]] };
    expect(worldPackSchema.safeParse(broken).success).toBe(false);
  });
});
