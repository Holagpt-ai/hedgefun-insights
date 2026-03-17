import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle } from "lucide-react";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  subject: z.string().min(1, "Please select a subject"),
  message: z.string().trim().min(1, "Message is required").max(5000),
});

export default function AdvertisePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject] = useState("Advertise With Us");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    document.title = "Advertise | HedgeFun";
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = contactSchema.safeParse({ name, email, subject, message });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setStatus("sending");
    const { error } = await supabase.from("contact_submissions").insert({
      name: result.data.name,
      email: result.data.email,
      subject: result.data.subject,
      message: result.data.message,
    });

    if (error) {
      setStatus("error");
    } else {
      setStatus("success");
    }
  };

  return (
    <>
    <div className="max-w-[800px] mx-auto px-6 py-12">
      <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-8">
        Advertise on HedgeFun
      </h1>

      <div className="text-base leading-[1.6] text-foreground">
        <p className="mb-4">
          Reach a highly engaged audience of active investors and traders. HedgeFun serves financial data to thousands of investors daily — people actively researching stocks, ETFs, and market opportunities.
        </p>

        <h2 className="text-[1.125rem] font-bold mb-3 mt-6">Why Advertise With Us?</h2>
        <ul className="list-disc pl-6 mb-6 space-y-1">
          <li>Targeted audience of active retail investors</li>
          <li>High-intent users actively researching financial products</li>
          <li>Display ad slots across all major pages</li>
          <li>Newsletter sponsorship reaching subscribers daily</li>
          <li>Competitive CPM rates</li>
        </ul>

        <h2 className="text-[1.125rem] font-bold mb-3">Ad Formats Available</h2>
        <ul className="list-disc pl-6 mb-6 space-y-1">
          <li>Leaderboard banner (728×90) — top of page</li>
          <li>Rectangle (300×250) — sidebar placement</li>
          <li>Newsletter sponsorship — dedicated section in daily email</li>
        </ul>

        <h2 className="text-[1.125rem] font-bold mb-3">Get In Touch</h2>
        <p className="mb-1">To discuss advertising opportunities, pricing, and availability, contact us at:</p>
        <p className="mb-6">
          Email: <a href="mailto:info@hedgefun.fun" className="text-primary hover:underline">info@hedgefun.fun</a>
          <br />Subject line: Advertising Inquiry
        </p>

        <h2 className="text-[1.125rem] font-bold mb-4 mt-8 border-t border-border pt-6">
          Or send us a message:
        </h2>

        {status === "success" ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500 mb-4" />
            <p className="text-lg font-medium text-emerald-600 dark:text-emerald-400">
              Message sent! We'll be in touch within 1–2 business days.
            </p>
          </div>
        ) : (
          <>
            {status === "error" && (
              <p className="text-destructive mb-4 text-sm">
                Something went wrong. Please email us directly at{" "}
                <a href="mailto:info@hedgefun.fun" className="underline">info@hedgefun.fun</a>
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
                {errors.name && <p className="text-destructive text-xs mt-1">{errors.name}</p>}
              </div>
              <div>
                <Input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                {errors.email && <p className="text-destructive text-xs mt-1">{errors.email}</p>}
              </div>
              <div>
                <Select value={subject} disabled>
                  <SelectTrigger>
                    <SelectValue placeholder="Advertise With Us" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Advertise With Us">Advertise With Us</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Textarea placeholder="Your message..." className="min-h-[160px]" value={message} onChange={(e) => setMessage(e.target.value)} required />
                {errors.message && <p className="text-destructive text-xs mt-1">{errors.message}</p>}
              </div>
              <Button type="submit" className="w-full h-12" disabled={status === "sending"}>
                {status === "sending" ? "Sending..." : "Send Message"}
              </Button>
            </form>
          </>
        )}
      </div>

    </div>
    <Footer />
    </>
  );
}
