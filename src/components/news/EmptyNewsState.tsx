import { Link } from "react-router-dom";
import { Newspaper } from "lucide-react";

export default function EmptyNewsState() {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-border bg-surface-card px-6 py-14">
      <div className="h-12 w-12 rounded-full bg-accent-blue-light flex items-center justify-center mb-4">
        <Newspaper className="h-6 w-6 text-accent-blue" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">No headlines available yet.</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Check back soon or visit the{" "}
        <Link to="/news" className="text-accent-blue hover:underline">
          public News page
        </Link>
        .
      </p>
    </div>
  );
}
