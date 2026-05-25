import { Search, Calendar } from "lucide-react";
import { CollapsibleSection } from "@/components/ui";

interface AdvancedFilterBarProps {
  searchPlaceholder?: string;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  dateFilter?: string;
  setDateFilter?: (val: string) => void;
  extraFilters?: React.ReactNode;
}

export function AdvancedFilterBar({
  searchPlaceholder = "Search...",
  searchQuery,
  setSearchQuery,
  dateFilter,
  setDateFilter,
  extraFilters
}: AdvancedFilterBarProps) {
  return (
    <CollapsibleSection title="Advanced Filters" defaultOpen>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full pl-8 pr-3 text-xs border border-border bg-background text-foreground placeholder:text-muted-foreground rounded-md focus:outline-none focus:border-primary"
          />
        </div>

        {setDateFilter && (
          <div className="relative w-full sm:w-auto">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-8 w-full sm:w-42.5 pl-8 pr-3 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary appearance-none cursor-pointer"
            >
              <option value="all">All Dates</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
            </select>
          </div>
        )}

        {extraFilters && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            {extraFilters}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
