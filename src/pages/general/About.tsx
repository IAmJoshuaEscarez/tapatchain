import { Button } from "@/components/ui";
import tapatChainLogo from "@/assets/images/tapatchain.png";

interface AboutPageProps {
  setCurrentPage: (page: string) => void;
}

const pillars = [
  { title: "Transparency", description: "Every peso allocated and spent is recorded immutably on-chain, visible to every Filipino with no login required." },
  { title: "Accountability", description: "Smart contracts enforce milestone-based fund release. No verified progress means no disbursement." },
  { title: "Accessibility", description: "Any citizen can search, track, and audit government infrastructure projects without technical knowledge." },
  { title: "Data Integrity", description: "Geotagged evidence and cryptographic hashes make project milestone records tamper-evident." },
];

export function AboutPage({ setCurrentPage }: AboutPageProps) {
  return (
    <div className="relative pt-20 sm:pt-24 min-h-screen bg-background overflow-hidden">
      {/* Background mesh orbs */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-[600px] h-[600px] rounded-full mesh-glow-primary blur-3xl" />
      <div className="pointer-events-none absolute -top-10 -left-20 w-[480px] h-[480px] rounded-full mesh-glow-secondary blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full mesh-glow-soft blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 w-[400px] h-[400px] rounded-full mesh-glow-base blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 w-[280px] h-[280px] rounded-full mesh-glow-soft blur-2xl" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-14 pt-5 sm:px-8 sm:pb-20 lg:px-10" style={{ transform: "scale(0.9)", transformOrigin: "top center" }}>

        {/* Hero */}
        <div className="mx-auto mb-10 flex max-w-[92%] flex-col items-center gap-3 text-center sm:mb-14 sm:gap-4 sm:max-w-3xl">
          <img src={tapatChainLogo} alt="TapatChain" className="mb-2 h-20 w-20 object-contain sm:mb-3" />
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-primary sm:text-xs">About</p>
          <h1 className="text-[1.55rem] font-bold tracking-tight text-foreground dark:text-zinc-200 sm:text-4xl">About the Platform</h1>
          <p className="mt-3 max-w-[97%] text-[0.95rem] leading-7 text-muted-foreground sm:max-w-176 sm:text-lg sm:leading-8">
            TapatChain is a blockchain-based transparency platform for Philippine government infrastructure.
            It supports visibility across funding, implementation milestones, and audit documentation.
          </p>
        </div>

        {/* Core Principles */}
        <div className="mx-auto mb-7 max-w-[92%] text-center sm:mb-9 sm:max-w-3xl">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary sm:text-xs">Platform Principles</p>
          <p className="mt-3 text-[0.9rem] leading-7 text-muted-foreground sm:text-base sm:leading-8">
            The principles below define how project spending and progress are presented for public review.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          {pillars.map(({ title, description }) => (
            <div key={title} className="h-full w-[95%] mx-auto rounded-xl border border-border/70 bg-card/90 px-5 py-5 text-left sm:w-full sm:px-7 sm:py-7">
              <p className="mb-3 text-[0.95rem] font-bold tracking-tight text-foreground dark:text-zinc-200 sm:text-xl">{title}</p>
              <p className="text-[0.9rem] leading-7 text-muted-foreground sm:text-base sm:leading-8">{description}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:mt-14 sm:flex-row sm:gap-4">
          <Button className="w-[95%] rounded-lg text-sm font-semibold sm:w-auto" onClick={() => setCurrentPage("ledger")}>
            View Public Ledger
          </Button>
          <Button
            variant="outline"
            className="w-[95%] rounded-lg text-sm font-medium border-primary/30 hover:border-primary hover:bg-primary/10 sm:w-auto"
            onClick={() => setCurrentPage("developers")}
          >
            Meet the Team
          </Button>
        </div>

      </div>
    </div>
  );
}
