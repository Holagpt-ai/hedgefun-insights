import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function JournalTable({
  headers,
  children,
  className,
}: {
  headers: ReactNode[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("journal-table-wrap journal-card", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header, i) => (
              <TableHead key={i}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

export { TableRow, TableCell };
