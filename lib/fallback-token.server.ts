import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type FallbackReason = "upstream_timeout" | "upstream_rate_limit" | "upstream_unavailable" | "network_failure";

type FallbackOfferPayload = {
  fixtureId: string;
  fixtureVersion: string;
  fixtureDigest: string;
  promptVersion: string;
  schemaVersion: "model-output/v1";
  reason: FallbackReason;
  expiresAt: string;
};

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function issueFallbackOffer(payload: Omit<FallbackOfferPayload, "expiresAt">, secret: string, now = Date.now()) {
  const complete: FallbackOfferPayload = { ...payload, expiresAt: new Date(now + 5 * 60_000).toISOString() };
  const encoded = encode(JSON.stringify(complete));
  return { token: `${encoded}.${sign(encoded, secret)}`, expiresAt: complete.expiresAt };
}

export function verifyFallbackOffer(token: string, secret: string, now = Date.now()): FallbackOfferPayload | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = sign(encoded, secret);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as FallbackOfferPayload;
    if (Date.parse(payload.expiresAt) <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
