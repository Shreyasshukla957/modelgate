import type { WorkspaceState } from "../App";

export const KeyForm = ({ workspace, loading, onChange, onCreate }: { workspace: WorkspaceState; loading: boolean; onChange: (field: keyof WorkspaceState, value: string) => void; onCreate: () => Promise<void> }) => {
  const requestLimit = Number(workspace.requestLimit);
  const canCreate = Boolean(workspace.adminKey && workspace.clientName && Number.isInteger(requestLimit) && requestLimit > 0 && requestLimit <= 1_000_000);

  return (
    <section className="mt-10">
      <div className="flex items-end justify-between gap-5 border-b border-black/8 pb-4"><div><p className="font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#79817b]">01 / Issue access</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">Create a virtual key</h2></div><p className="hidden max-w-[190px] text-right text-xs leading-5 text-[#7e8780] sm:block">Scope every key to one environment or client.</p></div>
      <div className="mt-1 divide-y divide-black/8">
        <FormRow label="Admin secret" hint="Used only for this request"><input value={workspace.adminKey} onChange={(event) => onChange("adminKey", event.target.value)} type="password" placeholder="Enter the admin secret" /></FormRow>
        <FormRow label="Application label" hint="Appears in usage records"><input value={workspace.clientName} onChange={(event) => onChange("clientName", event.target.value)} placeholder="e.g. mailrise-staging" /></FormRow>
        <FormRow label="Request allowance" hint="Hard budget, 1 to 1,000,000"><input value={workspace.requestLimit} onChange={(event) => onChange("requestLimit", event.target.value)} type="number" min="1" max="1000000" step="1" /></FormRow>
      </div>
      <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><p className="max-w-sm text-xs leading-5 text-[#7a837c]">The plaintext value is displayed once. ModelGate stores only an HMAC hash and cannot recover it later.</p><button type="button" disabled={loading || !canCreate} onClick={() => void onCreate()} className="group inline-flex items-center justify-center gap-x-3 rounded-xl bg-[#1d2520] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#38453b] disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Issuing key..." : "Issue virtual key"}<span className="transition-transform group-hover:translate-x-1">→</span></button></div>
    </section>
  );
};

const FormRow = ({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) => {
  return <label className="grid gap-2 py-5 sm:grid-cols-[168px_minmax(0,1fr)] sm:items-center sm:gap-7"><span><span className="block text-sm font-medium text-[#303a32]">{label}</span><span className="mt-1 block text-[11px] text-[#89928b]">{hint}</span></span>{children}</label>;
};
