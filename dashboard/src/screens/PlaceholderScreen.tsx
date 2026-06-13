import { EmptyState } from '../ui/index';

interface PlaceholderScreenProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}

export function PlaceholderScreen({ icon, title, description }: PlaceholderScreenProps) {
  return (
    <div className="flex items-center justify-center h-full min-h-[320px]">
      <EmptyState
        icon={icon}
        title={title}
        description={description ?? 'Not implemented yet — coming in a later iteration.'}
      />
    </div>
  );
}
