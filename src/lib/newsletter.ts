import { supabase } from "@/integrations/supabase/client";

export async function subscribeToNewsletter(
  email: string,
  source: string
): Promise<{ status: "success" | "duplicate" | "invalid" | "error" }> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email.trim())) {
    return { status: "invalid" };
  }

  const { error } = await supabase.from("newsletter_subscribers" as any).insert({
    email: email.trim().toLowerCase(),
    source,
  } as any);

  if (error) {
    if (error.code === "23505") return { status: "duplicate" };
    return { status: "error" };
  }

  // Fire welcome email — non-blocking
  try {
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter-welcome`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      }
    );
  } catch (_) {
    // Welcome email failure does not affect subscription success
  }

  return { status: "success" };
}
