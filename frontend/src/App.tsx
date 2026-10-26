import { AppShell, ProductHeader } from "./components/AppShell";

export const App = () => {
  return <AppShell><ProductHeader online={null} /><section className="px-6 py-10 sm:px-12 sm:py-14"><div className="mx-auto max-w-3xl"><p className="font-mono text-[10px] font-semibold uppercase tracking-[.18em] text-[#78817a]">Virtual key studio</p><h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.06em] text-[#1c251e] sm:text-[54px] sm:leading-[1.04]">One clean boundary between your product and an LLM.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-[#68736a] sm:text-base">ModelGate keeps provider credentials server-side and gives each client a scoped virtual key.</p></div></section></AppShell>;
};
