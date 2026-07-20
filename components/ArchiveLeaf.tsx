import type { AuditResultDto, FindingDto, PublicFixture } from "@/lib/contracts";
import type { SelectedSource, StationId } from "@/lib/misrule-state";
import { FindingTrace } from "@/components/FindingTrace";
import { SourceEntry } from "@/components/SourceEntry";

type Props = {
  fixture: PublicFixture;
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

function LeafHeader({ eyebrow, title, folio }: { eyebrow: string; title: string; folio: string }) {
  return (
    <header className="leaf-header">
      <div><p className="leaf-eyebrow">{eyebrow}</p><h2>{title}</h2></div>
      <span className="folio">{folio}</span>
    </header>
  );
}

export function ArchiveLeaf(props: Props) {
  const { fixture, station, selectedSource, finding, result } = props;
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
            <LeafHeader eyebrow="Mounted world · synthetic demo fixture" title={fixture.title} folio="World leaf 01" />
            <p className="lead illuminated">{fixture.world.premise}</p>
            <p className="fixture-disclosure">{fixture.disclosure}</p>
            <div className="engraved-counts">
              <div><b>{fixture.rules.length}</b><span>world rules</span></div>
              <div><b>{fixture.spans.length}</b><span>narrative spans</span></div>
              <div><b>{fixture.books.length}</b><span>mounted volume</span></div>
            </div>
            <div className="procession"><span>Read rules</span><i>✦</i><span>Read record</span><i>✦</i><span>Wind audit</span><i>✦</i><span>Inspect trace</span></div>
            <section className="world-note">
              <span>What this instrument tests</span>
              <p>Misrule reconciles author-declared world rules with exact narrative evidence. It closes only supported contradiction routes and leaves uncertainty visibly unfinished.</p>
            </section>
          </>
        ) : station === "rules" ? (
          <>
            <LeafHeader eyebrow="World archive · declared constraints" title="World Rules" folio={`${fixture.rules.length} complete axioms`} />
            <p className="lead">Every rule is shown in full. IDs remain stable so a finding can return you to the exact declaration it uses.</p>
            <ol className="source-ledger">
              {fixture.rules.map((rule) => <SourceEntry key={rule.ruleId} kind="rule" item={rule} selected={selectedSource?.kind === "rule" && selectedSource.id === rule.ruleId} />)}
            </ol>
          </>
        ) : station === "record" ? (
          <>
            <LeafHeader eyebrow="Narrative archive · surviving evidence" title="Narrative Record" folio={`${fixture.spans.length} complete spans`} />
            <p className="lead">Full source spans remain visible before and after an audit. Misrule cites these records; it does not replace them with a summary.</p>
            <ol className="source-ledger">
              {fixture.spans.map((span) => <SourceEntry key={span.spanId} kind="span" item={span} selected={selectedSource?.kind === "span" && selectedSource.id === span.spanId} />)}
            </ol>
          </>
        ) : station === "findings" ? (
          <>
            <LeafHeader eyebrow="Validated alignments" title="Findings" folio={result ? `${result.findings.length} accepted` : "Registry sealed"} />
            {props.auditStatus === "running" ? <p className="lead">The registry remains sealed while the server request is pending.</p> : null}
            {props.auditStatus === "no_findings" ? <div className="sealed-registry"><strong>No contradictions or ambiguities were accepted.</strong><p>The rules and record remain available for inspection.</p></div> : null}
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
              <section><span>Evidence boundary</span><p>Only the visible world rules and narrative spans enter the model request. Ground-truth cases, expected counts, interface state, and captured output do not.</p></section>
              <section><span>Accepted output</span><p>Strict shape, exact citations, complete paths, and contradiction-versus-ambiguity semantics must all pass before a finding reaches this leaf.</p></section>
              <section><span>Live inference</span><p>The production route requests GPT-5.6 on the server. A deterministic mock can exercise the same boundaries during QA, but it is not presented as live evidence.</p></section>
              <section><span>Captured fallback</span><p>No captured result ships in this checkpoint. A future capture may appear only after an eligible transient live failure, a signed server offer, and explicit user choice.</p></section>
              <section><span>Product boundary</span><p>This is a synthetic fixture demonstration, not an objective canon judge, manuscript uploader, rule editor, graph database, or production-scale story system.</p></section>
              <section><span>Current result source</span><p>{result ? (result.source.mode === "live" ? `Live route · requested ${result.source.requestedModel} · returned ${result.source.model}` : result.source.mode === "mock" ? "Deterministic mock · not a live model response" : "Disclosed captured fallback") : "No audit result mounted."}</p></section>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
