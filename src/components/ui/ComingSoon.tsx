export default function ComingSoon({
  phase,
  title,
  description,
}: {
  phase: string;
  title: string;
  description: string;
}) {
  return (
    <div className="p-8 bg-growthos-surface border border-growthos-border rounded-xl max-w-xl">
      <span className="inline-block px-2 py-0.5 rounded bg-growthos-accent/10 text-growthos-accent text-xs font-medium mb-4">
        {phase}
      </span>
      <h2 className="text-lg font-semibold text-growthos-text">{title}</h2>
      <p className="text-sm text-growthos-muted mt-2">{description}</p>
    </div>
  );
}
