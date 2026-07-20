import { describe, expect, it } from "vitest";
import { issueFallbackOffer, verifyFallbackOffer } from "@/lib/fallback-token.server";

describe("fallback eligibility token", () => {
  const payload = {
    fixtureId: "fixture-a",
    fixtureVersion: "1",
    fixtureDigest: "digest",
    promptVersion: "prompt/v1",
    schemaVersion: "model-output/v1" as const,
    reason: "upstream_timeout" as const,
  };

  it("binds fixture, versions, transient reason, and expiry", () => {
    const offer = issueFallbackOffer(payload, "secret", 1_000);
    expect(verifyFallbackOffer(offer.token, "secret", 1_001)).toEqual({ ...payload, expiresAt: offer.expiresAt });
  });

  it("rejects tampering and expiry", () => {
    const offer = issueFallbackOffer(payload, "secret", 1_000);
    expect(verifyFallbackOffer(`${offer.token}x`, "secret", 1_001)).toBeNull();
    expect(verifyFallbackOffer(offer.token, "secret", 1_000 + 5 * 60_000)).toBeNull();
  });
});
