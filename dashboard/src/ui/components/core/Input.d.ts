export interface InputProps {
  type?: 'text' | 'number' | 'email' | 'password' | 'search' | 'url';
  label?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  placeholder?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  className?: string;
}

export interface TextareaProps {
  label?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  id?: string;
  className?: string;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  label?: string;
  hint?: string;
  error?: string;
  options?: SelectOption[];
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  id?: string;
  className?: string;
}

export interface ToggleProps {
  checked?: boolean;
  onChange?: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export declare function Input(props: InputProps): JSX.Element;
export declare function Textarea(props: TextareaProps): JSX.Element;
export declare function Select(props: SelectProps): JSX.Element;
export declare function Toggle(props: ToggleProps): JSX.Element;
