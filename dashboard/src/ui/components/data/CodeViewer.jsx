import React from 'react';
/**
 * CodeViewer — syntax-aware JSON/code display with copy action.
 *
 * Renders pretty-printed JSON with key/string/number/boolean color coding.
 * Used for: tool-call args/results, output envelope, binding values.
 *
 * @example
 * <CodeViewer value={{ tenant: 'papaya', id: 'e1', name: 'Maya Cohen' }} />
 * <CodeViewer value={rawText} language="text" maxHeight={200} />
 */
export function CodeViewer({ value, language = 'json', maxHeight, label, className = '' }) {
  const [copied, setCopied] = React.useState(false);

  const formatted = React.useMemo(() => {
    if (language !== 'json') return String(value ?? '');
    try {
      return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 2);
    } catch {
      return String(value ?? '');
    }
  }, [value, language]);

  function colorizeJson(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"([^"]+)"(\s*:)/g, '<span style="color:var(--blue-600)">\"$1\"</span>$2')
      .replace(/:\s*"([^"]*)"/g, ': <span style="color:var(--green-700)">\"$1\"</span>')
      .replace(/:\s*(true|false)/g, ': <span style="color:var(--amber-600)">$1</span>')
      .replace(/:\s*(null)/g, ': <span style="color:var(--neutral-400)">$1</span>')
      .replace(/:\s*(-?\d+\.?\d*)/g, ': <span style="color:var(--papaya-600)">$1</span>');
  }

  async function copy() {
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className={`rounded-lg border border-[--border-default] overflow-hidden ${className}`}>
      {label && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-[--surface-sunken] border-b border-[--border-default]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">{label}</span>
          <button
            onClick={copy}
            aria-label={copied ? 'Copied' : 'Copy to clipboard'}
            className="text-[11px] font-medium text-[--text-tertiary] hover:text-[--text-secondary] transition-colors"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      )}
      <div
        className="relative group"
        style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
      >
        {!label && (
          <button
            onClick={copy}
            aria-label={copied ? 'Copied' : 'Copy'}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-medium text-[--text-tertiary] hover:text-[--text-secondary] bg-[--surface-sunken] rounded px-1.5 py-0.5 border border-[--border-default]"
          >
            {copied ? '✓' : 'Copy'}
          </button>
        )}
        <pre
          className="p-3 text-[12px] leading-relaxed font-mono overflow-x-auto text-[--text-primary] bg-[--surface-sunken] m-0"
          dangerouslySetInnerHTML={language === 'json' ? { __html: colorizeJson(formatted) } : undefined}
        >
          {language !== 'json' ? formatted : null}
        </pre>
      </div>
    </div>
  );
}
