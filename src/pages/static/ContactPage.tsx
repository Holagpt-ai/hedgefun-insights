import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle } from "lucide-react";
import { z } from "zod";
import { AdBanner } from "@/components/layout/AdBanner";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  subject: z.string().min(1, "Please select a subject"),
  message: z.string().trim().min(1, "Message is required").max(5000),
});

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    document.title = "Contact Us | HedgeFun";
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
    const { error } = await supabase.from("contact_submissions" as any).insert({
      name: result.data.name,
      email: result.data.email,
      subject: result.data.subject,
      message: result.data.message,
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
        Contact Us
      </h1>

      {status === "success" ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle className="h-12 w-12 text-emerald-500 mb-4" />
          <p className="text-lg font-medium text-emerald-600 dark:text-emerald-400">
            Message sent! We'll be in touch within 1–2 business days.
          </p>
        </div>
      ) : (
        <div className="text-base leading-[1.6] text-foreground">
          <p className="mb-6">
            Have a question, feedback, or a partnership inquiry? Fill out the form below and we'll get back to you as soon as possible.
          </p>

          {status === "error" && (
            <p className="text-destructive mb-4 text-sm">
              Something went wrong. Please email us directly at{" "}
              <a href="mailto:info@hedgefun.fun" className="underline">info@hedgefun.fun</a>
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              {errors.name && <p className="text-destructive text-xs mt-1">{errors.name}</p>}
            </div>

            <div>
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {errors.email && <p className="text-destructive text-xs mt-1">{errors.email}</p>}
            </div>

            <div>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General Inquiry">General Inquiry</SelectItem>
                  <SelectItem value="Technical Support">Technical Support</SelectItem>
                  <SelectItem value="Advertise With Us">Advertise With Us</SelectItem>
                  <SelectItem value="Partnership">Partnership</SelectItem>
                  <SelectItem value="Press">Press</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.subject && <p className="text-destructive text-xs mt-1">{errors.subject}</p>}
            </div>

            <div>
              <Textarea
                placeholder="Your message..."
                className="min-h-[160px]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
              {errors.message && <p className="text-destructive text-xs mt-1">{errors.message}</p>}
            </div>

            <Button
              type="submit"
              className="w-full h-12"
              disabled={status === "sending"}
            >
              {status === "sending" ? "Sending..." : "Send Message"}
            </Button>
          </form>

          <div className="mt-10 pt-6 border-t border-border">
            <p className="font-semibold text-[1.125rem] mb-3">Or reach us directly:</p>
            <p className="mb-1">
              Email:{" "}
              <a href="mailto:info@hedgefun.fun" className="text-primary hover:underline">
                info@hedgefun.fun
              </a>
            </p>
            <p>Address: 1631 Del Prado Blvd S. #1124, Cape Coral, FL 33990</p>
          </div>
        </div>
      )}

    </div>
    
      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </>
  );
}
