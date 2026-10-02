export default function MerchantSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-growthos-text">Settings</h1>
        <p className="text-growthos-muted text-sm mt-1">Configure your GrowthOS account</p>
      </div>

      <div className="p-6 bg-growthos-surface border border-growthos-border rounded-xl">
        <h2 className="font-semibold text-growthos-text mb-4">Account Information</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-growthos-border/50">
            <span className="text-growthos-muted">Role</span>
            <span className="text-growthos-text">Merchant</span>
          </div>
          <div className="flex justify-between py-2 border-b border-growthos-border/50">
            <span className="text-growthos-muted">Currency</span>
            <span className="text-growthos-text">INR</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-growthos-muted">Timezone</span>
            <span className="text-growthos-text">Asia/Kolkata</span>
          </div>
        </div>
      </div>

      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-400">
        Razorpay integration, webhook configuration, and advanced settings will be available in Phase 5.
      </div>
    </div>
  );
}
