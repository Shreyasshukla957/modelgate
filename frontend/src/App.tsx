import { useState } from "react";
import { AppShell, ProductHeader } from "./components/AppShell";
import { KeyForm } from "./components/KeyForm";
import { KeyReceipt } from "./components/KeyReceipt";
import { UsageInspector } from "./components/UsageInspector";
import { createVirtualKey, getKeyUsage } from "./lib/api";
import type { KeyUsage, NewKey } from "./types/gateway";

export type WorkspaceState = { adminKey: string; gatewayKey: string; clientName: string; requestLimit: string };

export const App = () => {
  const [workspace, setWorkspace] = useState<WorkspaceState>({ adminKey: "", gatewayKey: "", clientName: "", requestLimit: "100" });
  const [issuedKey, setIssuedKey] = useState<NewKey | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [usage, setUsage] = useState<KeyUsage | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const updateWorkspace = (field: keyof WorkspaceState, value: string) => setWorkspace((current) => ({ ...current, [field]: value }));
  const issueKey = async () => {
    setIsCreating(true); setNotice(""); setIssuedKey(null);
    try { const key = await createVirtualKey({ adminKey: workspace.adminKey, name: workspace.clientName, requestLimit: Number(workspace.requestLimit) }); setIssuedKey(key); setUsage(null); updateWorkspace("gatewayKey", key.key); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not create a virtual key."); }
    finally { setIsCreating(false); }
  };

  const inspectUsage = async () => { setIsLoadingUsage(true); setNotice(""); try { setUsage(await getKeyUsage({ adminKey: workspace.adminKey, gatewayKey: workspace.gatewayKey })); } catch (error) { setUsage(null); setNotice(error instanceof Error ? error.message : "Could not load usage."); } finally { setIsLoadingUsage(false); } };

  return <AppShell><ProductHeader online={null} /><div className="grid min-h-[calc(100vh-72px)] lg:grid-cols-[minmax(0,1fr)_340px]"><section className="px-6 py-10 sm:px-12 sm:py-14"><div className="mx-auto max-w-3xl"><p className="font-mono text-[10px] font-semibold uppercase tracking-[.18em] text-[#78817a]">Virtual key studio</p><h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.06em] text-[#1c251e] sm:text-[54px] sm:leading-[1.04]">One clean boundary between your product and an LLM.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-[#68736a] sm:text-base">ModelGate keeps provider credentials server-side and gives each client a scoped virtual key.</p><KeyForm workspace={workspace} loading={isCreating} onChange={updateWorkspace} onCreate={issueKey} />{issuedKey && <KeyReceipt value={issuedKey.key} warning={issuedKey.warning} />}{notice && <p role="alert" className="mt-6 rounded-xl border border-[#e6b3a8] bg-[#fff0ed] px-4 py-3 text-sm text-[#9a4538]">{notice}</p>}</div></section><UsageInspector workspace={workspace} usage={usage} loading={isLoadingUsage} onChange={updateWorkspace} onInspect={inspectUsage} /></div></AppShell>;
};
