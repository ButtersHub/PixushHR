export interface FlowNodeProps {
  /** Node variant determines color and icon */
  variant?: 'trigger' | 'action' | 'condition' | 'escalate';
  /** Node title / capability name */
  title: string;
  /** Sub-label (e.g. tool name, source system) */
  subtitle?: string;
  /** Highlighted / selected state */
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export interface BranchConnectorProps {
  /** Optional label (e.g. "THEN" / "ELSE") */
  label?: string;
  variant?: 'default' | 'then' | 'else';
}

/**
 * @startingPoint section="Domain" subtitle="Trigger, action, condition, escalate flow nodes" viewport="700x300"
 */
export interface BindingPillProps {
  variant: 'literal' | 'data-ref' | 'agent';
  /** The bound value or reference path */
  value: string;
  /** Optional field name for accessibility */
  field?: string;
  className?: string;
}

export declare function FlowNode(props: FlowNodeProps): JSX.Element;
export declare function BranchConnector(props: BranchConnectorProps): JSX.Element;
export declare function BindingPill(props: BindingPillProps): JSX.Element;
