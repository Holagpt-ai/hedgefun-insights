import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface AdBannerProps {
  slot?: "top" | "bottom" | "sidebar";
  className?: string;
}

export function AdBanner({ slot = "top", className = "" }: AdBannerProps) {
  const { profile } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Hide ads for Pro subscribers
  if (profile?.plan === "pro") return null;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (ref.current && ref.current.innerHTML.trim().length > 0) {
        setLoaded(true);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  if (slot === "sidebar") {
    return (
      <div
        ref={ref}
        className={`flex flex-col items-center ${className}`}
        style={{
          width: 300,
          minHeight: loaded ? 250 : 0,
          height: loaded ? 250 : 0,
          overflow: "hidden",
          transition: "height 0.2s ease, min-height 0.2s ease",
        }}
      >
        {loaded && (
          <p className="text-[0.5rem] text-center uppercase tracking-widest text-muted-foreground mb-0.5">
            Advertisement
          </p>
        )}
        {/* 300x250 Medium Rectangle ad tag here */}
      </div>
    );
  }

  return (
    <div
      className={`w-full flex flex-col items-center justify-center ${className}`}
      style={{
        minHeight: loaded ? "auto" : 0,
        height: loaded ? "auto" : 0,
        overflow: "hidden",
        transition: "height 0.2s ease",
      }}
    >
      {loaded && (
        <p className="text-[0.5rem] text-center uppercase tracking-widest text-muted-foreground py-0.5">
          Advertisement
        </p>
      )}
      <div
        ref={ref}
        className="flex items-center justify-center w-full"
        style={{
          width: "100%",
          maxWidth: 970,
          height: loaded ? undefined : 0,
          minHeight: loaded ? 90 : 0,
        }}
      >
        <div className="w-[320px] h-[50px] md:w-[728px] md:h-[90px] lg:w-[970px] lg:h-[90px] flex items-center justify-center">
          {/* Ad network tag goes here */}
        </div>
      </div>
    </div>
  );
}
