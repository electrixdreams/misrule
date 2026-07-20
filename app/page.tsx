import { MisruleProduct } from "@/components/MisruleProduct";
import { loadBundledWorldPack, listBundledWorldPacks } from "@/lib/world-pack-catalog.server";
import { getPublicRuntimeDefaults } from "@/lib/runtime-settings.server";

export default function Home() {
  const bundledPacks = listBundledWorldPacks()
    .filter((entry) => entry.enabled)
    .map((entry) => loadBundledWorldPack(entry.packId));
  const auditMode = process.env.MISRULE_AUDIT_MODE === "mock" ? "mock" : "live";
  const runtimeDefaults = getPublicRuntimeDefaults();
  return <MisruleProduct bundledPacks={bundledPacks} runtimeDefaults={runtimeDefaults} auditMode={auditMode} />;
}
