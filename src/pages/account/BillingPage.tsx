import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createCheckoutSession, createPortalSession } from "@/lib/stripe";
import { toast } from "@/hooks/use-toast";
import { CreditCard, ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const BillingPage = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [loading, user, navigate]);

  if (loading || !user) return null;

  const isPro = profile?.plan === "pro";

  const handleUpgrade = async () => {
    try {
      const { url } = await createCheckoutSession("pro_monthly");
      if (url) window.location.href = url;
    } catch {
      toast({ title: "Unable to start checkout", variant: "destructive" });
    }
  };

  const handleCancel = async () => {
    try {
      const { url } = await createPortalSession();
      if (url) window.location.href = url;
    } catch {
      toast({ title: "Unable to open billing portal", variant: "destructive" });
    }
  };

  // current_period_end may exist on the DB row but isn't in the typed profile context
  const formattedEndDate = (profile as any)?.current_period_end
    ? new Date((profile as any).current_period_end).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <h1 className="text-lg font-bold text-foreground">Manage Billing</h1>

      {/* Current Plan */}
      <div className="fintech-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Current Plan</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge
              variant={isPro ? "default" : "secondary"}
              className={isPro ? "bg-accent-blue text-primary-foreground" : ""}
            >
              {isPro ? "Pro" : "Free"}
            </Badge>
            {isPro && formattedEndDate && (
              <span className="text-xs text-muted-foreground">
                Next billing: {formattedEndDate}
              </span>
            )}
          </div>
          {isPro ? (
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel Subscription
            </Button>
          ) : (
            <Button size="sm" onClick={handleUpgrade} className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Upgrade to Pro
            </Button>
          )}
        </div>
      </div>

      {/* Payment Method */}
      <div className="fintech-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Payment Method</h2>
        <div className="flex items-center gap-2 text-muted-foreground">
          <CreditCard className="h-4 w-4" />
          <span className="text-sm">
            {isPro ? "Card on file (managed by Stripe)" : "No payment method on file"}
          </span>
        </div>
      </div>

      {/* Billing History */}
      <div className="fintech-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Billing History</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                No billing history yet
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default BillingPage;
