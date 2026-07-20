import { MisruleApp } from "@/components/MisruleApp";
import { loadBundledWorldPack } from "@/lib/world-pack-catalog.server";
import { getPublicRuntimeDefaults } from "@/lib/runtime-settings.server";

export default function Home() {
  const pack = loadBundledWorldPack("ashglass-clocktower-v1");
  const auditMode = process.env.MISRULE_AUDIT_MODE === "mock" ? "mock" : "live";
  const runtimeDefaults = getPublicRuntimeDefaults();
  return <MisruleApp pack={pack} runtimeDefaults={runtimeDefaults} auditMode={auditMode} />;
}
