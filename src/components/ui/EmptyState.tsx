interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-growthos-muted text-4xl mb-4">○</div>
      <h3 className="text-growthos-text font-medium text-lg">{title}</h3>
      <p className="text-growthos-muted text-sm mt-1 max-w-md">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
