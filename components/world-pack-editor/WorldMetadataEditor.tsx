import type { WorldPackDraft } from "@/lib/world-pack-draft.client";

type FieldError = (path: string) => string | undefined;

export function WorldMetadataEditor({
  draft,
  fieldError,
  onChange,
}: {
  draft: WorldPackDraft;
  fieldError: FieldError;
  onChange: (draft: WorldPackDraft) => void;
}) {
  const update = (patch: Partial<WorldPackDraft>) => onChange({ ...draft, ...patch });
  const updateWorld = (patch: Partial<WorldPackDraft["world"]>) => onChange({ ...draft, world: { ...draft.world, ...patch } });

  return (
    <section id="editor-section-pack" className="editor-section" tabIndex={-1} aria-labelledby="pack-metadata-heading">
      <div className="editor-section-head">
        <span className="leaf-eyebrow">Identity</span>
        <h2 id="pack-metadata-heading">Pack metadata</h2>
      </div>
      <div className="editor-grid">
        <label>
          <span>Pack title</span>
          <input value={draft.title} onChange={(event) => update({ title: event.target.value })} aria-describedby={fieldError("title") ? "error-title" : undefined} />
          {fieldError("title") ? <small id="error-title" className="field-error">{fieldError("title")}</small> : null}
        </label>
        <label>
          <span>Pack version</span>
          <input value={draft.packVersion} onChange={(event) => update({ packVersion: event.target.value })} aria-describedby={fieldError("packVersion") ? "error-packVersion" : undefined} />
          {fieldError("packVersion") ? <small id="error-packVersion" className="field-error">{fieldError("packVersion")}</small> : null}
        </label>
        <label className="editor-wide">
          <span>Pack description</span>
          <textarea value={draft.description} onChange={(event) => update({ description: event.target.value })} rows={3} aria-describedby={fieldError("description") ? "error-description" : undefined} />
          {fieldError("description") ? <small id="error-description" className="field-error">{fieldError("description")}</small> : null}
        </label>
        <label className="editor-wide">
          <span>Optional disclosure</span>
          <input value={draft.disclosure} onChange={(event) => update({ disclosure: event.target.value })} aria-describedby={fieldError("disclosure") ? "error-disclosure" : undefined} />
          {fieldError("disclosure") ? <small id="error-disclosure" className="field-error">{fieldError("disclosure")}</small> : null}
        </label>
      </div>

      <div id="editor-section-world" className="editor-subsection" tabIndex={-1} aria-labelledby="world-metadata-heading">
        <h3 id="world-metadata-heading">World metadata</h3>
        <div className="editor-grid">
          <label>
            <span>World title</span>
            <input value={draft.world.title} onChange={(event) => updateWorld({ title: event.target.value })} aria-describedby={fieldError("world.title") ? "error-world-title" : undefined} />
            {fieldError("world.title") ? <small id="error-world-title" className="field-error">{fieldError("world.title")}</small> : null}
          </label>
          <label>
            <span>World slug</span>
            <input value={draft.world.slug} onChange={(event) => updateWorld({ slug: event.target.value })} aria-describedby={fieldError("world.slug") ? "error-world-slug" : undefined} />
            {fieldError("world.slug") ? <small id="error-world-slug" className="field-error">{fieldError("world.slug")}</small> : null}
          </label>
          <label className="editor-wide">
            <span>Premise</span>
            <textarea value={draft.world.premise} onChange={(event) => updateWorld({ premise: event.target.value })} rows={3} aria-describedby={fieldError("world.premise") ? "error-world-premise" : undefined} />
            {fieldError("world.premise") ? <small id="error-world-premise" className="field-error">{fieldError("world.premise")}</small> : null}
          </label>
          <label className="editor-wide">
            <span>Summary</span>
            <textarea value={draft.world.summary} onChange={(event) => updateWorld({ summary: event.target.value })} rows={3} aria-describedby={fieldError("world.summary") ? "error-world-summary" : undefined} />
            {fieldError("world.summary") ? <small id="error-world-summary" className="field-error">{fieldError("world.summary")}</small> : null}
          </label>
          <label className="editor-wide">
            <span>Tags</span>
            <input value={draft.world.tagsText} onChange={(event) => updateWorld({ tagsText: event.target.value })} aria-describedby="tags-help" />
            <small id="tags-help">Comma-separated tags. Validation shows the saved tag list.</small>
            {fieldError("world.tags") ? <small className="field-error">{fieldError("world.tags")}</small> : null}
          </label>
        </div>
      </div>

      <details className="editor-identifiers">
        <summary>Identifiers</summary>
        <dl>
          <div><dt>packId</dt><dd>{draft.packId}</dd></div>
          <div><dt>worldId</dt><dd>{draft.world.worldId}</dd></div>
          <div><dt>schemaVersion</dt><dd>{draft.schemaVersion}</dd></div>
        </dl>
      </details>
    </section>
  );
}
