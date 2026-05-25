import tapatChainLogo from "@/assets/images/tapatchain.png";

interface PrivacyPolicyPageProps {
  setCurrentPage: (page: string) => void;
}

const privacySections = [
  {
    title: "Information We Collect",
    body: "We collect account, usage, and transaction metadata required to operate project tracking, audit visibility, and platform security. No private wallet keys are stored by TapatChain.",
  },
  {
    title: "How Data Is Used",
    body: "Collected data is used to provide navigation, role-based access, audit workflows, and public transparency features. We use this data to improve reliability and prevent misuse.",
  },
  {
    title: "Data Sharing",
    body: "Public project and audit records are intentionally visible as part of transparency goals. Sensitive operational data is only shared with authorized administrators and service providers under strict controls.",
  },
  {
    title: "Security and Retention",
    body: "We apply technical and organizational safeguards to protect stored information and retain records according to legal, audit, and operational requirements.",
  },
  {
    title: "Your Rights",
    body: "You may request data access, correction, or account-related assistance by contacting support. Requests are reviewed in accordance with applicable Philippine data privacy obligations.",
  },
];

export function PrivacyPolicyPage({ setCurrentPage }: PrivacyPolicyPageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background pt-24">
      <div className="pointer-events-none absolute -top-16 -right-16 h-130 w-130 rounded-full mesh-glow-primary blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-12 h-105 w-105 rounded-full mesh-glow-secondary blur-3xl" />

      <div className="relative z-10 mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col items-center text-center sm:mb-10">
          <img src={tapatChainLogo} alt="TapatChain" className="mb-4 h-16 w-16 object-contain" />
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Legal</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Privacy Policy</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            This policy explains how TapatChain Philippines collects, uses, protects, and discloses information for platform operations.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Last updated: March 21, 2026</p>
        </div>

        <div className="space-y-4">
          {privacySections.map((section) => (
            <section key={section.title} className="rounded-xl border border-border/70 bg-card/90 px-5 py-5 sm:px-6 sm:py-6">
              <h2 className="text-base font-semibold text-foreground sm:text-lg">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground sm:text-[15px]">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setCurrentPage("terms")}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-primary/30 px-5 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/10"
          >
            View Terms of Use
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
