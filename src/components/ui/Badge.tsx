interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "pending";
  size?: "sm" | "md";
}

const variantStyles: Record<string, string> = {
  default: "bg-white/5 text-growthos-text border-growthos-border",
  success: "bg-green-500/10 text-green-400 border-green-500/20",
  warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  danger: "bg-red-500/10 text-red-400 border-red-500/20",
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  pending: "bg-growthos-accent/10 text-growthos-accent border-growthos-accent/20",
};

export function Badge({ children, variant = "default", size = "sm" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center border rounded-full font-medium ${variantStyles[variant]} ${size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"}`}>
      {children}
    </span>
  );
}

export function getStatusBadge(status: string) {
  const s = status.toUpperCase();
  if (s === "SUCCEEDED" || s === "COMPLETED" || s === "APPROVED" || s === "ACTIVE" || s === "SECURE" || s === "ALLOWED") {
    return <Badge variant="success">{status}</Badge>;
  }
  if (s === "FAILED" || s === "BLOCKED" || s === "REJECTED" || s === "CANCELLED" || s === "BLOCKED") {
    return <Badge variant="danger">{status}</Badge>;
  }
  if (s === "PENDING" || s === "WAITING" || s === "QUEUED" || s === "CREATED" || s === "RUNNING" || s === "EXECUTING") {
    return <Badge variant="pending">{status}</Badge>;
  }
  if (s === "UNKNOWN" || s === "RETRYING") {
    return <Badge variant="warning">{status}</Badge>;
  }
  return <Badge variant="default">{status}</Badge>;
}
