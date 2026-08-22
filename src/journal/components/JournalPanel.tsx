import { Children, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function hasRenderableContent(children: ReactNode): boolean {
  // Children.toArray already omits boolean / null / undefined nodes.
  return Children.toArray(children).some((child) => child !== "");
}

/** Bordered journal chrome. Renders nothing when there is no content. */
export function JournalPanel({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  if (!hasRenderableContent(children)) return null;
  return (
    <div className={cn("journal-card p-3", className)} {...rest}>
      {children}
    </div>
  );
}
