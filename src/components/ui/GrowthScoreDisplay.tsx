interface GrowthScoreDisplayProps {
  score: number;
  level: string;
  compact?: boolean;
}

const levelColors: Record<string, string> = {
  EXCELLENT: "#22c55e",
  HEALTHY: "#22c55e",
  WATCH: "#eab308",
  AT_RISK: "#f97316",
  CRITICAL: "#ef4444",
};

const levelBg: Record<string, string> = {
  EXCELLENT: "bg-green-500/10 border-green-500/20",
  HEALTHY: "bg-green-500/10 border-green-500/20",
  WATCH: "bg-yellow-500/10 border-yellow-500/20",
  AT_RISK: "bg-orange-500/10 border-orange-500/20",
  CRITICAL: "bg-red-500/10 border-red-500/20",
};

export function GrowthScoreDisplay({ score, level, compact }: GrowthScoreDisplayProps) {
  const color = levelColors[level] || "#6b7280";
  const bg = levelBg[level] || "bg-growthos-surface border-growthos-border";

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${bg}`}>
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-growthos-muted">{level}</span>
      </div>
    );
  }

  return (
    <div className={`p-5 rounded-xl border ${bg}`}>
      <div className="text-growthos-muted text-xs uppercase tracking-wider">Growth Score</div>
      <div className="flex items-baseline gap-3 mt-2">
        <span className="text-4xl font-bold" style={{ color }}>{score}</span>
        <span className="text-sm font-medium" style={{ color }}>{level}</span>
      </div>
    </div>
  );
}
