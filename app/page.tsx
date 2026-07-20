import { MisruleApp } from "@/components/MisruleApp";
import { loadPublicFixture } from "@/lib/fixture-catalog.server";

export default function Home() {
  const fixture = loadPublicFixture("ashglass-clocktower-v1");
  const auditMode = process.env.MISRULE_AUDIT_MODE === "mock" ? "mock" : "live";
  return <MisruleApp fixture={fixture} auditMode={auditMode} />;
}
