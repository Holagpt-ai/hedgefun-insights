import { Construction } from "lucide-react";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { AdBanner } from "@/components/layout/AdBanner";

export default function CorporateActionsPage() {
  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/" className="text-[0.8125rem]">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage className="text-[0.8125rem]">Actions</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="text-[1.375rem] font-bold text-foreground mb-6">Corporate Actions</h1>

        <div className="pt-16 pb-16">
          <Construction size={40} className="text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2 text-center">Coming Soon</h2>
          <p className="text-sm text-muted-foreground text-center">
            Corporate actions data is coming soon. Check back shortly.
          </p>
        </div>
      </div>
    </div>
  );
}
