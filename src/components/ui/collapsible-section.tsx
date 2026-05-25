import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  /** Defaults to false (collapsed). Pass true to start open. */
  defaultOpen?: boolean;
  /** Badge/count shown next to the title */
  badge?: React.ReactNode;
  /** Extra content shown in the header row (right side) */
  headerRight?: React.ReactNode;
  /** Section subtitle text */
  subtitle?: string;
  className?: string;
  /** If true, renders without the Card wrapper (just a plain section) */
  plain?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  badge,
  headerRight,
  subtitle,
  className,
  plain = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  const header = (
    <button
      type="button"
      onClick={() => setIsOpen((prev) => !prev)}
      className={cn(
        "flex w-full items-center justify-between gap-3 text-left transition-colors",
        plain
          ? "py-3.5 px-2 hover:bg-muted/30 rounded-lg"
          : "px-5 py-4 hover:bg-muted/20 rounded-t-lg",
        !isOpen && !plain && "rounded-b-lg"
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <span className="text-primary shrink-0 [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground truncate">
              {title}
            </span>
            {badge && <>{badge}</>}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {headerRight}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </div>
    </button>
  );

  const content = (
    <div
      className={cn(
        "grid transition-all duration-200 ease-in-out",
        isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
    >
      <div className={cn(isOpen ? "overflow-visible" : "overflow-hidden")}>
        <div className={cn(plain ? "py-3 px-2" : "px-5 pb-5")}>
          <div className="space-y-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  if (plain) {
    return (
      <div className={cn("border-b border-border/50 last:border-b-0", className)}>
        {header}
        {content}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground transition-all duration-200",
        className
      )}
    >
      {header}
      {content}
    </div>
  );
}

/** Compact stat display for summary bars */
interface StatItemProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  className?: string;
}

export function StatItem({ label, value, icon, className }: StatItemProps) {
  return (
    <div className={cn("flex items-center gap-2.5 px-4 py-2.5", className)}>
      {icon && (
        <span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      )}
      <div>
        <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
        <p className="text-sm font-semibold text-foreground mt-0.5">{value}</p>
      </div>
    </div>
  );
}

/** A compact summary bar that shows stats inline */
interface SummaryBarProps {
  children: React.ReactNode;
  className?: string;
}

export function SummaryBar({ children, className }: SummaryBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1.5",
        className
      )}
    >
      {children}
    </div>
  );
}
