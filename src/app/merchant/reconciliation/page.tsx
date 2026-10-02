import ComingSoon from "@/components/ui/ComingSoon";

export default function MerchantReconciliationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Reconciliation</h1>
        <p className="text-growthos-muted text-sm mt-1">Payment reconciliation</p>
      </div>
      <ComingSoon
        phase="Phase 4+"
        title="Reconciliation Engine"
        description="Automated reconciliation between orders, payments, and bank settlements. This arrives in a later phase."
      />
    </div>
  );
}
