import tapatChainLogo from "@/assets/images/tapatchain.png";

interface FooterProps {
  setCurrentPage: (page: string) => void;
}

const quickLinks = [
  { label: "Home", page: "home" },
  { label: "Verified Ledger", page: "ledger" },
  { label: "Project Roadmap", page: "developers" },
];

const legalLinks = [
  { label: "Privacy Policy", page: "privacy" },
  { label: "Terms of Use", page: "terms" },
];

const developerLinks = [
  { label: "Documentation", href: "#" },
  { label: "GitHub", href: "#" },
];

export function Footer({ setCurrentPage }: FooterProps) {
  return (
    <footer className="border-t border-border bg-background px-6 py-10 sm:px-8 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        
        {/* Main Footer Container */}
        {/* Mobile: space-y-12 for breathing room | Desktop: sm:space-y-0 to use grid gap */}
        <div className="flex flex-col items-center text-center space-y-12 sm:space-y-0 sm:grid sm:grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr_1fr] sm:text-left sm:items-start sm:gap-x-8 sm:gap-y-4">
          
          {/* Brand Section */}
          <div className="flex flex-col items-center space-y-3 sm:items-start md:col-span-1">
            <div className="flex items-center gap-3">
              <img
                src={tapatChainLogo}
                alt="TapatChain Philippines"
                className="h-7 w-auto object-contain sm:h-8"
              />
              <span className="text-base font-bold tracking-tight text-foreground">
                TapatChain Philippines
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground max-w-[280px] sm:max-w-[240px]">
              Public infrastructure transparency and audit visibility platform.
            </p>
          </div>

          {/* Links Section - 2x2 Grid for Mobile Balance | sm:contents for Desktop Original Grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 w-full max-w-[320px] sm:max-w-none sm:contents">
            
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Quick Links</p>
              <nav className="flex flex-col items-center gap-2.5 sm:items-start sm:gap-2">
                {quickLinks.map(({ label, page }) => (
                  <button
                    key={label}
                    onClick={() => setCurrentPage(page)}
                    className="text-center text-sm text-muted-foreground hover:text-primary transition-colors sm:text-left sm:text-[13px]"
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Legal</p>
              <nav className="flex flex-col items-center gap-2.5 sm:items-start sm:gap-2">
                {legalLinks.map(({ label, page }) => (
                  <button
                    key={label}
                    onClick={() => setCurrentPage(page)}
                    className="text-center text-sm text-muted-foreground hover:text-primary transition-colors sm:text-left sm:text-[13px]"
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Developer</p>
              <nav className="flex flex-col items-center gap-2.5 sm:items-start sm:gap-2">
                {developerLinks.map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    className="text-center text-sm text-muted-foreground hover:text-primary transition-colors sm:text-left sm:text-[13px]"
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Contact</p>
              <div className="flex flex-col items-center gap-2.5 sm:items-start sm:gap-2">
                <a
                  href="mailto:support@tapatchain.ph"
                  className="text-center text-sm text-muted-foreground hover:text-primary transition-colors sm:text-left sm:text-[13px]"
                >
                  Support
                </a>
                <a
                  href="#"
                  className="text-center text-sm text-muted-foreground hover:text-primary transition-colors sm:text-left sm:text-[13px]"
                >
                  LinkedIn
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar - Compact Desktop Spacing */}
        <div className="mt-10 border-t border-border/50 pt-6 sm:mt-8 sm:pt-6">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-between sm:gap-0">
            <div className="flex items-center gap-2.5 bg-secondary/50 border border-border/50 px-3.5 py-1.5 rounded-full">
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span className="text-[9px] font-bold text-foreground/80 tracking-widest uppercase">
                Block #10491148 Verified
              </span>
            </div>

            <p className="text-[10px] text-muted-foreground font-medium tracking-tight text-center sm:text-right sm:text-[11px]">
              © 2026 TapatChain Philippines. Built for Integrity.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}