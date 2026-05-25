import { Button } from "@/components/ui/button";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function PaginationControls({
  page,
  totalPages,
  onPageChange,
  className = "",
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = Math.max(1, safePage - 1);
  const end = Math.min(totalPages, safePage + 1);

  const pages: number[] = [];
  for (let index = start; index <= end; index += 1) {
    pages.push(index);
  }

  return (
    <div className={`mt-3 flex items-center justify-center gap-1.5 ${className}`.trim()}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-[11px]"
        onClick={() => onPageChange(safePage - 1)}
        disabled={safePage <= 1}
      >
        Prev
      </Button>

      {start > 1 && (
        <>
          <button
            type="button"
            onClick={() => onPageChange(1)}
            className="h-7 min-w-7 rounded border border-border px-2 text-[11px] text-muted-foreground hover:bg-muted"
          >
            1
          </button>
          {start > 2 ? <span className="px-1 text-[11px] text-muted-foreground">...</span> : null}
        </>
      )}

      {pages.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onPageChange(value)}
          className={`h-7 min-w-7 rounded border px-2 text-[11px] font-medium transition-colors ${
            value === safePage
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          {value}
        </button>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 ? <span className="px-1 text-[11px] text-muted-foreground">...</span> : null}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            className="h-7 min-w-7 rounded border border-border px-2 text-[11px] text-muted-foreground hover:bg-muted"
          >
            {totalPages}
          </button>
        </>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-[11px]"
        onClick={() => onPageChange(safePage + 1)}
        disabled={safePage >= totalPages}
      >
        Next
      </Button>
    </div>
  );
}
