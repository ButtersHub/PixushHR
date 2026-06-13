/** Badge component props */
export interface BadgeProps {
  /** Semantic color variant */
  variant?: 'neutral' | 'success' | 'info' | 'warning' | 'danger' | 'accent' | 'mock' | 'real' | 'off';
  /** Size */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Show a colored dot before the label */
  dot?: boolean;
  /** Full-radius pill shape instead of rectangle */
  pill?: boolean;
  children?: React.ReactNode;
  className?: string;
}

/** StatusDot component props */
export interface StatusDotProps {
  /** Integration mode: mock / real / off */
  mode?: 'mock' | 'real' | 'off';
  /** Health status: ok / warn / down */
  health?: 'ok' | 'warn' | 'down';
  /** Accessible label text (e.g. connector name) */
  label?: string;
  /** Dot size */
  size?: 'sm' | 'md' | 'lg';
  /** Show the text label next to dot */
  showLabel?: boolean;
}

export declare function Badge(props: BadgeProps): JSX.Element;
export declare function StatusDot(props: StatusDotProps): JSX.Element;
