import { Button } from "@/components/ui";

interface HomePageProps {
  setCurrentPage: (page: string) => void;
}

export function HomePage({ setCurrentPage }: HomePageProps) {
  return (
    <section className="relative min-h-[90vh] flex flex-col items-center justify-center overflow-hidden px-6 py-12 sm:px-8 lg:px-10 sm:py-20">

      {/* Background Mesh - single top glow only */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-1/2 top-4 sm:top-1 -translate-x-1/2 h-[280px] w-[520px] sm:h-[520px] sm:w-[1400px] rounded-full mesh-glow-flashlight blur-[52px] sm:blur-[94px] opacity-0 dark:opacity-100 transition-opacity duration-300" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10 w-full flex flex-col items-center">
        
        {/* MOBILE APP WRAPPER: 
            Dito natin pinolish yung alignment. max-w-[320px] ensures 
            na hindi kakalat ang text sa gilid ng phone.
        */}
        <div className="w-full text-center flex flex-col items-center" style={{ transform: "scale(0.9)", transformOrigin: "center center" }}>
          
          {/* Header Group */}
          <div className="space-y-8 sm:space-y-9 w-full max-w-[348px] mx-auto sm:max-w-none">
            <div className="relative space-y-4 sm:space-y-5">
              <h1 className="hero-title-neon-dark font-medium text-[4.15rem] leading-[1.08] tracking-[-0.02em] text-foreground sm:text-[5rem] md:text-[6.6rem] sm:leading-[0.93] sm:tracking-tight">
                TapatChain
              </h1>
              <div className="h-[3px] w-10 bg-primary/40 mx-auto rounded-full sm:hidden" />
            </div>
            
            <div className="mx-auto w-full max-w-[340px] px-1 sm:max-w-3xl sm:px-0">
              <p className="text-center text-[1.3rem] text-foreground/85 font-medium leading-[1.62] sm:text-[1.66rem] md:text-[2.16rem] sm:leading-tight">
                Monitor government projects from <span className="text-primary font-semibold sm:font-medium">planning</span> to <span className="text-primary font-semibold sm:font-medium">completion</span>.
              </p>
            </div>
          </div>

          {/* Action Group - "The App Tray" look */}
          <div className="flex flex-col sm:flex-row gap-5 pt-12 sm:pt-14 justify-center items-center w-full max-w-[240px] sm:max-w-none mx-auto">
            <Button 
              className="rounded-[18px] w-full h-[60px] text-[0.98rem] leading-[1.35] font-semibold bg-primary hover:bg-primary/90 transition-all active:scale-[0.96] shadow-lg shadow-primary/15 sm:rounded-lg sm:w-[130px] sm:h-[44px] sm:text-sm sm:leading-normal sm:shadow-none sm:active:scale-100"
              onClick={() => setCurrentPage('auth')}
            >
              Portal
            </Button>
            <Button 
              variant="outline" 
              className="rounded-[18px] w-full h-[60px] text-[0.98rem] leading-[1.35] font-medium border-[1.5px] border-primary/25 bg-background/60 text-foreground backdrop-blur-md hover:bg-background/80 dark:border-primary/45 dark:bg-primary/12 dark:text-primary-foreground dark:hover:bg-primary/20 active:scale-[0.96] sm:rounded-lg sm:w-[130px] sm:h-[44px] sm:text-sm sm:leading-normal sm:border-2 sm:active:scale-100"
              onClick={() => setCurrentPage('ledger')}
            >
              Public
            </Button>
          </div>

        </div>
      </div>
    </section>
  );
}