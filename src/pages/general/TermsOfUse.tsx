import tapatChainLogo from "@/assets/images/tapatchain.png";

interface TermsOfUsePageProps {
  setCurrentPage: (page: string) => void;
}

const termSections = [
  {
    title: "Acceptance of Terms",
    body: "By using TapatChain Philippines, you agree to these terms and all applicable laws, regulations, and platform policies.",
  },
  {
    title: "Permitted Use",
    body: "The platform is intended for lawful project tracking, transparency review, and audit participation. Misuse, tampering attempts, or unauthorized access are prohibited.",
  },
  {
    title: "Data and Public Records",
    body: "Project and audit data presented on the platform may include public-interest records for transparency purposes. Users must not misrepresent, alter, or republish data in deceptive contexts.",
  },
  {
    title: "System Availability",
    body: "We aim for continuous service availability but do not guarantee uninterrupted access. Maintenance, upgrades, and external infrastructure issues may affect uptime.",
  },
  {
    title: "Liability and Changes",
    body: "TapatChain Philippines may update these terms as the platform evolves. Continued use after updates signifies acceptance of revised terms.",
  },
];

export function TermsOfUsePage({ setCurrentPage }: TermsOfUsePageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background pt-24">
      <div className="pointer-events-none absolute -top-16 -right-16 h-130 w-130 rounded-full mesh-glow-primary blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-12 h-105 w-105 rounded-full mesh-glow-secondary blur-3xl" />

      <div className="relative z-10 mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col items-center text-center sm:mb-10">
          <img src={tapatChainLogo} alt="TapatChain" className="mb-4 h-16 w-16 object-contain" />
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Legal</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Terms of Use</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            These terms govern access to and use of TapatChain Philippines services, interfaces, and transparency records.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Last updated: March 21, 2026</p>
        </div>

        <div className="space-y-4">
          {termSections.map((section) => (
            <section key={section.title} className="rounded-xl border border-border/70 bg-card/90 px-5 py-5 sm:px-6 sm:py-6">
              <h2 className="text-base font-semibold text-foreground sm:text-lg">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground sm:text-[15px]">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setCurrentPage("privacy")}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-primary/30 px-5 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/10"
          >
            View Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage("home")}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
