import type { ReactNode } from "react";

export const AppShell = ({ children }: { children: ReactNode }) => {
  return (
    <main className="min-h-screen bg-[#e9ece8] p-3 text-[#1d2520] sm:p-5">
      <div className="mx-auto min-h-[calc(100vh-1.5rem)] max-w-[1440px] overflow-hidden rounded-[30px] border border-black/10 bg-[#fafbf9] shadow-[0_28px_80px_rgba(29,37,32,0.13)] sm:min-h-[calc(100vh-2.5rem)]">
        {children}
      </div>
    </main>
  );
};

export const ProductHeader = ({ online }: { online: boolean | null }) => {
  return (
    <header className="flex h-[72px] items-center justify-between border-b border-black/8 px-5 sm:px-8">
      <div className="flex items-center gap-x-3">
        <span className="grid size-8 place-items-center rounded-lg bg-[#dd6845] text-sm font-black text-white">M</span>
        <div><p className="text-sm font-semibold tracking-[-0.03em]">modelgate</p><p className="text-[11px] text-[#778079]">LLM access control</p></div>
      </div>
      <div className="flex items-center gap-x-2"><span className={`size-2 rounded-full ${online === true ? "bg-[#72a047]" : online === false ? "bg-[#d56845]" : "bg-[#c6cec7]"}`} /><span className="font-mono text-[10px] font-medium uppercase tracking-[.13em] text-[#6e7770]">{online === true ? "Gateway online" : online === false ? "Gateway unavailable" : "Checking gateway"}</span></div>
    </header>
  );
};
