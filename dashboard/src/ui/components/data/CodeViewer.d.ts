export interface CodeViewerProps {
  /** Value to display — object is JSON.stringify'd, string is shown as-is */
  value: unknown;
  language?: 'json' | 'text';
  maxHeight?: number;
  label?: string;
  className?: string;
}

export declare function CodeViewer(props: CodeViewerProps): JSX.Element;
