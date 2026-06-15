import type { SchemaNode, Binding } from "../types";
import { BindingSourceTag } from "./BindingSourceTag";

interface Props {
  node: SchemaNode;
  /** When rendering inputs, pass the bindings keyed by field name. Each leaf gets a source tag. */
  bindings?: Record<string, Binding>;
}

/** Recursive renderer for the engine's SchemaNode tree. Used by both the workflow editor
 *  Inspector (Inputs + Output) and the Integrations side panel. */
export function SchemaTree({ node, bindings }: Props) {
  if (node.kind !== "object") {
    return (
      <p className="font-mono text-[11px] text-[--text-tertiary]">
        {typeLabel(node)}
      </p>
    );
  }

  const entries = Object.entries(node.fields);
  if (entries.length === 0) {
    return <p className="font-mono text-[11px] text-[--text-tertiary]">{`{}`}</p>;
  }

  return (
    <ul className="space-y-1">
      {entries.map(([k, child]) => (
        <li key={k} className="flex items-start justify-between gap-2 leading-snug">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="font-mono text-[12px] text-[--text-primary]">{k}</span>
            {child.required && <span className="text-[10px] text-[--red-600]">*</span>}
            <span className="truncate font-mono text-[10.5px] text-[--text-tertiary]">: {typeLabel(child)}</span>
          </div>
          {bindings && <BindingSourceTag binding={bindings[k]} />}
        </li>
      ))}
    </ul>
  );
}

function typeLabel(n: SchemaNode): string {
  switch (n.kind) {
    case "object":  return "object";
    case "string":
    case "number":
    case "boolean": return n.kind;
    case "array":   return `array<${typeLabel(n.items)}>`;
    case "literal": return JSON.stringify(n.value);
    case "union":   return n.options.map(typeLabel).join(" | ");
    case "unknown": return "unknown";
  }
}
