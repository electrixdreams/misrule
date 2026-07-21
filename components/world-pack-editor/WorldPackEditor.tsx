"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createBlankWorldPackDraft,
  createDraftBook,
  createDraftRule,
  createDraftSpan,
  draftFromWorldPack,
  validateWorldPackDraft,
  type EditorValidationIssue,
  type WorldPackDraft,
} from "@/lib/world-pack-draft.client";
import {
  WorldLibraryError,
  getLocalWorldPack,
  saveLocalWorldPack,
  type WorldLibraryErrorCode,
} from "@/lib/world-library.client";
import { ConfirmWorldPackAction } from "@/components/world-library/ConfirmWorldPackAction";
import { ValidationSummary } from "./ValidationSummary";
import { WorldMetadataEditor } from "./WorldMetadataEditor";
import { BookEditor } from "./BookEditor";
import { RuleEditor } from "./RuleEditor";
import { SpanEditor } from "./SpanEditor";

const SAVE_ERRORS: Record<WorldLibraryErrorCode, string> = {
  STORAGE_UNAVAILABLE: "Browser-local storage is unavailable.",
  CORRUPTED_ENVELOPE: "The stored World Library failed validation.",
  UNSUPPORTED_VERSION: "The stored World Library version is not supported.",
  INVALID_PACK: "The World Pack failed validation.",
  DUPLICATE_ID: "A local World Pack already uses this packId.",
  PACK_TOO_LARGE: "The World Pack exceeds the 768 KiB limit.",
  PACK_COUNT_LIMIT: "The local World Library already contains eight World Packs.",
  LIBRARY_SIZE_LIMIT: "The World Library exceeds the 3.5 MiB limit.",
  QUOTA_EXCEEDED: "The browser rejected the write because its storage quota was exceeded.",
};

type PendingDelete =
  | { kind: "book"; index: number; title: string }
  | { kind: "rule"; index: number; title: string }
  | { kind: "span"; index: number; title: string };

type InitialEditorState = {
  draft: WorldPackDraft | null;
  currentMode: "create" | "edit";
  currentPackId?: string;
  loadError: string | null;
};

function initialEditorState(mode: "create" | "edit", packId?: string): InitialEditorState {
  if (mode === "create") {
    return {
      draft: createBlankWorldPackDraft(),
      currentMode: "create",
      currentPackId: undefined,
      loadError: null,
    };
  }
  if (!packId) {
    return {
      draft: null,
      currentMode: "edit",
      currentPackId: undefined,
      loadError: "No local pack ID was provided.",
    };
  }
  try {
    const entry = getLocalWorldPack(packId);
    if (!entry) {
      return {
        draft: null,
        currentMode: "edit",
        currentPackId: packId,
        loadError: "This local World Pack is no longer in the World Library.",
      };
    }
    return {
      draft: draftFromWorldPack(entry.pack),
      currentMode: "edit",
      currentPackId: packId,
      loadError: null,
    };
  } catch (error) {
    return {
      draft: null,
      currentMode: "edit",
      currentPackId: packId,
      loadError: error instanceof WorldLibraryError ? (SAVE_ERRORS[error.code] ?? error.message) : "The local World Pack could not be opened.",
    };
  }
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function titleForDelete(deleteTarget: PendingDelete): string {
  if (deleteTarget.kind === "book") return "Delete book";
  if (deleteTarget.kind === "rule") return "Delete rule";
  return "Delete evidence span";
}

// The four sections a draft breaks into. Create mode steps through them one
// at a time (a guided wizard); edit mode leaves all four in place but starts
// with only "identity" expanded, so opening an existing pack doesn't dump
// every book/rule/span on screen at once — click any collapsed header or
// item to expand it. Both modes share the exact same section components;
// only which item (if any) is force-expanded differs.
type SectionId = "identity" | "books" | "rules" | "spans";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "identity", label: "World & Pack" },
  { id: "books", label: "Books" },
  { id: "rules", label: "Rules" },
  { id: "spans", label: "Evidence" },
];

const SECTION_EXAMPLES: Record<SectionId, string> = {
  identity: "Premise: “Every promise leaves a visible mark on the promiser’s skin.” Summary: “A trade city where oaths are enforced by scars, not courts.”",
  books: "Title “The Ledger of Low Tide” · Slug “ledger-low-tide” · Source label “Ledger of Low Tide, Ch. 1–4.”",
  rules: "Type constraint · Text “No oath-scar can be hidden by clothing, paint, or magic.”",
  spans: "Source label “Ledger of Low Tide” · Scene “The tide-market oath” · Text “Mira pressed her thumb to the ledger; the mark bloomed silver before the ink dried.”",
};

export function WorldPackEditor({
  mode,
  packId,
  onReturnToLibrary,
}: {
  mode: "create" | "edit";
  packId?: string;
  onReturnToLibrary: () => void;
}) {
  const [initial] = useState(() => initialEditorState(mode, packId));
  const [draft, setDraft] = useState<WorldPackDraft | null>(initial.draft);
  const [currentMode, setCurrentMode] = useState<"create" | "edit">(initial.currentMode);
  const [currentPackId, setCurrentPackId] = useState(initial.currentPackId);
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<EditorValidationIssue[]>([]);
  const [validated, setValidated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loadError] = useState<string | null>(initial.loadError);
  const [deleteWarning, setDeleteWarning] = useState<{ section: "books" | "rules" | "spans"; message: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [exitPromptOpen, setExitPromptOpen] = useState(false);
  const [showIds, setShowIds] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("identity");
  const [activeBookIndex, setActiveBookIndex] = useState(0);
  const [activeRuleIndex, setActiveRuleIndex] = useState(0);
  const [activeSpanIndex, setActiveSpanIndex] = useState(0);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const fieldErrors = useMemo(() => {
    const byPath = new Map<string, string>();
    for (const issue of issues) {
      if (!byPath.has(issue.path)) byPath.set(issue.path, issue.message);
    }
    return byPath;
  }, [issues]);

  const fieldError = useCallback((path: string) => fieldErrors.get(path), [fieldErrors]);

  const updateDraft = useCallback((next: WorldPackDraft) => {
    setDraft(next);
    setDirty(true);
    setValidated(false);
    setIssues([]);
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  const validate = useCallback(() => {
    if (!draft) return null;
    const result = validateWorldPackDraft(draft);
    setIssues(result.issues);
    setValidated(true);
    setSaveMessage(result.ok ? "This draft passes canonical validation." : null);
    return result;
  }, [draft]);

  const save = useCallback((returnAfterSave: boolean) => {
    if (!draft) return;
    const result = validateWorldPackDraft(draft);
    setIssues(result.issues);
    setValidated(true);
    if (!result.ok) {
      setSaveMessage(null);
      setSaveError("Resolve validation problems before saving.");
      return;
    }

    if (currentMode === "edit") {
      const targetId = currentPackId ?? result.pack.packId;
      try {
        if (!getLocalWorldPack(targetId)) {
          setSaveMessage(null);
          setSaveError("This local World Pack is no longer in the World Library. It was not recreated.");
          return;
        }
      } catch (error) {
        setSaveMessage(null);
        setSaveError(error instanceof WorldLibraryError ? (SAVE_ERRORS[error.code] ?? error.message) : "The World Library could not be checked before saving.");
        return;
      }
    }

    try {
      saveLocalWorldPack(result.pack, currentMode === "edit" ? { onConflict: "replace" } : {});
      setCurrentMode("edit");
      setCurrentPackId(result.pack.packId);
      setDirty(false);
      setSaveError(null);
      setSaveMessage("Saved to the local World Library.");
      if (returnAfterSave) onReturnToLibrary();
    } catch (error) {
      setSaveMessage(null);
      setSaveError(error instanceof WorldLibraryError ? (SAVE_ERRORS[error.code] ?? error.message) : "The World Pack could not be saved.");
    }
  }, [currentMode, currentPackId, draft, onReturnToLibrary]);

  function requestReturn() {
    if (dirty) setExitPromptOpen(true);
    else onReturnToLibrary();
  }

  function requestBookDelete(index: number) {
    if (!draft) return;
    const book = draft.books[index];
    if (draft.books.length <= 1) {
      setDeleteWarning({ section: "books", message: "At least one book must remain." });
      return;
    }
    const ruleIds = draft.rules.filter((rule) => rule.scopeKind === "book" && rule.bookId === book.bookId).map((rule) => rule.ruleId);
    const spanIds = draft.spans.filter((span) => span.bookId === book.bookId).map((span) => span.spanId);
    if (ruleIds.length || spanIds.length) {
      const dependencies = [
        ruleIds.length ? `rules: ${ruleIds.join(", ")}` : null,
        spanIds.length ? `spans: ${spanIds.join(", ")}` : null,
      ].filter(Boolean).join("; ");
      setDeleteWarning({ section: "books", message: `Book ${book.bookId} cannot be deleted while referenced by ${dependencies}.` });
      return;
    }
    setDeleteWarning(null);
    setPendingDelete({ kind: "book", index, title: book.title || book.bookId });
  }

  function confirmDelete() {
    if (!draft || !pendingDelete) return;
    if (pendingDelete.kind === "book") {
      updateDraft({ ...draft, books: draft.books.filter((_, index) => index !== pendingDelete.index) });
    } else if (pendingDelete.kind === "rule") {
      if (draft.rules.length <= 1) {
        setDeleteWarning({ section: "rules", message: "At least one rule must remain." });
      } else {
        updateDraft({ ...draft, rules: draft.rules.filter((_, index) => index !== pendingDelete.index) });
      }
    } else if (draft.spans.length <= 1) {
      setDeleteWarning({ section: "spans", message: "At least one evidence span must remain." });
    } else {
      updateDraft({ ...draft, spans: draft.spans.filter((_, index) => index !== pendingDelete.index) });
    }
    setPendingDelete(null);
  }

  if (loadError) {
    return (
      <main className="world-pack-editor">
        <div className="editor-header">
          <p className="leaf-eyebrow">World Pack editor</p>
          <h1>Editor unavailable</h1>
          <p role="alert">{loadError}</p>
          <button type="button" onClick={onReturnToLibrary}>Return to library</button>
        </div>
      </main>
    );
  }

  if (!draft) {
    return (
      <main className="world-pack-editor">
        <div className="editor-header">
          <p className="leaf-eyebrow">World Pack editor</p>
          <h1>Loading editor</h1>
        </div>
      </main>
    );
  }

  const isEdit = currentMode === "edit";
  const safeBookIndex = draft.books.length ? Math.min(activeBookIndex, draft.books.length - 1) : 0;
  const safeRuleIndex = draft.rules.length ? Math.min(activeRuleIndex, draft.rules.length - 1) : 0;
  const safeSpanIndex = draft.spans.length ? Math.min(activeSpanIndex, draft.spans.length - 1) : 0;
  const sectionIndex = SECTIONS.findIndex((section) => section.id === activeSection);

  return (
    <main className="world-pack-editor" aria-labelledby="editor-title">
      <header className="editor-header">
        <div>
          <p className="leaf-eyebrow">World Pack editor</p>
          <h1 id="editor-title">{currentMode === "create" ? "Create World Pack" : "Edit World Pack"}</h1>
          <p>
            Author structured world rules and exact narrative spans. Local packs stay in this browser until you explicitly save them.
          </p>
        </div>
        <div className="editor-header-actions">
          <button type="button" onClick={requestReturn}>Return to library</button>
        </div>
      </header>

      <div className="editor-body">
        {currentMode === "create" ? (
          <div className="editor-stepper">
            <ol className="editor-steps" aria-label="Creation steps">
              {SECTIONS.map((section, index) => (
                <li key={section.id}>
                  <button
                    type="button"
                    className="editor-step-pill"
                    data-active={activeSection === section.id}
                    data-done={index < sectionIndex}
                    aria-current={activeSection === section.id ? "step" : undefined}
                    onClick={() => setActiveSection(section.id)}
                  >
                    <span className="editor-step-number">{index + 1}</span>
                    <span>{section.label}</span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="editor-step-pill"
                  onClick={() => document.getElementById("editor-review")?.scrollIntoView({ block: "start" })}
                >
                  <span className="editor-step-number">{SECTIONS.length + 1}</span>
                  <span>Review</span>
                </button>
              </li>
            </ol>
            <div className="editor-step-controls">
              <button
                type="button"
                onClick={() => { if (sectionIndex > 0) setActiveSection(SECTIONS[sectionIndex - 1].id); }}
                disabled={sectionIndex <= 0}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (sectionIndex < SECTIONS.length - 1) setActiveSection(SECTIONS[sectionIndex + 1].id);
                  else document.getElementById("editor-review")?.scrollIntoView({ block: "start" });
                }}
              >
                {sectionIndex >= SECTIONS.length - 1 ? "Review" : "Next"}
              </button>
            </div>
          </div>
        ) : null}

        <ValidationSummary issues={issues} validated={validated} />

        {currentMode === "create" && activeSection !== "identity" ? (
          <p className="editor-step-summary">{draft.world.title || "Untitled world"} · pack “{draft.title || "untitled"}”</p>
        ) : null}
        {currentMode === "create" && activeSection === "identity" ? (
          <p className="editor-example"><strong>Example.</strong> {SECTION_EXAMPLES.identity}</p>
        ) : null}
        <WorldMetadataEditor
          draft={draft}
          fieldError={fieldError}
          showIds={showIds}
          active={activeSection === "identity"}
          onExpand={() => setActiveSection("identity")}
          onChange={updateDraft}
        />

        {currentMode === "create" && activeSection !== "books" ? (
          <p className="editor-step-summary">{draft.books.length} book{draft.books.length === 1 ? "" : "s"}</p>
        ) : null}
        {currentMode === "create" && activeSection === "books" ? (
          <p className="editor-example"><strong>Example.</strong> {SECTION_EXAMPLES.books}</p>
        ) : null}
        <BookEditor
          books={draft.books}
          fieldError={fieldError}
          showIds={showIds}
          dependencyWarning={deleteWarning?.section === "books" ? deleteWarning.message : null}
          active={activeSection === "books"}
          onExpand={() => setActiveSection("books")}
          activeItemIndex={isEdit ? safeBookIndex : undefined}
          onItemExpand={setActiveBookIndex}
          onAdd={() => { setActiveSection("books"); setActiveBookIndex(draft.books.length); updateDraft({ ...draft, books: [...draft.books, createDraftBook()] }); }}
          onChange={(index, book) => updateDraft({ ...draft, books: draft.books.map((candidate, candidateIndex) => candidateIndex === index ? book : candidate) })}
          onMove={(index, direction) => updateDraft({ ...draft, books: moveItem(draft.books, index, direction) })}
          onRequestDelete={requestBookDelete}
        />

        {currentMode === "create" && activeSection !== "rules" ? (
          <p className="editor-step-summary">{draft.rules.length} rule{draft.rules.length === 1 ? "" : "s"}</p>
        ) : null}
        {currentMode === "create" && activeSection === "rules" ? (
          <p className="editor-example"><strong>Example.</strong> {SECTION_EXAMPLES.rules}</p>
        ) : null}
        <RuleEditor
          rules={draft.rules}
          books={draft.books}
          fieldError={fieldError}
          showIds={showIds}
          warning={deleteWarning?.section === "rules" ? deleteWarning.message : null}
          active={activeSection === "rules"}
          onExpand={() => setActiveSection("rules")}
          activeItemIndex={isEdit ? safeRuleIndex : undefined}
          onItemExpand={setActiveRuleIndex}
          onAdd={() => { setActiveSection("rules"); setActiveRuleIndex(draft.rules.length); updateDraft({ ...draft, rules: [...draft.rules, { ...createDraftRule(), bookId: draft.books[0]?.bookId ?? "" }] }); }}
          onChange={(index, rule) => updateDraft({ ...draft, rules: draft.rules.map((candidate, candidateIndex) => candidateIndex === index ? rule : candidate) })}
          onMove={(index, direction) => updateDraft({ ...draft, rules: moveItem(draft.rules, index, direction) })}
          onRequestDelete={(index) => setPendingDelete({ kind: "rule", index, title: draft.rules[index].title || draft.rules[index].ruleId })}
        />

        {currentMode === "create" && activeSection !== "spans" ? (
          <p className="editor-step-summary">{draft.spans.length} evidence span{draft.spans.length === 1 ? "" : "s"}</p>
        ) : null}
        {currentMode === "create" && activeSection === "spans" ? (
          <p className="editor-example"><strong>Example.</strong> {SECTION_EXAMPLES.spans}</p>
        ) : null}
        <SpanEditor
          spans={draft.spans}
          books={draft.books}
          fieldError={fieldError}
          showIds={showIds}
          warning={deleteWarning?.section === "spans" ? deleteWarning.message : null}
          active={activeSection === "spans"}
          onExpand={() => setActiveSection("spans")}
          activeItemIndex={isEdit ? safeSpanIndex : undefined}
          onItemExpand={setActiveSpanIndex}
          onAdd={() => { setActiveSection("spans"); setActiveSpanIndex(draft.spans.length); updateDraft({ ...draft, spans: [...draft.spans, createDraftSpan(draft.books[0]?.bookId ?? "")] }); }}
          onChange={(index, span) => updateDraft({ ...draft, spans: draft.spans.map((candidate, candidateIndex) => candidateIndex === index ? span : candidate) })}
          onMove={(index, direction) => updateDraft({ ...draft, spans: moveItem(draft.spans, index, direction) })}
          onRequestDelete={(index) => setPendingDelete({ kind: "span", index, title: draft.spans[index].sourceLabel || draft.spans[index].spanId })}
        />

        {currentMode === "create" ? (
          <section id="editor-review" className="editor-review" aria-labelledby="editor-review-heading">
            <div className="editor-section-head">
              <span className="leaf-eyebrow">Ready?</span>
              <h2 id="editor-review-heading">Review &amp; save</h2>
            </div>
            <p className="editor-review-recap">
              “{draft.title || "Untitled pack"}” · {draft.books.length} book{draft.books.length === 1 ? "" : "s"} · {draft.rules.length} rule{draft.rules.length === 1 ? "" : "s"} · {draft.spans.length} evidence span{draft.spans.length === 1 ? "" : "s"}
            </p>
            <p className="editor-guidance">Validate to check every declared rule and span against Misrule&apos;s canonical schema, then save. You can always come back and keep editing.</p>
          </section>
        ) : null}
      </div>

      <footer className="editor-footer">
        <div className="editor-status-row">
          <span data-dirty={dirty ? "true" : "false"}>{dirty ? "Unsaved changes" : "Saved state"}</span>
          {saveMessage ? <p role="status">{saveMessage}</p> : null}
          {saveError ? <p role="alert">{saveError}</p> : null}
        </div>
        <label className="id-toggle">
          <input type="checkbox" checked={showIds} onChange={(event) => setShowIds(event.target.checked)} />
          Show internal IDs
        </label>
        <div className="editor-footer-actions">
          <button type="button" onClick={validate}>Validate</button>
          <button type="button" onClick={() => save(false)}>Save</button>
          <button type="button" onClick={() => save(true)}>Save and return</button>
        </div>
      </footer>

      <ConfirmWorldPackAction
        open={pendingDelete !== null}
        title={pendingDelete ? titleForDelete(pendingDelete) : "Delete item"}
        message={pendingDelete ? `Delete ${pendingDelete.title}? This change is not saved until you save the World Pack.` : ""}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmWorldPackAction
        open={exitPromptOpen}
        title="Discard unsaved changes?"
        message="Return to the World Library and discard this editor draft?"
        cancelLabel="Continue editing"
        confirmLabel="Discard changes"
        tone="danger"
        onConfirm={onReturnToLibrary}
        onCancel={() => setExitPromptOpen(false)}
      />
    </main>
  );
}
