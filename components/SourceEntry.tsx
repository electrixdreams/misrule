import type { NarrativeSpan, WorldRule } from "@/lib/contracts";

type Props =
  | { kind: "rule"; item: WorldRule; selected: boolean }
  | { kind: "span"; item: NarrativeSpan; selected: boolean };

export function SourceEntry(props: Props) {
  if (props.kind === "rule") {
    const { item } = props;
    return (
      <li className="source-entry" data-selected={props.selected || undefined} id={item.ruleId} tabIndex={props.selected ? -1 : undefined}>
        <div className="source-meta">
          <strong>{item.ruleId}</strong>
          <span>{item.type}</span>
        </div>
        <div className="source-copy">
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </div>
      </li>
    );
  }

  const { item } = props;
  return (
    <li className="source-entry source-entry--span" data-selected={props.selected || undefined} id={item.spanId} tabIndex={props.selected ? -1 : undefined}>
      <div className="source-meta">
        <strong>{item.spanId}</strong>
        <span>{item.source.label}</span>
        <small>{item.source.scene}</small>
      </div>
      <div className="source-copy">
        <p>{item.text}</p>
      </div>
    </li>
  );
}
