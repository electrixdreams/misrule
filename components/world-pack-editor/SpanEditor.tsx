import type { WorldPackDraftBook, WorldPackDraftSpan } from "@/lib/world-pack-draft.client";

type FieldError = (path: string) => string | undefined;

export function SpanFields({
  span,
  index,
  books,
  fieldError,
  showIds,
  active = true,
  onExpand,
  onChange,
  onMove,
  canMoveUp,
  canMoveDown,
  onRequestDelete,
}: {
  span: WorldPackDraftSpan;
  index: number;
  books: WorldPackDraftBook[];
  fieldError: FieldError;
  showIds: boolean;
  active?: boolean;
  onExpand?: () => void;
  onChange: (span: WorldPackDraftSpan) => void;
  onMove?: (direction: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onRequestDelete?: () => void;
}) {
  return (
    <fieldset className="editor-item" data-active={active} onClick={() => { if (!active) onExpand?.(); }} onFocus={onExpand}>
      <legend>Span {index + 1}: {span.sourceLabel || span.spanId}</legend>
      {onMove || onRequestDelete ? (
        <div className="editor-item-tools">
          {onMove ? (
            <>
              <button type="button" onClick={() => onMove(-1)} disabled={!canMoveUp}>Move up</button>
              <button type="button" onClick={() => onMove(1)} disabled={!canMoveDown}>Move down</button>
            </>
          ) : null}
          {onRequestDelete ? <button type="button" onClick={onRequestDelete}>Delete</button> : null}
        </div>
      ) : null}
      <div className="editor-grid">
        <label>
          <span>Book</span>
          <select value={span.bookId} onChange={(event) => onChange({ ...span, bookId: event.target.value })}>
            {books.map((book) => <option key={book.bookId} value={book.bookId}>{book.title || book.bookId}</option>)}
          </select>
          {fieldError(`spans.${index}.bookId`) ? <small className="field-error">{fieldError(`spans.${index}.bookId`)}</small> : null}
        </label>
        <label>
          <span>Source label</span>
          <input value={span.sourceLabel} onChange={(event) => onChange({ ...span, sourceLabel: event.target.value })} />
          {fieldError(`spans.${index}.source.label`) ? <small className="field-error">{fieldError(`spans.${index}.source.label`)}</small> : null}
        </label>
        <label>
          <span>Scene</span>
          <input value={span.scene} onChange={(event) => onChange({ ...span, scene: event.target.value })} />
          {fieldError(`spans.${index}.source.scene`) ? <small className="field-error">{fieldError(`spans.${index}.source.scene`)}</small> : null}
        </label>
        <label>
          <span>Optional chapter</span>
          <input value={span.chapter} onChange={(event) => onChange({ ...span, chapter: event.target.value })} />
          {fieldError(`spans.${index}.source.chapter`) ? <small className="field-error">{fieldError(`spans.${index}.source.chapter`)}</small> : null}
        </label>
        <label className="editor-wide">
          <span>Exact narrative text</span>
          <textarea value={span.text} onChange={(event) => onChange({ ...span, text: event.target.value })} rows={4} />
          {fieldError(`spans.${index}.text`) ? <small className="field-error">{fieldError(`spans.${index}.text`)}</small> : null}
        </label>
      </div>
      {showIds ? <p className="editor-id-note">spanId {span.spanId}</p> : null}
    </fieldset>
  );
}

export function SpanEditor({
  spans,
  books,
  fieldError,
  showIds,
  warning,
  active = true,
  onExpand,
  activeItemIndex,
  onItemExpand,
  onAdd,
  onChange,
  onMove,
  onRequestDelete,
}: {
  spans: WorldPackDraftSpan[];
  books: WorldPackDraftBook[];
  fieldError: FieldError;
  showIds: boolean;
  warning: string | null;
  active?: boolean;
  onExpand?: () => void;
  activeItemIndex?: number;
  onItemExpand?: (index: number) => void;
  onAdd: () => void;
  onChange: (index: number, span: WorldPackDraftSpan) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRequestDelete: (index: number) => void;
}) {
  return (
    <section
      id="editor-section-spans"
      className="editor-section"
      data-active={active}
      tabIndex={-1}
      aria-labelledby="spans-heading"
      onClick={() => { if (!active) onExpand?.(); }}
      onFocus={onExpand}
    >
      <div className="editor-section-head">
        <span className="leaf-eyebrow">Evidence</span>
        <h2 id="spans-heading">Narrative evidence spans</h2>
        <button type="button" onClick={onAdd}>Add evidence span</button>
      </div>
      <p className="editor-guidance">Use exact source excerpts. Do not paste AI-generated summaries as evidence spans.</p>
      {warning ? <p role="alert" className="editor-warning">{warning}</p> : null}
      <div className="editor-stack">
        {spans.map((span, index) => (
          <SpanFields
            key={span.spanId}
            span={span}
            index={index}
            books={books}
            fieldError={fieldError}
            showIds={showIds}
            active={activeItemIndex === undefined || activeItemIndex === index}
            onExpand={() => onItemExpand?.(index)}
            onChange={(next) => onChange(index, next)}
            onMove={(direction) => onMove(index, direction)}
            canMoveUp={index > 0}
            canMoveDown={index < spans.length - 1}
            onRequestDelete={() => onRequestDelete(index)}
          />
        ))}
      </div>
    </section>
  );
}
