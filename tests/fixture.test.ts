import { describe, expect, it } from "vitest";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import portable from "@/tests/fixtures/portable-v1.json";
import { publicFixtureSchema, validateFixture } from "@/lib/contracts";

describe("public fixtures", () => {
  it("freezes the exact C2 corrections and canonical totals", () => {
    const fixture = publicFixtureSchema.parse(ashglass);
    expect(fixture.rules).toHaveLength(10);
    expect(fixture.spans).toHaveLength(18);
    expect(fixture.rules.find((rule) => rule.ruleId === "RG-R09")).toEqual(expect.objectContaining({
      type: "conditional",
      title: "Star-Marked Visions",
      text: "Oracle Nera’s visions show possible futures unless the North Star appears reflected in the seeing basin; a star-marked vision is fixed and must occur before its stated deadline.",
    }));
    expect(fixture.spans.find((span) => span.spanId === "RG-S01")?.text).toBe("The clerk dated the emergency session to the seventeenth day of Rainfall, Year 415. At the threshold, the council’s identity seal verified the visitor’s bloodprint and kindled the registered name ORIN VALE across its silver plate. As the eastern bells struck nine, every councillor turned toward the chamber doors.");
    expect(fixture.spans.find((span) => span.spanId === "RG-S09")?.text).toBe("Clouds moved across the open roof above the oracle chamber, alternately hiding and revealing the stars. Nera gripped the rim of the seeing basin and whispered, “Before dawn, the east tower drowns in red light; glass runs from its clocks like rain.” The acolyte recorded the vision word for word.");
    expect(validateFixture(fixture)).toEqual([]);
  });

  it("keeps ground truth out of the public fixture", () => {
    const serialized = JSON.stringify(ashglass);
    expect(serialized).not.toContain("RG-C01");
    expect(serialized).not.toContain("groundTruth");
    expect(serialized).not.toContain("missingFact");
  });

  it("accepts a second world with two books and non-RG identifiers", () => {
    const fixture = publicFixtureSchema.parse(portable);
    expect(validateFixture(fixture)).toEqual([]);
    expect(fixture.books).toHaveLength(2);
    expect(fixture.rules[0].ruleId).toBe("LAW-A");
    expect(fixture.spans[0].spanId).toBe("NOTE-A");
  });

  it("rejects duplicate book identifiers", () => {
    const fixture = publicFixtureSchema.parse(ashglass);
    const duplicate = { ...fixture.books[0], ordinal: fixture.books[0].ordinal + 1 };
    expect(validateFixture({ ...fixture, books: [...fixture.books, duplicate] })).toContainEqual({
      path: `books.${duplicate.bookId}`,
      message: "Duplicate book ID.",
    });
  });

  it("rejects broken world/book relationships", () => {
    const fixture = publicFixtureSchema.parse(portable);
    const broken = { ...fixture, spans: [{ ...fixture.spans[0], bookId: "unknown-book" }, fixture.spans[1]] };
    expect(validateFixture(broken)).toContainEqual(expect.objectContaining({ message: "Span references an unknown book." }));
  });
});
