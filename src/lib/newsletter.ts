import { supabase } from "@/integrations/supabase/client";

export async function subscribeToNewsletter(
  email: string,
  source: string
): Promise<{ status: "success" | "duplicate" | "invalid" | "error" }> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email.trim())) {
    return { status: "invalid" };
  }

  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter-welcome`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ email: email.trim().toLowerCase(), source }),
      }
    );
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.success) return { status: "success" };
    if (res.ok && json?.status === "duplicate") return { status: "duplicate" };
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
  // supabase import retained for potential future authenticated reads
  void supabase;
}
