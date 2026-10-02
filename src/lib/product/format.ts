export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Format paise as rupees with 2 decimal places (canonical formatMoney) */
export function formatMoney(paise: number): string {
  const rupees = paise / 100;
  const formatted = rupees.toFixed(2);
  let result = formatted;
  for (let i = 3; i < result.length; i += 4) {
    result = result.slice(0, result.length - i) + "," + result.slice(result.length - i);
  }
  return "₹" + result;
}

export function formatINRLarge(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) {
    return `₹${(rupees / 100000).toFixed(2)}L`;
  }
  if (rupees >= 1000) {
    return `₹${(rupees / 1000).toFixed(1)}K`;
  }
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/**
 * Confidence is stored and written as an integer percentage (0-100) by the
 * schema and every producer (seed, agents, intelligence modules).
 * Do NOT multiply by 100 here — that renders a stored 84 as "8400%".
 */
export function toConfidencePercent(confidence: number): number {
  return Math.round(clamp(confidence, 0, 100));
}

export function formatConfidencePercent(confidence: number): string {
  return `${toConfidencePercent(confidence)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-IN");
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
