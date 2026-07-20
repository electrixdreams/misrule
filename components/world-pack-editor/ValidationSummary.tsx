import type { EditorValidationIssue } from "@/lib/world-pack-draft.client";

const SECTION_LABELS: Record<EditorValidationIssue["section"], string> = {
  pack: "Pack",
  world: "World",
  books: "Books",
  rules: "Rules",
  spans: "Evidence spans",
};

export function ValidationSummary({ issues, validated }: { issues: EditorValidationIssue[]; validated: boolean }) {
  if (!validated) return null;

  if (issues.length === 0) {
    return <p className="editor-valid" role="status">No validation problems found.</p>;
  }

  return (
    <section className="validation-summary" aria-labelledby="validation-summary-title">
      <h2 id="validation-summary-title">{issues.length} validation problem{issues.length === 1 ? "" : "s"}</h2>
      <ul>
        {issues.map((issue, index) => (
          <li key={`${issue.path}-${index}`}>
            <button
              type="button"
              onClick={() => {
                const target = document.getElementById(`editor-section-${issue.section}`);
                target?.scrollIntoView({ block: "start" });
                target?.focus();
              }}
            >
              <span>{SECTION_LABELS[issue.section]}</span>
              <strong>{issue.itemId ? `${issue.itemId}: ` : ""}{issue.path}</strong>
              <em>{issue.message}</em>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
