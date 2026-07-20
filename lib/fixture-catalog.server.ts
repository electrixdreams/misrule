import "server-only";

import ashglassInput from "@/fixtures/ashglass-clocktower-v1/input.json";
import { fixtureCatalog } from "@/fixtures/catalog.server";
import { publicFixtureSchema, validateFixture, type PublicFixture } from "@/lib/contracts";

export class FixtureRepositoryError extends Error {
  constructor(
    readonly code: "FIXTURE_NOT_FOUND" | "FIXTURE_INVALID",
    message: string,
  ) {
    super(message);
  }
}

export function listFixtures() {
  return fixtureCatalog.map((entry) => ({ ...entry, bookIds: [...entry.bookIds] }));
}

export function loadPublicFixture(fixtureId: string): PublicFixture {
  if (fixtureId !== ashglassInput.fixtureId) {
    throw new FixtureRepositoryError("FIXTURE_NOT_FOUND", "The requested fixture is not mounted.");
  }

  const parsed = publicFixtureSchema.safeParse(ashglassInput);
  if (!parsed.success) {
    throw new FixtureRepositoryError("FIXTURE_INVALID", "The mounted fixture failed shape validation.");
  }
  const issues = validateFixture(parsed.data);
  if (issues.length > 0) {
    throw new FixtureRepositoryError("FIXTURE_INVALID", `The mounted fixture failed relationship validation (${issues.length} issues).`);
  }
  return parsed.data;
}
