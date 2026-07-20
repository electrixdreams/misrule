import type { RuleType } from "@/lib/world-pack";
import type { WorldPackDraftBook, WorldPackDraftRule } from "@/lib/world-pack-draft.client";

type FieldError = (path: string) => string | undefined;

const RULE_TYPES: RuleType[] = ["fact", "constraint", "temporal", "conditional"];

export function RuleEditor({
  rules,
  books,
  fieldError,
  warning,
  onAdd,
  onChange,
  onMove,
  onRequestDelete,
}: {
  rules: WorldPackDraftRule[];
  books: WorldPackDraftBook[];
  fieldError: FieldError;
  warning: string | null;
  onAdd: () => void;
  onChange: (index: number, rule: WorldPackDraftRule) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRequestDelete: (index: number) => void;
}) {
  const firstBookId = books[0]?.bookId ?? "";

  return (
    <section id="editor-section-rules" className="editor-section" tabIndex={-1} aria-labelledby="rules-heading">
      <div className="editor-section-head">
        <span className="leaf-eyebrow">Declarations</span>
        <h2 id="rules-heading">Explicit rules</h2>
        <button type="button" onClick={onAdd}>Add rule</button>
      </div>
      <p className="editor-guidance">Use explicit author-declared rules only; do not turn inferred summaries into rules.</p>
      {warning ? <p role="alert" className="editor-warning">{warning}</p> : null}
      <div className="editor-stack">
        {rules.map((rule, index) => (
          <fieldset key={rule.ruleId} className="editor-item">
            <legend>Rule {index + 1}: {rule.title || rule.ruleId}</legend>
            <div className="editor-item-tools">
              <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0}>Move up</button>
              <button type="button" onClick={() => onMove(index, 1)} disabled={index === rules.length - 1}>Move down</button>
              <button type="button" onClick={() => onRequestDelete(index)}>Delete</button>
            </div>
            <div className="editor-grid">
              <label>
                <span>Title</span>
                <input value={rule.title} onChange={(event) => onChange(index, { ...rule, title: event.target.value })} />
                {fieldError(`rules.${index}.title`) ? <small className="field-error">{fieldError(`rules.${index}.title`)}</small> : null}
              </label>
              <label>
                <span>Type</span>
                <select value={rule.type} onChange={(event) => onChange(index, { ...rule, type: event.target.value as RuleType })}>
                  {RULE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label>
                <span>Scope</span>
                <select
                  value={rule.scopeKind}
                  onChange={(event) => {
                    const scopeKind = event.target.value as WorldPackDraftRule["scopeKind"];
                    onChange(index, { ...rule, scopeKind, bookId: scopeKind === "book" ? (rule.bookId || firstBookId) : rule.bookId });
                  }}
                >
                  <option value="world">World</option>
                  <option value="book">Book</option>
                </select>
              </label>
              {rule.scopeKind === "book" ? (
                <label>
                  <span>Book</span>
                  <select value={rule.bookId} onChange={(event) => onChange(index, { ...rule, bookId: event.target.value })}>
                    {books.map((book) => <option key={book.bookId} value={book.bookId}>{book.title || book.bookId}</option>)}
                  </select>
                  {fieldError(`rules.${index}.scope.bookId`) ? <small className="field-error">{fieldError(`rules.${index}.scope.bookId`)}</small> : null}
                </label>
              ) : null}
              <label className="editor-wide">
                <span>Exact rule text</span>
                <textarea value={rule.text} onChange={(event) => onChange(index, { ...rule, text: event.target.value })} rows={3} />
                {fieldError(`rules.${index}.text`) ? <small className="field-error">{fieldError(`rules.${index}.text`)}</small> : null}
              </label>
            </div>
            <p className="editor-id-note">ruleId {rule.ruleId}</p>
          </fieldset>
        ))}
      </div>
    </section>
  );
}
