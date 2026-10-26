import { useState } from "react";
import { AppShell, ProductHeader } from "./components/AppShell";
import { KeyForm } from "./components/KeyForm";
import { KeyReceipt } from "./components/KeyReceipt";
import type { NewKey } from "./types/gateway";

export type WorkspaceState = { adminKey: string; gatewayKey: string; clientName: string; requestLimit: string };

export const App = () => {
  const [workspace, setWorkspace] = useState<WorkspaceState>({ adminKey: "", gatewayKey: "", clientName: "", requestLimit: "100" });
  const [issuedKey, setIssuedKey] = useState<NewKey | null>(null);
  const updateWorkspace = (field: keyof WorkspaceState, value: string) => setWorkspace((current) => ({ ...current, [field]: value }));
  const previewKey = async () => { const key = `rk_preview_${Math.random().toString(36).slice(2, 12)}`; setIssuedKey({ key, name: workspace.clientName, requestLimit: Number(workspace.requestLimit), active: true, warning: "This preview will be replaced by a live gateway key in the next commit." }); updateWorkspace("gatewayKey", key); };

  return <AppShell><ProductHeader online={null} /><section className="px-6 py-10 sm:px-12 sm:py-14"><div className="mx-auto max-w-3xl"><p className="font-mono text-[10px] font-semibold uppercase tracking-[.18em] text-[#78817a]">Virtual key studio</p><h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.06em] text-[#1c251e] sm:text-[54px] sm:leading-[1.04]">One clean boundary between your product and an LLM.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-[#68736a] sm:text-base">ModelGate keeps provider credentials server-side and gives each client a scoped virtual key.</p><KeyForm workspace={workspace} loading={false} onChange={updateWorkspace} onCreate={previewKey} />{issuedKey && <KeyReceipt value={issuedKey.key} warning={issuedKey.warning} />}</div></section></AppShell>;
};
