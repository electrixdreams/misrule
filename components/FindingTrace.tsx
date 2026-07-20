import type { FindingDto } from "@/lib/contracts";

type Props = {
  finding: FindingDto;
  onBack: () => void;
  onCitation: (kind: "rule" | "span", id: string) => void;
};

export function FindingTrace({ finding, onBack, onCitation }: Props) {
  const contradiction = finding.kind === "contradiction";
  return (
    <div className={`finding-trace finding-trace--${finding.kind}`}>
      <header className="leaf-header">
        <div>
          <p className="leaf-eyebrow">Audit finding · {finding.id}</p>
          <h2>{finding.title}</h2>
        </div>
        <span className="folio">{contradiction ? "Closed route" : "Open route"}</span>
      </header>

      <div className="trace-toolbar">
        <span className={`trace-kind trace-kind--${finding.kind}`}>
          {contradiction ? "Contradiction under current rules" : "Unresolved under current evidence"}
        </span>
        <button className="text-button" type="button" onClick={onBack}>Return to findings</button>
      </div>

      {contradiction ? (
        <div className="fracture-summary" aria-label="Closed contradiction route">
          <span>Declared rules</span><i aria-hidden="true" /><span>Narrative record</span><b>Route closed</b>
        </div>
      ) : (
        <div className="ambiguity-machine" aria-label="Two supported readings stop at one missing fact">
          <article>
            <span>{finding.supportedReadings[0]?.label}</span>
            <p>{finding.supportedReadings[0]?.explanation}</p>
          </article>
          <div className="missing-socket">
            <span aria-hidden="true">?</span>
            <strong>Missing fact</strong>
            <p>{finding.missingFact}</p>
          </div>
          <article>
            <span>{finding.supportedReadings[1]?.label}</span>
            <p>{finding.supportedReadings[1]?.explanation}</p>
          </article>
        </div>
      )}

      <section className="citation-set" aria-label="Cited sources">
        <span>Cited route</span>
        <div>
          {finding.ruleRefs.map((reference) => (
            <button key={reference.id} type="button" onClick={() => onCitation("rule", reference.id)}>{reference.id}</button>
          ))}
          {finding.spanRefs.map((reference) => (
            <button key={reference.id} type="button" onClick={() => onCitation("span", reference.id)}>{reference.id}</button>
          ))}
        </div>
      </section>

      <ol className="reasoning-path">
        {finding.trace.map((step) => (
          <li key={step.ordinal}>
            <span className="step-ordinal">{String(step.ordinal).padStart(2, "0")}</span>
            <div>
              <b>{step.kind === "inference" ? "Inference" : step.kind === "rule" ? "Rule" : "Record"}</b>
              {step.refId ? (
                <button className="ref-jump" type="button" onClick={() => onCitation(step.kind as "rule" | "span", step.refId!)}>{step.refId}</button>
              ) : null}
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className={contradiction ? "conclusion conclusion--closed" : "conclusion conclusion--open"}>
        <strong>{contradiction ? "Why the route closes" : "Why this remains unresolved"}</strong>
        <p>{contradiction ? finding.explanation : finding.whyUnresolved}</p>
      </div>
    </div>
  );
}
