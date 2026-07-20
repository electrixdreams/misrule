import type { WorldPackDraftBook, WorldPackDraftSpan } from "@/lib/world-pack-draft.client";

type FieldError = (path: string) => string | undefined;

export function SpanEditor({
  spans,
  books,
  fieldError,
  warning,
  onAdd,
  onChange,
  onMove,
  onRequestDelete,
}: {
  spans: WorldPackDraftSpan[];
  books: WorldPackDraftBook[];
  fieldError: FieldError;
  warning: string | null;
  onAdd: () => void;
  onChange: (index: number, span: WorldPackDraftSpan) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRequestDelete: (index: number) => void;
}) {
  return (
    <section id="editor-section-spans" className="editor-section" tabIndex={-1} aria-labelledby="spans-heading">
      <div className="editor-section-head">
        <span className="leaf-eyebrow">Evidence</span>
        <h2 id="spans-heading">Narrative evidence spans</h2>
        <button type="button" onClick={onAdd}>Add evidence span</button>
      </div>
      <p className="editor-guidance">Use exact source excerpts. Do not paste AI-generated summaries as evidence spans.</p>
      {warning ? <p role="alert" className="editor-warning">{warning}</p> : null}
      <div className="editor-stack">
        {spans.map((span, index) => (
          <fieldset key={span.spanId} className="editor-item">
            <legend>Span {index + 1}: {span.sourceLabel || span.spanId}</legend>
            <div className="editor-item-tools">
              <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0}>Move up</button>
              <button type="button" onClick={() => onMove(index, 1)} disabled={index === spans.length - 1}>Move down</button>
              <button type="button" onClick={() => onRequestDelete(index)}>Delete</button>
            </div>
            <div className="editor-grid">
              <label>
                <span>Book</span>
                <select value={span.bookId} onChange={(event) => onChange(index, { ...span, bookId: event.target.value })}>
                  {books.map((book) => <option key={book.bookId} value={book.bookId}>{book.title || book.bookId}</option>)}
                </select>
                {fieldError(`spans.${index}.bookId`) ? <small className="field-error">{fieldError(`spans.${index}.bookId`)}</small> : null}
              </label>
              <label>
                <span>Source label</span>
                <input value={span.sourceLabel} onChange={(event) => onChange(index, { ...span, sourceLabel: event.target.value })} />
                {fieldError(`spans.${index}.source.label`) ? <small className="field-error">{fieldError(`spans.${index}.source.label`)}</small> : null}
              </label>
              <label>
                <span>Scene</span>
                <input value={span.scene} onChange={(event) => onChange(index, { ...span, scene: event.target.value })} />
                {fieldError(`spans.${index}.source.scene`) ? <small className="field-error">{fieldError(`spans.${index}.source.scene`)}</small> : null}
              </label>
              <label>
                <span>Optional chapter</span>
                <input value={span.chapter} onChange={(event) => onChange(index, { ...span, chapter: event.target.value })} />
                {fieldError(`spans.${index}.source.chapter`) ? <small className="field-error">{fieldError(`spans.${index}.source.chapter`)}</small> : null}
              </label>
              <label className="editor-wide">
                <span>Exact narrative text</span>
                <textarea value={span.text} onChange={(event) => onChange(index, { ...span, text: event.target.value })} rows={4} />
                {fieldError(`spans.${index}.text`) ? <small className="field-error">{fieldError(`spans.${index}.text`)}</small> : null}
              </label>
            </div>
            <p className="editor-id-note">spanId {span.spanId}</p>
          </fieldset>
        ))}
      </div>
    </section>
  );
}
