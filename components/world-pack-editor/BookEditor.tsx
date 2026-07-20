import type { WorldPackDraftBook } from "@/lib/world-pack-draft.client";

type FieldError = (path: string) => string | undefined;

export function BookEditor({
  books,
  fieldError,
  dependencyWarning,
  onAdd,
  onChange,
  onMove,
  onRequestDelete,
}: {
  books: WorldPackDraftBook[];
  fieldError: FieldError;
  dependencyWarning: string | null;
  onAdd: () => void;
  onChange: (index: number, book: WorldPackDraftBook) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRequestDelete: (index: number) => void;
}) {
  return (
    <section id="editor-section-books" className="editor-section" tabIndex={-1} aria-labelledby="books-heading">
      <div className="editor-section-head">
        <span className="leaf-eyebrow">Volumes</span>
        <h2 id="books-heading">Books</h2>
        <button type="button" onClick={onAdd}>Add book</button>
      </div>
      {dependencyWarning ? <p role="alert" className="editor-warning">{dependencyWarning}</p> : null}
      <div className="editor-stack">
        {books.map((book, index) => (
          <fieldset key={book.bookId} className="editor-item">
            <legend>Book {index + 1}: {book.title || book.bookId}</legend>
            <div className="editor-item-tools">
              <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0}>Move up</button>
              <button type="button" onClick={() => onMove(index, 1)} disabled={index === books.length - 1}>Move down</button>
              <button type="button" onClick={() => onRequestDelete(index)}>Delete</button>
            </div>
            <div className="editor-grid">
              <label>
                <span>Title</span>
                <input value={book.title} onChange={(event) => onChange(index, { ...book, title: event.target.value })} />
                {fieldError(`books.${index}.title`) ? <small className="field-error">{fieldError(`books.${index}.title`)}</small> : null}
              </label>
              <label>
                <span>Slug</span>
                <input value={book.slug} onChange={(event) => onChange(index, { ...book, slug: event.target.value })} />
                {fieldError(`books.${index}.slug`) ? <small className="field-error">{fieldError(`books.${index}.slug`)}</small> : null}
              </label>
              <label>
                <span>Source label</span>
                <input value={book.sourceLabel} onChange={(event) => onChange(index, { ...book, sourceLabel: event.target.value })} />
                {fieldError(`books.${index}.sourceLabel`) ? <small className="field-error">{fieldError(`books.${index}.sourceLabel`)}</small> : null}
              </label>
              <label>
                <span>Optional summary</span>
                <input value={book.summary} onChange={(event) => onChange(index, { ...book, summary: event.target.value })} />
                {fieldError(`books.${index}.summary`) ? <small className="field-error">{fieldError(`books.${index}.summary`)}</small> : null}
              </label>
            </div>
            <p className="editor-id-note">bookId {book.bookId}</p>
          </fieldset>
        ))}
      </div>
    </section>
  );
}
