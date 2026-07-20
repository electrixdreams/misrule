import type { WorldPack } from "@/lib/world-pack";

export function WorldPackSummary({ pack }: { pack: WorldPack }) {
  return (
    <dl className="pack-counts">
      <div>
        <dt>Rules</dt>
        <dd>{pack.rules.length}</dd>
      </div>
      <div>
        <dt>Spans</dt>
        <dd>{pack.spans.length}</dd>
      </div>
      <div>
        <dt>Volumes</dt>
        <dd>{pack.books.length}</dd>
      </div>
    </dl>
  );
}
