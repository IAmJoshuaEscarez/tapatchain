import { Mail, MapPin, Phone } from "lucide-react";
import tapatChainLogo from "@/assets/images/tapatchain.png";

interface ContactPageProps {
  setCurrentPage: (page: string) => void;
}

export function ContactPage({ setCurrentPage }: ContactPageProps) {
  return (
    <div className="relative pt-20 sm:pt-24 min-h-screen bg-background overflow-hidden">
      {/* Background mesh orbs */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-150 h-150 rounded-full mesh-glow-primary blur-3xl" />
      <div className="pointer-events-none absolute -top-10 -left-20 w-120 h-120 rounded-full mesh-glow-secondary blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-175 h-175 rounded-full mesh-glow-soft blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 w-100 h-100 rounded-full mesh-glow-base blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 w-70 h-70 rounded-full mesh-glow-soft blur-2xl" />
      <div className="relative z-10" style={{ transform: "scale(0.9)", transformOrigin: "top center" }}>
      {/* Hero */}
      <div className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 pb-12 pt-5 sm:px-8 sm:pb-14 lg:px-10">
          <div className="mx-auto max-w-[92%] text-center sm:max-w-3xl">
            <img src={tapatChainLogo} alt="TapatChain" className="mx-auto mb-4 h-20 w-20 object-contain sm:mb-5" />
            <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary sm:mb-4 sm:text-xs">Contact</p>
            <h1 className="mb-4 text-[1.65rem] font-bold leading-tight tracking-tight text-foreground dark:text-zinc-200 sm:mb-5 sm:text-5xl">Contact Support</h1>
            <p className="mx-auto max-w-[92%] text-[0.95rem] leading-7 text-muted-foreground sm:max-w-2xl sm:text-lg sm:leading-8">
              For account help, project concerns, and general inquiries,
              you can contact us through the channels below.
            </p>
          </div>

          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-3.5 text-center sm:mt-10 sm:grid-cols-3 sm:gap-4 sm:text-left">
            <div className="w-[95%] mx-auto rounded-lg border border-border/70 bg-card/80 px-3.5 py-3 sm:w-full sm:px-4 sm:py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Response Time</p>
              <p className="mt-1.5 text-[0.9rem] font-medium text-foreground">Within 24-48 hours</p>
            </div>
            <div className="w-[95%] mx-auto rounded-lg border border-border/70 bg-card/80 px-3.5 py-3 sm:w-full sm:px-4 sm:py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Office Hours</p>
              <p className="mt-1.5 text-[0.9rem] font-medium text-foreground">Mon-Fri, 9:00 AM - 6:00 PM</p>
            </div>
            <div className="w-[95%] mx-auto rounded-lg border border-border/70 bg-card/80 px-3.5 py-3 sm:w-full sm:px-4 sm:py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Support Scope</p>
              <p className="mt-1.5 text-[0.9rem] font-medium text-foreground">Account, Project, and General Support</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-8 sm:py-16 lg:px-10">
        <div className="mb-8 text-center sm:mb-10 sm:text-left">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.15em] text-primary sm:text-xs">Contact Information</p>
          <h2 className="mt-3 text-[1.4rem] font-bold tracking-tight text-foreground dark:text-zinc-200 sm:text-3xl">Contact Channels</h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3 sm:gap-6">

          <div className="flex h-full w-[95%] mx-auto flex-col gap-5 rounded-xl border border-border/70 bg-card/90 px-5 py-7 text-center sm:w-full sm:px-7 sm:py-9 sm:text-left">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10 sm:mx-0 sm:h-12 sm:w-12">
              <MapPin className="w-5 h-5 text-primary sm:w-6 sm:h-6" />
            </div>
            <div className="space-y-2.5">
              <p className="text-[0.7rem] font-semibold text-primary uppercase tracking-widest sm:text-xs">Office</p>
              <p className="text-[0.95rem] font-semibold text-foreground leading-snug sm:text-base">Mindoro State University</p>
              <p className="text-[0.85rem] text-muted-foreground sm:text-sm">Bongabong Campus</p>
            </div>
          </div>

          <div className="flex h-full w-[95%] mx-auto flex-col gap-5 rounded-xl border border-border/70 bg-card/90 px-5 py-7 text-center sm:w-full sm:px-7 sm:py-9 sm:text-left">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10 sm:mx-0 sm:h-12 sm:w-12">
              <Phone className="w-5 h-5 text-primary sm:w-6 sm:h-6" />
            </div>
            <div className="space-y-2.5">
              <p className="text-[0.7rem] font-semibold text-primary uppercase tracking-widest sm:text-xs">Hotline</p>
              <a
                href="tel:09657731592"
                className="text-[0.95rem] font-semibold text-foreground hover:text-primary transition-colors block sm:text-base"
              >
                09657731592
              </a>
              <p className="text-[0.85rem] text-muted-foreground sm:text-sm">For urgent concerns</p>
            </div>
          </div>

          <div className="flex h-full w-[95%] mx-auto flex-col gap-5 rounded-xl border border-border/70 bg-card/90 px-5 py-7 text-center sm:w-full sm:px-7 sm:py-9 sm:text-left">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10 sm:mx-0 sm:h-12 sm:w-12">
              <Mail className="w-5 h-5 text-primary sm:w-6 sm:h-6" />
            </div>
            <div className="space-y-2.5">
              <p className="text-[0.7rem] font-semibold text-primary uppercase tracking-widest sm:text-xs">Email Support</p>
              <a
                href="mailto:escarezjohnjoshuamanalo@gmail.com"
                className="text-[0.85rem] font-semibold text-foreground hover:text-primary transition-colors break-all block sm:text-sm"
              >
                escarezjohnjoshuamanalo@gmail.com
              </a>
              <p className="text-[0.85rem] text-muted-foreground sm:text-sm">Main email for documents and follow-up</p>
            </div>
          </div>

        </div>

        <div className="mb-6 mt-10 text-center sm:mb-7 sm:mt-14 sm:text-left">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.15em] text-primary sm:text-xs">Request Guide</p>
          <h3 className="mt-2 text-[1.15rem] font-bold tracking-tight text-foreground dark:text-zinc-200 sm:text-2xl">Before Sending a Request</h3>
        </div>

        <div className="mt-7 rounded-xl border border-border/70 bg-card/80 p-5 sm:p-8">
          <div className="grid grid-cols-1 gap-6 text-center md:grid-cols-2 sm:gap-8 sm:text-left">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-primary sm:text-xs">What to Include</p>
              <p className="mt-3 text-[0.9rem] leading-7 text-muted-foreground sm:text-sm sm:leading-7">
                To help us respond faster, include the project name, municipality or barangay, and any transaction reference if available.
              </p>

              <div className="mt-4 space-y-3 text-[0.9rem] text-muted-foreground sm:mt-5 sm:text-sm">
                <p className="text-center sm:text-left">Project status and transparency concerns</p>
                <p className="text-center sm:text-left">Data correction and record updates</p>
                <p className="text-center sm:text-left">Coordination requests</p>
              </div>
            </div>

            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-primary sm:text-xs">Email Contacts</p>
              <div className="mt-3 space-y-3 text-[0.9rem] leading-7 text-muted-foreground sm:space-y-3 sm:text-sm sm:leading-7">
                <p>
                  General support: <a href="mailto:support@tapatchain.ph" className="font-medium text-foreground hover:text-primary">support@tapatchain.ph</a>
                </p>
                <p>
                  Security-related reports: <a href="mailto:security@tapatchain.ph" className="font-medium text-foreground hover:text-primary">security@tapatchain.ph</a>
                </p>
                <p className="text-muted-foreground text-center sm:text-left">
                  Status updates are sent in the same email thread for easier tracking.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 text-center">
          <button
            onClick={() => setCurrentPage("ledger")}
            className="text-sm font-medium text-primary underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Check public transactions before sending a request
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
