import ComingSoon from "@/components/ui/ComingSoon";

export default function MerchantSecurityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Security</h1>
        <p className="text-growthos-muted text-sm mt-1">Security and reliability events</p>
      </div>
      <ComingSoon
        phase="Phase 3+"
        title="Security Center"
        description="Monitor AI security events, reliability incidents, and advanced protection controls. These features arrive in later phases."
      />
    </div>
  );
}
