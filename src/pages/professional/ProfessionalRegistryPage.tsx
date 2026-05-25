import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { PaginationControls } from "@/components/ui";
import { useProfessionalRegistryPage } from "@/hooks/professional/useProfessionalRegistryPage";
import { ArrowLeft, Search, FileText, ExternalLink } from "lucide-react";

interface ProfessionalRegistryPageProps {
  setCurrentPage: (page: string) => void;
}

const REGISTRY_PAGE_SIZE = 8;

export function ProfessionalRegistryPage({ setCurrentPage }: ProfessionalRegistryPageProps) {
  const { regSearch, setRegSearch, isLoading, registeredProfessionals, filteredProfessionals } =
    useProfessionalRegistryPage();

  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredProfessionals.length / REGISTRY_PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [regSearch, filteredProfessionals.length]);

  const pagedProfessionals = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * REGISTRY_PAGE_SIZE;
    return filteredProfessionals.slice(start, start + REGISTRY_PAGE_SIZE);
  }, [filteredProfessionals, page, totalPages]);

  return (
    <div className="pt-20 min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage("rd")}
                  className="gap-2 -ml-2 h-7 text-xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </Button>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground">Professional Registry</h1>
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  {registeredProfessionals.length} registered
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Contractors", value: registeredProfessionals.filter(s => s.type === "Contractor").length },
              { label: "Site Engineers", value: registeredProfessionals.filter(s => s.type === "SiteEngineer").length },
              { label: "Total Registered", value: registeredProfessionals.length },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-border bg-card px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="text-3xl font-bold tracking-tight text-foreground mt-1">{value}</p>
              </div>
            ))}
          </div>

          {/* Registry Card */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Search Header */}
            <div className="px-6 py-4 border-b border-border bg-muted/20">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  placeholder="Search by name, license, wallet..."
                  value={regSearch}
                  onChange={(e) => setRegSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Professional List */}
            <div className="p-6">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
                  <p className="text-sm text-muted-foreground">Loading professionals...</p>
                </div>
              ) : filteredProfessionals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FileText className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">
                    {registeredProfessionals.length === 0
                      ? "No professionals registered yet"
                      : "No results match your search"}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    {registeredProfessionals.length === 0
                      ? "Register professionals from the RD Dashboard to see them here."
                      : "Try adjusting your search criteria."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pagedProfessionals.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-start justify-between gap-4 p-4 rounded-lg border border-border hover:border-primary/30 hover:shadow-sm bg-card hover:bg-muted/30 transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        {/* Name & Badge */}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{s.name}</p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                            s.type === "Contractor"
                              ? "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                              : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          }`}>
                            {s.type === "SiteEngineer" ? "Engineer" : s.type}
                          </span>
                        </div>

                        {/* License & Wallet */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {s.licenseNo && (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-[10px] uppercase font-medium">License:</span>
                              <span className="font-medium text-foreground">{s.licenseNo}</span>
                            </span>
                          )}
                          {s.walletAddress && (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <span className="text-[10px] uppercase font-medium">Wallet:</span>
                              <span className="font-medium text-foreground">
                                {s.walletAddress.slice(0, 8)}...{s.walletAddress.slice(-4)}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Etherscan Link */}
                      {s.walletAddress && (
                        <a
                          href={`https://sepolia.etherscan.io/address/${s.walletAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary hover:text-primary/80 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all whitespace-nowrap flex-shrink-0 h-fit"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Etherscan
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!isLoading && filteredProfessionals.length > 0 && (
                <PaginationControls
                  page={Math.min(page, totalPages)}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  className="pt-4"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
