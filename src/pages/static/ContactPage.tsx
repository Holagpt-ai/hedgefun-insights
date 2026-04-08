import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, MapPin, Phone, Mail } from "lucide-react";
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
      <div className="max-w-[1100px] mx-auto px-6 py-12">
        <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-8">
          Contact Us
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ── Left Column: Contact Info + Map ── */}
          <div className="space-y-6">
            <p className="text-foreground leading-relaxed">
              Have a question, feedback, or a partnership inquiry? We'd love to hear from you.
              Reach out using any of the methods below or fill out the form.
            </p>

            {/* Contact Details */}
            <div className="space-y-4">
              <Card className="border border-border">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="shrink-0 rounded-md bg-primary/10 p-2 mt-0.5">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">Address</p>
                    <p className="text-sm text-muted-foreground">
                      1631 Del Prado Blvd.<br />
                      Cape Coral, FL 33990
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="shrink-0 rounded-md bg-primary/10 p-2 mt-0.5">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">Phone</p>
                    <a href="tel:+12392050449" className="text-sm text-primary hover:underline">
                      (239) 205-0449
                    </a>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="shrink-0 rounded-md bg-primary/10 p-2 mt-0.5">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">Email</p>
                    <a href="mailto:info@hedgefun.fun" className="text-sm text-primary hover:underline">
                      info@hedgefun.fun
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Google Map */}
            <div className="rounded-lg overflow-hidden border border-border">
              <iframe
                title="HedgeFun Office Location — Cape Coral, FL"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3580.4!2d-81.9495!3d26.5629!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x88db427a09fb1c25%3A0x0!2s1631+Del+Prado+Blvd+S+Cape+Coral+FL+33990!5e0!3m2!1sen!2sus!4v1680000000000"
                width="100%"
                height="260"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full"
              />
            </div>
          </div>

          {/* ── Right Column: Form ── */}
          <div>
            <Card className="border border-border">
              <CardContent className="p-6">
                <h2 className="text-lg font-bold text-foreground mb-1">Send Us a Message</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  We typically respond within 1–2 business days.
                </p>

                {status === "success" ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle className="h-12 w-12 text-emerald-500 mb-4" />
                    <p className="text-lg font-medium text-emerald-600 dark:text-emerald-400">
                      Message sent! We'll be in touch soon.
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
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </>
  );
}
