import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AppSidebar } from "./AppSidebar";

export function MobileSidebarDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="p-0 w-[280px]">
        <AppSidebar className="flex w-full h-full border-r-0 static" />
      </SheetContent>
    </Sheet>
  );
}
