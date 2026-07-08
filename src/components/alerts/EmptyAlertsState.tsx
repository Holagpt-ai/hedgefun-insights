import { Bell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onCreate: () => void;
}

export default function EmptyAlertsState({ onCreate }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-border bg-surface-card px-6 py-14">
      <div className="h-12 w-12 rounded-full bg-accent-blue-light flex items-center justify-center mb-4">
        <Bell className="h-6 w-6 text-accent-blue" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">No price alerts yet.</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-1">
        Create a preview alert to plan what you want to monitor.
      </p>
      <p className="text-xs text-muted-foreground max-w-sm mb-5">
        Delivery is not connected yet — alerts are saved locally in this browser.
      </p>
      <Button
        onClick={onCreate}
        className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground"
      >
        <Plus className="h-4 w-4 mr-1.5" />
        Create Alert
      </Button>
    </div>
  );
}
