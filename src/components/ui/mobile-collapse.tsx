import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface MobileCollapseProps {
  /** Label shown only on mobile as the collapse header */
  title: string;
  icon?: React.ReactNode;
  /** Start open on mobile? Default: false (collapsed) */
  defaultOpen?: boolean;
  /** Optional badge/count */
  badge?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Mobile-only collapsible wrapper.
 *   - On screens < 640px (sm): shows a compact toggle header + animated collapse.
 *   - On screens >= 640px: renders children directly with no wrapper UI.
 */
export function MobileCollapse({
  title,
  icon,
  defaultOpen = false,
  badge,
  className,
  children,
}: MobileCollapseProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className={cn(className)}>
      {/* ─── Mobile header: visible only below sm ─── */}
      <button
        type="button"
        onClick={() => setIsOpen((p) => !p)}
        className="sm:hidden flex w-full items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-border/60 bg-muted/40 hover:bg-muted/60 transition-colors mb-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && (
            <span className="text-primary shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">
              {icon}
            </span>
          )}
          <span className="text-xs font-semibold text-foreground truncate">
            {title}
          </span>
          {badge}
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 shrink-0",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* ─── Content: animated on mobile, always visible on desktop ─── */}
      {/* Desktop: always shown */}
      <div className="hidden sm:block">{children}</div>
      {/* Mobile: animated collapse */}
      <div
        className={cn(
          "sm:hidden grid transition-all duration-200 ease-in-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
