import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

const PUB = "ca-pub-4855396891178044";
const SLOTS = {
  top: "6473449165",
  bottom: "4996715969",
  sidebar: "6521550620",
};

interface AdBannerProps {
  slot?: "top" | "bottom" | "sidebar";
  className?: string;
}

export function AdBanner({ slot = "top", className = "" }: AdBannerProps) {
  const { profile } = useAuth();

  useEffect(() => {
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (e) {
      console.error("AdSense push error:", e);
    }
  }, []);

  if (profile?.plan === "pro" || profile?.plan === "admin" || profile?.plan === "unlimited") return null;

  if (slot === "sidebar") {
    return (
      <div
        className={`flex flex-col items-center ${className}`}
        style={{ width: 300, minHeight: 250 }}
      >
        <p className="text-[0.5rem] text-center uppercase tracking-widest text-muted-foreground mb-0.5">
          Advertisement
        </p>
        <ins
          className="adsbygoogle"
          style={{ display: "inline-block", width: 300, height: 250 }}
          data-ad-client={PUB}
          data-ad-slot={SLOTS.sidebar}
        ></ins>
      </div>
    );
  }

  return (
    <div
      className={`w-full flex flex-col items-center justify-center ${className}`}
    >
      <p className="text-[0.5rem] text-center uppercase tracking-widest text-muted-foreground py-1">
        Advertisement
      </p>
      <div
        className="flex items-center justify-center w-full"
        style={{ width: "100%", maxWidth: 970, minHeight: 90 }}
      >
        <ins
          className="adsbygoogle"
          style={{ display: "block", width: "100%", maxWidth: 970, minHeight: 90 }}
          data-ad-client={PUB}
          data-ad-slot={SLOTS[slot]}
          data-ad-format="auto"
          data-full-width-responsive="true"
        ></ins>
      </div>
    </div>
  );
}
