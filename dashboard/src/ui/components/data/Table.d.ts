export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  mono?: boolean;
  muted?: boolean;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

export interface TableProps {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  loading?: boolean;
  empty?: React.ReactNode;
  className?: string;
}

export interface TableFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  count?: number;
  actions?: React.ReactNode;
}

export declare function Table(props: TableProps): JSX.Element;
export declare function TableFilter(props: TableFilterProps): JSX.Element;
