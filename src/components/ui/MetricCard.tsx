interface MetricCardProps {
  label: string;
  value: string;
  comparison?: number;
  trend?: "UP" | "DOWN" | "FLAT";
  source?: "REAL" | "INSUFFICIENT_DATA";
  compact?: boolean;
}

export function MetricCard({ label, value, comparison, trend, source, compact }: MetricCardProps) {
  const trendColor = trend === "UP" ? "text-green-400" : trend === "DOWN" ? "text-red-400" : "text-growthos-muted";
  const trendIcon = trend === "UP" ? "↑" : trend === "DOWN" ? "↓" : "—";

  return (
    <div className={`bg-growthos-surface border border-growthos-border rounded-xl ${compact ? "p-3" : "p-5"}`}>
      <div className="text-growthos-muted text-xs uppercase tracking-wider">{label}</div>
      <div className={`font-bold text-growthos-text ${compact ? "text-lg mt-1" : "text-2xl mt-2"}`}>{value}</div>
      {comparison !== undefined && (
        <div className={`text-xs mt-1 ${trendColor}`}>
          {trendIcon} {comparison >= 0 ? "+" : ""}{comparison.toFixed(1)}%
          <span className="text-growthos-muted ml-1">vs prev 30d</span>
        </div>
      )}
      {source === "INSUFFICIENT_DATA" && (
        <div className="text-xs text-growthos-muted mt-1 italic">Not enough data</div>
      )}
    </div>
  );
}
