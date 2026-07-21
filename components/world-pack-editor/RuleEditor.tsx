import type { RuleType } from "@/lib/world-pack";
import type { WorldPackDraftBook, WorldPackDraftRule } from "@/lib/world-pack-draft.client";

type FieldError = (path: string) => string | undefined;

const RULE_TYPES: RuleType[] = ["fact", "constraint", "temporal", "conditional"];

const RULE_TYPE_HELP: Record<RuleType, string> = {
  fact: "A fixed, unconditional truth about the world — a name, a date, a place, a count.",
  constraint: "A boundary the world enforces: something that can never happen, or must always hold.",
  temporal: "A rule that only holds during a specific time window or sequence of events.",
  conditional: "A rule that applies only when a stated condition is met — an if/then.",
};

export function RuleFields({
  rule,
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
  rule: WorldPackDraftRule;
  index: number;
  books: WorldPackDraftBook[];
  fieldError: FieldError;
  showIds: boolean;
  active?: boolean;
  onExpand?: () => void;
  onChange: (rule: WorldPackDraftRule) => void;
  onMove?: (direction: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onRequestDelete?: () => void;
}) {
  return (
    <fieldset className="editor-item" data-active={active} onClick={() => { if (!active) onExpand?.(); }} onFocus={onExpand}>
      <legend>Rule {index + 1}: {rule.title || rule.ruleId}</legend>
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
          <span>Title</span>
          <input value={rule.title} onChange={(event) => onChange({ ...rule, title: event.target.value })} />
          {fieldError(`rules.${index}.title`) ? <small className="field-error">{fieldError(`rules.${index}.title`)}</small> : null}
        </label>
        <label>
          <span>Type</span>
          <select value={rule.type} onChange={(event) => onChange({ ...rule, type: event.target.value as RuleType })}>
            {RULE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <small className="rule-type-help">{RULE_TYPE_HELP[rule.type]}</small>
        </label>
        <label>
          <span>Scope</span>
          <select
            value={rule.scopeKind}
            onChange={(event) => {
              const scopeKind = event.target.value as WorldPackDraftRule["scopeKind"];
              onChange({ ...rule, scopeKind, bookId: scopeKind === "book" ? (rule.bookId || books[0]?.bookId || "") : rule.bookId });
            }}
          >
            <option value="world">World</option>
            <option value="book">Book</option>
          </select>
        </label>
        {rule.scopeKind === "book" ? (
          <label>
            <span>Book</span>
            <select value={rule.bookId} onChange={(event) => onChange({ ...rule, bookId: event.target.value })}>
              {books.map((book) => <option key={book.bookId} value={book.bookId}>{book.title || book.bookId}</option>)}
            </select>
            {fieldError(`rules.${index}.scope.bookId`) ? <small className="field-error">{fieldError(`rules.${index}.scope.bookId`)}</small> : null}
          </label>
        ) : null}
        <label className="editor-wide">
          <span>Exact rule text</span>
          <textarea value={rule.text} onChange={(event) => onChange({ ...rule, text: event.target.value })} rows={3} />
          {fieldError(`rules.${index}.text`) ? <small className="field-error">{fieldError(`rules.${index}.text`)}</small> : null}
        </label>
      </div>
      {showIds ? <p className="editor-id-note">ruleId {rule.ruleId}</p> : null}
    </fieldset>
  );
}

export function RuleEditor({
  rules,
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
  rules: WorldPackDraftRule[];
  books: WorldPackDraftBook[];
  fieldError: FieldError;
  showIds: boolean;
  warning: string | null;
  active?: boolean;
  onExpand?: () => void;
  activeItemIndex?: number;
  onItemExpand?: (index: number) => void;
  onAdd: () => void;
  onChange: (index: number, rule: WorldPackDraftRule) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRequestDelete: (index: number) => void;
}) {
  return (
    <section
      id="editor-section-rules"
      className="editor-section"
      data-active={active}
      tabIndex={-1}
      aria-labelledby="rules-heading"
      onClick={() => { if (!active) onExpand?.(); }}
      onFocus={onExpand}
    >
      <div className="editor-section-head">
        <span className="leaf-eyebrow">Declarations</span>
        <h2 id="rules-heading">Explicit rules</h2>
        <button type="button" onClick={onAdd}>Add rule</button>
      </div>
      <p className="editor-guidance">Use explicit author-declared rules only; do not turn inferred summaries into rules.</p>
      {warning ? <p role="alert" className="editor-warning">{warning}</p> : null}
      <div className="editor-stack">
        {rules.map((rule, index) => (
          <RuleFields
            key={rule.ruleId}
            rule={rule}
            index={index}
            books={books}
            fieldError={fieldError}
            showIds={showIds}
            active={activeItemIndex === undefined || activeItemIndex === index}
            onExpand={() => onItemExpand?.(index)}
            onChange={(next) => onChange(index, next)}
            onMove={(direction) => onMove(index, direction)}
            canMoveUp={index > 0}
            canMoveDown={index < rules.length - 1}
            onRequestDelete={() => onRequestDelete(index)}
          />
        ))}
      </div>
    </section>
  );
}
