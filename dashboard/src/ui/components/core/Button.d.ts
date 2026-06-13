/** Props for Button */
export interface ButtonProps {
  /** Visual style */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** Size */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Show spinner and disable interaction */
  loading?: boolean;
  /** Disable interaction */
  disabled?: boolean;
  /** Icon placed before label */
  leftIcon?: React.ReactNode;
  /** Icon placed after label */
  rightIcon?: React.ReactNode;
  /** Button label */
  children?: React.ReactNode;
  /** Click handler */
  onClick?: () => void;
  /** HTML button type */
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

/**
 * @startingPoint section="Components" subtitle="Primary, secondary, danger, ghost — all sizes and states" viewport="700x200"
 */
export interface IconButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
  /** Required for accessibility */
  'aria-label': string;
  className?: string;
}

export declare function Button(props: ButtonProps): JSX.Element;
export declare function IconButton(props: IconButtonProps): JSX.Element;
