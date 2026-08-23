import { cn } from "@/lib/utils";

/** Wide tables scroll inside their own container rather than the page body. */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="panel overflow-x-auto rounded-xl">
      <table className={cn("w-full min-w-[640px] text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn("border-b px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted", className)}
      style={{ borderColor: "var(--panel-border)" }}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn("border-b px-4 py-3 align-middle", className)} style={{ borderColor: "var(--panel-border)" }}>
      {children}
    </td>
  );
}
