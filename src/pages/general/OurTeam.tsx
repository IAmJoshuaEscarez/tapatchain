import tapatChainLogo from "@/assets/images/tapatchain.png";
import joshuaPhoto from "@/assets/images/our team/joshua.jpg";
import haroldPhoto from "@/assets/images/our team/harold.jpg";
import jambyPhoto from "@/assets/images/our team/jamby.jpg";
import aizelPhoto from "@/assets/images/our team/aizeldulce.jpg";
import ramerPhoto from "@/assets/images/our team/ramer.jpg";

interface DevelopersPageProps {
  setCurrentPage: (page: string) => void;
}

const team = [
  {
    name: "Escarez, John Joshua Manalo",
    role: "Lead Developer Tapatchain",
    focus: "Blockchain integration, core system architecture, and full-stack development",
    initials: "JE",
    photo: joshuaPhoto,
  },
  {
    name: "Morante, Harold",
    role: "Technical Researcher",
    focus: "Research methodology, data collection, and manuscript development",
    initials: "HM",
    photo: haroldPhoto,
  },
  {
    name: "Reyes, Jamby",
    role: "Technical Researcher",
    focus: "Research methodology, data collection, and manuscript development",
    initials: "JR",
    photo: jambyPhoto,
  },
  {
    name: "Dulce, Aizel",
    role: "Technical Researcher",
    focus: "Literature synthesis, requirement analysis, and documentation",
    initials: "AD",
    photo: aizelPhoto,
  },
  {
    name: "Roblo, Ramer",
    role: "Technical Researcher",
    focus: "Quantitative data analysis, results interpretation, and APA compliance",
    initials: "RM",
    photo: ramerPhoto,
  },
];

export function DevelopersPage({ setCurrentPage }: DevelopersPageProps) {
  return (
    <div className="min-h-screen bg-background pt-20 sm:pt-24">
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-20 sm:px-6 sm:pt-10 lg:px-10 lg:pb-24">
        {/* Hero */}
        <div className="mb-14 flex flex-col items-center text-center sm:mb-20">
          <img src={tapatChainLogo} alt="TapatChain" className="mb-6 h-20 w-20 object-contain" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">TapatChain Philippines</p>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Product and Engineering Team</h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
            Meet the professionals building and maintaining TapatChain&apos;s public infrastructure transparency platform.
          </p>
        </div>

        {/* Team */}
        <div className="mb-10 flex justify-center sm:mb-12">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Team Directory</p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Team Members</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-6 xl:gap-10">
          {team.map(({ name, role, focus, initials, photo }, index) => (
            <article
              key={name}
              className={`h-full rounded-2xl border border-border/70 bg-card/95 px-6 py-7 sm:px-8 sm:py-8 xl:col-span-2 ${
                index === 3
                  ? "xl:col-start-2"
                  : index === 4
                    ? "xl:col-start-4"
                    : ""
              }`}
            >
              <div className="flex items-start gap-4 sm:gap-5">
                <div className="relative h-14 w-14 shrink-0">
                  <img
                    src={photo}
                    alt={name}
                    className="h-14 w-14 rounded-full border border-primary/25 object-cover"
                  />
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold leading-none text-primary-foreground">
                    {initials}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-base font-semibold leading-tight text-foreground sm:text-lg">{name}</p>
                  <p className="mt-1.5 text-sm font-medium text-primary">{role}</p>
                </div>
              </div>

              <div className="mt-6 border-t border-border/60 pt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Responsibilities</p>
                <p className="mt-3.5 text-sm leading-7 text-foreground/90 sm:text-[15px] sm:leading-7">{focus}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
