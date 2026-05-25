import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RDCProject } from "@/context/ProjectContext";

// ── Types ──────────────────────────────────────────────────────────────────
export interface AdminFundedTabProps {
  fundedProjects: RDCProject[];
}

const ALL_FILTER_VALUE = "__all__";
const DEFAULT_CELL_TEXT = "N/A";

function textValue(value?: string | null): string {
  return (value ?? "").trim();
}

function withFallback(value: string, fallback = DEFAULT_CELL_TEXT): string {
  return value.length > 0 ? value : fallback;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function getRegion(project: RDCProject): string {
  const dpwhRegion = textValue(project.dpwhRegion);
  if (dpwhRegion) return dpwhRegion;
  return textValue(project.region);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0))).sort((a, b) =>
    a.localeCompare(b)
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export function AdminFundedTab({ fundedProjects }: AdminFundedTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState(ALL_FILTER_VALUE);
  const [selectedMunicipality, setSelectedMunicipality] = useState(ALL_FILTER_VALUE);
  const [selectedBarangay, setSelectedBarangay] = useState(ALL_FILTER_VALUE);

  const regionOptions = useMemo(
    () => uniqueSorted(fundedProjects.map((project) => getRegion(project))),
    [fundedProjects]
  );

  const municipalityOptions = useMemo(() => {
    const rowsByRegion = fundedProjects.filter((project) => {
      if (selectedRegion === ALL_FILTER_VALUE) return true;
      return normalize(getRegion(project)) === normalize(selectedRegion);
    });

    return uniqueSorted(rowsByRegion.map((project) => textValue(project.municipality)));
  }, [fundedProjects, selectedRegion]);

  const barangayOptions = useMemo(() => {
    const rowsByRegionMunicipality = fundedProjects.filter((project) => {
      const region = getRegion(project);
      const municipality = textValue(project.municipality);

      if (selectedRegion !== ALL_FILTER_VALUE && normalize(region) !== normalize(selectedRegion)) {
        return false;
      }

      if (
        selectedMunicipality !== ALL_FILTER_VALUE &&
        normalize(municipality) !== normalize(selectedMunicipality)
      ) {
        return false;
      }

      return true;
    });

    return uniqueSorted(rowsByRegionMunicipality.map((project) => textValue(project.barangay)));
  }, [fundedProjects, selectedMunicipality, selectedRegion]);

  useEffect(() => {
    if (selectedRegion === ALL_FILTER_VALUE) return;
    const regionStillExists = regionOptions.some(
      (option) => normalize(option) === normalize(selectedRegion)
    );
    if (!regionStillExists) {
      setSelectedRegion(ALL_FILTER_VALUE);
      setSelectedMunicipality(ALL_FILTER_VALUE);
      setSelectedBarangay(ALL_FILTER_VALUE);
    }
  }, [regionOptions, selectedRegion]);

  useEffect(() => {
    if (selectedMunicipality === ALL_FILTER_VALUE) return;
    const municipalityStillExists = municipalityOptions.some(
      (option) => normalize(option) === normalize(selectedMunicipality)
    );
    if (!municipalityStillExists) {
      setSelectedMunicipality(ALL_FILTER_VALUE);
      setSelectedBarangay(ALL_FILTER_VALUE);
    }
  }, [municipalityOptions, selectedMunicipality]);

  useEffect(() => {
    if (selectedBarangay === ALL_FILTER_VALUE) return;
    const barangayStillExists = barangayOptions.some(
      (option) => normalize(option) === normalize(selectedBarangay)
    );
    if (!barangayStillExists) {
      setSelectedBarangay(ALL_FILTER_VALUE);
    }
  }, [barangayOptions, selectedBarangay]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = normalize(searchQuery);

    return fundedProjects.filter((project) => {
      const region = getRegion(project);
      const municipality = textValue(project.municipality);
      const barangay = textValue(project.barangay);

      if (selectedRegion !== ALL_FILTER_VALUE && normalize(region) !== normalize(selectedRegion)) {
        return false;
      }

      if (
        selectedMunicipality !== ALL_FILTER_VALUE &&
        normalize(municipality) !== normalize(selectedMunicipality)
      ) {
        return false;
      }

      if (
        selectedBarangay !== ALL_FILTER_VALUE &&
        normalize(barangay) !== normalize(selectedBarangay)
      ) {
        return false;
      }

      if (!normalizedQuery) return true;

      const searchableText = [
        project.id,
        project.title,
        region,
        municipality,
        barangay,
        project.contractorName,
        project.contractorWallet,
        project.engineerName,
        project.inspectorName,
        project.engineerWallet,
        project.status,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [
    fundedProjects,
    searchQuery,
    selectedBarangay,
    selectedMunicipality,
    selectedRegion,
  ]);

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedRegion(ALL_FILTER_VALUE);
    setSelectedMunicipality(ALL_FILTER_VALUE);
    setSelectedBarangay(ALL_FILTER_VALUE);
  };

  if (fundedProjects.length === 0) {
    return (
      <Card className="p-12 text-center">
        <h3 className="text-base font-semibold text-foreground mb-2">No Funded Projects Yet</h3>
        <p className="text-xs text-muted-foreground">
          Approve incoming RDC proposals to allocate budgets.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border border-border">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex flex-col xl:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by ID, title, location, contractor, engineer, or wallet"
                className="w-full pl-9 pr-3 py-2 text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="relative w-full sm:w-auto">
              <select
                value={selectedRegion}
                onChange={(event) => {
                  setSelectedRegion(event.target.value);
                  setSelectedMunicipality(ALL_FILTER_VALUE);
                  setSelectedBarangay(ALL_FILTER_VALUE);
                }}
                className="appearance-none w-full sm:min-w-42.5 pl-3 pr-8 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
              >
                <option value={ALL_FILTER_VALUE}>All Regions</option>
                {regionOptions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>

            <div className="relative w-full sm:w-auto">
              <select
                value={selectedMunicipality}
                onChange={(event) => {
                  setSelectedMunicipality(event.target.value);
                  setSelectedBarangay(ALL_FILTER_VALUE);
                }}
                className="appearance-none w-full sm:min-w-47.5 pl-3 pr-8 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
              >
                <option value={ALL_FILTER_VALUE}>All Municipalities</option>
                {municipalityOptions.map((municipality) => (
                  <option key={municipality} value={municipality}>
                    {municipality}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>

            <div className="relative w-full sm:w-auto">
              <select
                value={selectedBarangay}
                onChange={(event) => setSelectedBarangay(event.target.value)}
                className="appearance-none w-full sm:min-w-47.5 pl-3 pr-8 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
              >
                <option value={ALL_FILTER_VALUE}>All Barangays</option>
                {barangayOptions.map((barangay) => (
                  <option key={barangay} value={barangay}>
                    {barangay}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>

            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              Clear
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            Showing {filteredProjects.length} of {fundedProjects.length} funded projects
          </p>
        </CardContent>
      </Card>

      <Card className="border border-border overflow-hidden">
        {filteredProjects.length === 0 ? (
          <div className="p-12 text-center">
            <h3 className="text-base font-semibold text-foreground mb-2">No Matching Projects</h3>
            <p className="text-xs text-muted-foreground">
              Try a different search or filter combination.
            </p>
          </div>
        ) : (
          <Table className="min-w-225">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="h-10 text-[11px] uppercase tracking-wide">Project ID</TableHead>
                <TableHead className="h-10 text-[11px] uppercase tracking-wide">Project Title</TableHead>
                <TableHead className="h-10 text-[11px] uppercase tracking-wide">Region</TableHead>
                <TableHead className="h-10 text-[11px] uppercase tracking-wide">Municipality</TableHead>
                <TableHead className="h-10 text-[11px] uppercase tracking-wide">Barangay</TableHead>
                <TableHead className="h-10 text-[11px] uppercase tracking-wide">Assigned Contractor</TableHead>
                <TableHead className="h-10 text-[11px] uppercase tracking-wide">Assigned Site Engineer</TableHead>
                <TableHead className="h-10 text-[11px] uppercase tracking-wide text-right">Approved Budget</TableHead>
                <TableHead className="h-10 text-[11px] uppercase tracking-wide">Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredProjects.map((project) => {
                const region = withFallback(getRegion(project));
                const municipality = withFallback(textValue(project.municipality));
                const barangay = withFallback(textValue(project.barangay));
                const contractor = withFallback(textValue(project.contractorName), "Unassigned");
                const contractorWallet = withFallback(textValue(project.contractorWallet), "No wallet");
                const siteEngineer = withFallback(
                  textValue(project.engineerName || project.inspectorName),
                  "Unassigned"
                );
                const siteEngineerWallet = withFallback(textValue(project.engineerWallet), "No wallet");
                const approvedBudget = withFallback(
                  textValue(project.finalApprovedBudget || project.approvedBudget)
                );

                return (
                  <TableRow key={project.id}>
                    <TableCell className="py-3 text-xs font-mono text-muted-foreground">
                      {project.id}
                    </TableCell>
                    <TableCell className="py-3 text-sm font-semibold text-foreground">
                      {project.title}
                    </TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">{region}</TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">{municipality}</TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">{barangay}</TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">
                      <div className="space-y-0.5">
                        <p>{contractor}</p>
                        <p className="text-[11px] font-mono text-foreground break-all">{contractorWallet}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">
                      <div className="space-y-0.5">
                        <p>{siteEngineer}</p>
                        <p className="text-[11px] font-mono text-foreground break-all">{siteEngineerWallet}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-sm font-semibold text-foreground text-right tabular-nums">
                      {approvedBudget}
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                        {project.status.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
