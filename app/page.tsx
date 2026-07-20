import { MisruleApp } from "@/components/MisruleApp";
import { loadPublicFixture } from "@/lib/fixture-catalog.server";
import { getPublicRuntimeDefaults } from "@/lib/runtime-settings.server";

export default function Home() {
  const fixture = loadPublicFixture("ashglass-clocktower-v1");
  const auditMode = process.env.MISRULE_AUDIT_MODE === "mock" ? "mock" : "live";
  const runtimeDefaults = getPublicRuntimeDefaults();
  return <MisruleApp fixture={fixture} runtimeDefaults={runtimeDefaults} auditMode={auditMode} />;
}
