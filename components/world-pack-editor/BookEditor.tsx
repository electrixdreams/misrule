import type { WorldPackDraftBook } from "@/lib/world-pack-draft.client";

type FieldError = (path: string) => string | undefined;

export function BookFields({
  book,
  index,
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
  book: WorldPackDraftBook;
  index: number;
  fieldError: FieldError;
  showIds: boolean;
  active?: boolean;
  onExpand?: () => void;
  onChange: (book: WorldPackDraftBook) => void;
  onMove?: (direction: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onRequestDelete?: () => void;
}) {
  return (
    <fieldset className="editor-item" data-active={active} onClick={() => { if (!active) onExpand?.(); }} onFocus={onExpand}>
      <legend>Book {index + 1}: {book.title || book.bookId}</legend>
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
          <input value={book.title} onChange={(event) => onChange({ ...book, title: event.target.value })} />
          {fieldError(`books.${index}.title`) ? <small className="field-error">{fieldError(`books.${index}.title`)}</small> : null}
        </label>
        <label>
          <span>Slug</span>
          <input value={book.slug} onChange={(event) => onChange({ ...book, slug: event.target.value })} />
          {fieldError(`books.${index}.slug`) ? <small className="field-error">{fieldError(`books.${index}.slug`)}</small> : null}
        </label>
        <label>
          <span>Source label</span>
          <input value={book.sourceLabel} onChange={(event) => onChange({ ...book, sourceLabel: event.target.value })} />
          {fieldError(`books.${index}.sourceLabel`) ? <small className="field-error">{fieldError(`books.${index}.sourceLabel`)}</small> : null}
        </label>
        <label>
          <span>Optional summary</span>
          <input value={book.summary} onChange={(event) => onChange({ ...book, summary: event.target.value })} />
          {fieldError(`books.${index}.summary`) ? <small className="field-error">{fieldError(`books.${index}.summary`)}</small> : null}
        </label>
      </div>
      {showIds ? <p className="editor-id-note">bookId {book.bookId}</p> : null}
    </fieldset>
  );
}

export function BookEditor({
  books,
  fieldError,
  showIds,
  dependencyWarning,
  active = true,
  onExpand,
  activeItemIndex,
  onItemExpand,
  onAdd,
  onChange,
  onMove,
  onRequestDelete,
}: {
  books: WorldPackDraftBook[];
  fieldError: FieldError;
  showIds: boolean;
  dependencyWarning: string | null;
  active?: boolean;
  onExpand?: () => void;
  activeItemIndex?: number;
  onItemExpand?: (index: number) => void;
  onAdd: () => void;
  onChange: (index: number, book: WorldPackDraftBook) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRequestDelete: (index: number) => void;
}) {
  return (
    <section
      id="editor-section-books"
      className="editor-section"
      data-active={active}
      tabIndex={-1}
      aria-labelledby="books-heading"
      onClick={() => { if (!active) onExpand?.(); }}
      onFocus={onExpand}
    >
      <div className="editor-section-head">
        <span className="leaf-eyebrow">Volumes</span>
        <h2 id="books-heading">Books</h2>
        <button type="button" onClick={onAdd}>Add book</button>
      </div>
      {dependencyWarning ? <p role="alert" className="editor-warning">{dependencyWarning}</p> : null}
      <div className="editor-stack">
        {books.map((book, index) => (
          <BookFields
            key={book.bookId}
            book={book}
            index={index}
            fieldError={fieldError}
            showIds={showIds}
            active={activeItemIndex === undefined || activeItemIndex === index}
            onExpand={() => onItemExpand?.(index)}
            onChange={(next) => onChange(index, next)}
            onMove={(direction) => onMove(index, direction)}
            canMoveUp={index > 0}
            canMoveDown={index < books.length - 1}
            onRequestDelete={() => onRequestDelete(index)}
          />
        ))}
      </div>
    </section>
  );
}
