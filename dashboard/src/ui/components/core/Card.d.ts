export interface CardProps {
  children?: React.ReactNode;
  /** Include default padding */
  padding?: boolean;
  className?: string;
}

export interface CardHeaderProps {
  title: string;
  subtitle?: string;
  /** Element slotted to the right (e.g. a Button) */
  action?: React.ReactNode;
  className?: string;
}

export interface CardBodyProps {
  children?: React.ReactNode;
  className?: string;
}

export interface KeyValueRowProps {
  label: string;
  value: React.ReactNode;
  /** Render value in monospace */
  mono?: boolean;
  className?: string;
}

export interface KeyValueListProps {
  rows: KeyValueRowProps[];
  className?: string;
}

export declare function Card(props: CardProps): JSX.Element;
export declare function CardHeader(props: CardHeaderProps): JSX.Element;
export declare function CardBody(props: CardBodyProps): JSX.Element;
export declare function CardDivider(): JSX.Element;
export declare function KeyValueRow(props: KeyValueRowProps): JSX.Element;
export declare function KeyValueList(props: KeyValueListProps): JSX.Element;
