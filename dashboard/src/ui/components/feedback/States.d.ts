export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export interface LoadingStateProps {
  type?: 'skeleton' | 'spinner';
  rows?: number;
  message?: string;
  className?: string;
}

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export interface StreamingStateProps {
  label?: string;
  /** Current step/tool being executed */
  step?: string;
  className?: string;
}

export declare function EmptyState(props: EmptyStateProps): JSX.Element;
export declare function LoadingState(props: LoadingStateProps): JSX.Element;
export declare function ErrorState(props: ErrorStateProps): JSX.Element;
export declare function StreamingState(props: StreamingStateProps): JSX.Element;
