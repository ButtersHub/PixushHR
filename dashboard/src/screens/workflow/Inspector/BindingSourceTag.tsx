import type { Binding } from "../types";

interface Props {
  binding?: Binding;
}

/** A small color-coded tag rendered next to a schema-tree leaf in the Inspector,
 *  showing where the input value comes from: literal / ref / agent.
 *  Falls back to "unset" when no binding is wired. */
export function BindingSourceTag({ binding }: Props) {
  if (!binding) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[--surface-sunken] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[--text-tertiary] ring-1 ring-[--border-default]">
        unset
      </span>
    );
  }

  const { kind } = binding;
  const tagLabel = kind;
  const valuePreview =
    binding.kind === "literal" ? JSON.stringify(binding.value)
    : binding.kind === "ref"   ? binding.from
                               : "composed by LLM";

  const cls =
    kind === "literal" ? "bg-[--surface-sunken] text-[--text-secondary] ring-[--border-default]"
    : kind === "ref"   ? "bg-[--green-50] text-[--green-700] ring-[--green-200]"
                       : "bg-[--papaya-50] text-[--papaya-600] ring-[--papaya-200]";

  return (
    <span className={`inline-flex max-w-[200px] items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${cls}`}>
      <span className="uppercase tracking-wide">{tagLabel}</span>
      <span className="truncate font-mono text-[10px] opacity-80">{valuePreview}</span>
    </span>
  );
}
