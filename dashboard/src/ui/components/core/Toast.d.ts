export interface ToastProps {
  type?: 'success' | 'error' | 'warning' | 'info';
  message: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}

export interface ToastItem extends ToastProps {
  id: string;
}

export interface ToastContainerProps {
  toasts?: ToastItem[];
  onDismiss: (id: string) => void;
}

export declare function Toast(props: ToastProps): JSX.Element;
export declare function ToastContainer(props: ToastContainerProps): JSX.Element;
