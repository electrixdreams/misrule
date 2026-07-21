import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("deployment source configuration", () => {
  it("configures the audit route for the two sequential 60 second model stages", async () => {
    const source = await readFile("app/api/audit/route.ts", "utf8");
    expect(source).toMatch(/export const maxDuration = 120;/);
  });
});
