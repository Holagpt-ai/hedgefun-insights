import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle } from "lucide-react";
import { z } from "zod";

const affiliateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  website_url: z.string().trim().min(1, "Website or channel URL is required").max(500),
  audience_size: z.string().min(1, "Please select audience size"),
  promotion_plan: z.string().trim().min(1, "Please describe your promotion plan").max(5000),
});

export default function AffiliatesPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [audienceSize, setAudienceSize] = useState("");
  const [promotionPlan, setPromotionPlan] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    document.title = "Affiliate Program | HedgeFun";
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = affiliateSchema.safeParse({
      name, email, website_url: websiteUrl, audience_size: audienceSize, promotion_plan: promotionPlan,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setStatus("sending");
    const { error } = await supabase.from("affiliate_applications" as any).insert({
      name: result.data.name,
      email: result.data.email,
      website_url: result.data.website_url,
      audience_size: result.data.audience_size,
      promotion_plan: result.data.promotion_plan,
    } as any);

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
        HedgeFun Affiliate Program
      </h1>

      <div className="text-base leading-[1.6] text-foreground">
        <p className="mb-4">
          Earn commission by referring investors to HedgeFun Pro. Our affiliate program is simple, transparent, and rewarding.
        </p>

        <h2 className="text-[1.125rem] font-bold mb-3 mt-6">How It Works</h2>
        <ol className="list-decimal pl-6 mb-6 space-y-1">
          <li>Apply to join the affiliate program below.</li>
          <li>Get your unique referral link.</li>
          <li>Share it with your audience — blog, YouTube, newsletter, social media.</li>
          <li>Earn commission for every Pro subscription you refer.</li>
        </ol>

        <h2 className="text-[1.125rem] font-bold mb-3">Commission Structure</h2>
        <ul className="list-disc pl-6 mb-6 space-y-1">
          <li>30% recurring commission on all referred Pro subscriptions</li>
          <li>Monthly payouts via PayPal or bank transfer</li>
          <li>Real-time dashboard to track clicks, conversions, and earnings</li>
        </ul>

        <h2 className="text-[1.125rem] font-bold mb-3">Who Should Apply?</h2>
        <ul className="list-disc pl-6 mb-6 space-y-1">
          <li>Finance bloggers and YouTubers</li>
          <li>Newsletter writers covering markets and investing</li>
          <li>Social media creators in the finance space</li>
          <li>Developers building financial tools</li>
        </ul>

        <h2 className="text-[1.125rem] font-bold mb-4 mt-8 border-t border-border pt-6">
          Apply Now
        </h2>

        {status === "success" ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500 mb-4" />
            <p className="text-lg font-medium text-emerald-600 dark:text-emerald-400">
              Application submitted! We'll review and get back to you within 3–5 business days.
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
                <Input placeholder="Website / Channel URL" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} required />
                {errors.website_url && <p className="text-destructive text-xs mt-1">{errors.website_url}</p>}
              </div>
              <div>
                <Select value={audienceSize} onValueChange={setAudienceSize}>
                  <SelectTrigger>
                    <SelectValue placeholder="Monthly Audience Size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Under 1K">Under 1K</SelectItem>
                    <SelectItem value="1K–10K">1K–10K</SelectItem>
                    <SelectItem value="10K–50K">10K–50K</SelectItem>
                    <SelectItem value="50K+">50K+</SelectItem>
                  </SelectContent>
                </Select>
                {errors.audience_size && <p className="text-destructive text-xs mt-1">{errors.audience_size}</p>}
              </div>
              <div>
                <Textarea placeholder="How will you promote HedgeFun?" className="min-h-[160px]" value={promotionPlan} onChange={(e) => setPromotionPlan(e.target.value)} required />
                {errors.promotion_plan && <p className="text-destructive text-xs mt-1">{errors.promotion_plan}</p>}
              </div>
              <Button type="submit" className="w-full h-12" disabled={status === "sending"}>
                {status === "sending" ? "Submitting..." : "Submit Application"}
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
