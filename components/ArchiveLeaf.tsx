import type { AuditResultDto, AuditWorldPackSource, FindingDto } from "@/lib/contracts";
import type { WorldPack } from "@/lib/world-pack";
import type { SelectedSource, StationId } from "@/lib/misrule-state";
import { FindingTrace } from "@/components/FindingTrace";
import { SourceEntry } from "@/components/SourceEntry";

type Props = {
  pack: WorldPack;
  source: AuditWorldPackSource;
  station: StationId;
  selectedSource: SelectedSource | null;
  finding: FindingDto | null;
  result: AuditResultDto | null;
  auditStatus: "idle" | "running" | "complete" | "no_findings" | "failed";
  onFinding: (id: string) => void;
  onFindingBack: () => void;
  onCitation: (kind: "rule" | "span", id: string) => void;
  onSourceReturn: () => void;
};

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function sourceLabel(source: AuditWorldPackSource) {
  return source.kind === "bundled" ? "Bundled world · synthetic demo pack" : "Local World Pack · saved in this browser";
}

function LeafHeader({ eyebrow, title, folio }: { eyebrow: string; title: string; folio: string }) {
  return (
    <header className="leaf-header">
      <div><p className="leaf-eyebrow">{eyebrow}</p><h2>{title}</h2></div>
      <span className="folio">{folio}</span>
    </header>
  );
}

export function ArchiveLeaf(props: Props) {
  const { pack, source, station, selectedSource, finding, result } = props;
  return (
    <article className="archive-leaf" id="archive-leaf" aria-label="Archive leaf">
      <div className="leaf-glass" aria-hidden="true" />
      <div className="leaf-paper" tabIndex={-1} id="leaf-content">
        {selectedSource && props.onSourceReturn ? (
          <button className="return-context" type="button" onClick={props.onSourceReturn}>← Return to selected finding</button>
        ) : null}

        {finding ? (
          <FindingTrace finding={finding} onBack={props.onFindingBack} onCitation={props.onCitation} />
        ) : station === "world" ? (
          <>
            <LeafHeader eyebrow={sourceLabel(source)} title={pack.title} folio={source.kind === "bundled" ? "Bundled archive" : "Local archive"} />
            <p className="lead illuminated">{pack.world.premise}</p>
            {pack.disclosure ? <p className="fixture-disclosure">{pack.disclosure}</p> : null}
            <div className="engraved-counts">
              <div><b>{pack.rules.length}</b><span>world rules</span></div>
              <div><b>{pack.spans.length}</b><span>narrative spans</span></div>
              <div><b>{pack.books.length}</b><span>{pack.books.length === 1 ? "mounted volume" : "mounted volumes"}</span></div>
            </div>
            <div className="procession"><span>Read rules</span><i>✦</i><span>Read record</span><i>✦</i><span>Wind audit</span><i>✦</i><span>Inspect trace</span></div>
            <section className="world-note">
              <span>What this instrument tests</span>
              <p>Misrule reconciles author-declared world rules with exact narrative evidence. It closes only supported contradiction routes and leaves uncertainty visibly unfinished.</p>
            </section>
          </>
        ) : station === "rules" ? (
          <>
            <LeafHeader eyebrow={`${pack.world.title} · declared constraints`} title="World Rules" folio={countLabel(pack.rules.length, "complete axiom", "complete axioms")} />
            <p className="lead">Every rule is shown in full. IDs remain stable so a finding can return you to the exact declaration it uses.</p>
            <ol className="source-ledger">
              {pack.rules.map((rule) => <SourceEntry key={rule.ruleId} kind="rule" item={rule} selected={selectedSource?.kind === "rule" && selectedSource.id === rule.ruleId} />)}
            </ol>
          </>
        ) : station === "record" ? (
          <>
            <LeafHeader eyebrow={`${pack.world.title} · surviving evidence`} title="Narrative Record" folio={countLabel(pack.spans.length, "complete span", "complete spans")} />
            <p className="lead">Full source spans remain visible before and after an audit. Misrule cites these records; it does not replace them with a summary.</p>
            <ol className="source-ledger">
              {pack.spans.map((span) => <SourceEntry key={span.spanId} kind="span" item={span} selected={selectedSource?.kind === "span" && selectedSource.id === span.spanId} />)}
            </ol>
          </>
        ) : station === "findings" ? (
          <>
            <LeafHeader eyebrow="Checked alignments" title="Findings" folio={result ? countLabel(result.findings.length, "audit finding", "audit findings") : "Registry sealed"} />
            {props.auditStatus === "running" ? <p className="lead">The registry remains sealed while the server request is pending.</p> : null}
            {props.auditStatus === "no_findings" ? <div className="sealed-registry"><strong>No contradictions or ambiguities were returned.</strong><p>The rules and record remain available for inspection.</p></div> : null}
            {!result && props.auditStatus === "idle" ? <div className="sealed-registry"><strong>No alignment has been attempted.</strong><p>Set the world in motion to compare the engraved rules with the surviving record.</p></div> : null}
            {result?.findings.length ? (
              <ul className="finding-list">
                {result.findings.map((item) => (
                  <li key={item.id}>
                    <button className={`finding-seal finding-seal--${item.kind}`} type="button" onClick={() => props.onFinding(item.id)}>
                      <span>{item.kind === "contradiction" ? "Contradiction under current rules" : "Unresolved under current evidence"}</span>
                      <strong>{item.title}</strong>
                      <small>{[...item.ruleRefs, ...item.spanRefs].map((ref) => ref.id).join(" · ")}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <>
            <LeafHeader eyebrow="Colophon · trust boundary" title="Method & Disclosure" folio="Instrument notes" />
            <div className="method-grid">
              {source.kind === "bundled" ? (
                <section><span>Evidence boundary</span><p>Only the visible bundled world rules and synthetic narrative spans enter the selected audit request. Ground-truth cases, expected counts, interface state, and captured output do not.</p></section>
              ) : (
                <section><span>Evidence boundary</span><p>This saved local World Pack is sent only for the selected audit request. It is revalidated server-side and is not eligible for Misrule evidence-file persistence.</p></section>
              )}
              <section><span>Validated output</span><p>Strict shape, exact citations, complete paths, and contradiction-versus-ambiguity semantics must all pass before an audit finding reaches this leaf.</p></section>
              <section><span>Live inference</span><p>The production route requests the provider and model selected in Model &amp; privacy through the server. Provider handling is governed by the selected endpoint.</p></section>
              {source.kind === "bundled" ? (
                <section><span>Controlled evidence</span><p>The bundled Ashglass sample retains its synthetic controlled-evidence disclosure and can use Misrule&apos;s bundled source path.</p></section>
              ) : (
                <section><span>Browser-local library</span><p>Browser-local library content remains local except when you explicitly audit a saved pack. Misrule does not claim what provider infrastructure retains.</p></section>
              )}
              <section><span>Product boundary</span><p>This is a structured World Pack audit, not an objective canon judge, manuscript uploader, graph database, or production-scale story system.</p></section>
              <section><span>Current result source</span><p>{result ? (result.source.mode === "live" ? `Live route · requested ${result.source.requestedModel} · returned ${result.source.model}` : result.source.mode === "mock" ? "Deterministic mock · not a live model response" : "Disclosed captured fallback") : "No audit result mounted."}</p></section>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
