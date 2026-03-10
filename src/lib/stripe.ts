// Client-side Stripe helpers
import { supabase } from "@/integrations/supabase/client";

export async function createCheckoutSession(priceId: string): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke("stripe-checkout", {
    body: { priceId },
  });

  if (error) throw new Error(error.message || "Checkout failed");
  if (!data?.url) throw new Error("No checkout URL returned");
  return { url: data.url };
}

export async function createPortalSession(): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke("stripe-portal");

  if (error) throw new Error(error.message || "Portal failed");
  if (!data?.url) throw new Error("No portal URL returned");
  return { url: data.url };
}
