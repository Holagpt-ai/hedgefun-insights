import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/contexts/ThemeContext";
import type { User } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  profile: { full_name: string | null; plan: string | null; email: string | null; avatar_url: string | null; preferred_theme: string | null } | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthContextValue["profile"]>(null);
  const [loading, setLoading] = useState(true);
  const { setThemeFromProfile } = useTheme();

  useEffect(() => {
    // First: set up the listener BEFORE getting session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setUser(session?.user ?? null);
          setLoading(false);
        }

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
        }

        if (event === 'INITIAL_SESSION') {
          setUser(session?.user ?? null);
          setLoading(false);
        }

        // Clean URL hash after OAuth redirect
        if (window.location.hash && (
          window.location.hash.includes('access_token') ||
          window.location.hash.includes('error')
        )) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    );

    // Second: check for existing session (handles page refresh + OAuth redirect)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) console.error('getSession error:', error);
      
      setUser(session?.user ?? null);
      setLoading(false);

      // Clean URL hash after OAuth redirect
      if (window.location.hash && (
        window.location.hash.includes('access_token') ||
        window.location.hash.includes('error')
      )) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    supabase
      .from("profiles")
      .select("full_name, plan, email, avatar_url, preferred_theme")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        setProfile(data);
        if (data?.preferred_theme) setThemeFromProfile(data.preferred_theme);
      });
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, profile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
