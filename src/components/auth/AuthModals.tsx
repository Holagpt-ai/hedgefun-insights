import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

import { trackEvent } from "@/lib/analytics";
import { toast } from "@/hooks/use-toast";

interface AuthModalsProps {
  mode: "login" | "signup" | null;
  onClose: () => void;
  onSwitch: (mode: "login" | "signup") => void;
}

export function AuthModals({ mode, onClose, onSwitch }: AuthModalsProps) {
  return (
    <>
      <Dialog open={mode === "signup"} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create Account</DialogTitle>
            <DialogDescription>Join HedgeFun to track stocks and get AI insights.</DialogDescription>
          </DialogHeader>
          <SignUpForm onSuccess={onClose} onSwitchToLogin={() => onSwitch("login")} />
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "login"} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Log In</DialogTitle>
            <DialogDescription>Welcome back to HedgeFun.</DialogDescription>
          </DialogHeader>
          <LoginForm onSuccess={onClose} onSwitchToSignup={() => onSwitch("signup")} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function SignUpForm({ onSuccess, onSwitchToLogin }: { onSuccess: () => void; onSwitchToLogin: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      trackEvent("signup_complete");
      toast({ title: "Check your email to confirm your account." });
      onSuccess();
    }
  };

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://www.hedgefun.fun',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
        skipBrowserRedirect: false,
      },
    });
    if (error) toast({ title: error.message, variant: "destructive" });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signup-name">Full Name</Label>
        <Input id="signup-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-pw">Password</Label>
        <Input id="signup-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-confirm">Confirm Password</Label>
        <Input id="signup-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground" disabled={loading}>
        {loading ? "Creating..." : "Create Account"}
      </Button>
      <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
        <GoogleIcon /> Or sign up with Google
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <button type="button" onClick={onSwitchToLogin} className="text-accent-blue hover:underline">
          Log In
        </button>
      </p>
    </form>
  );
}

function LoginForm({ onSuccess, onSwitchToSignup }: { onSuccess: () => void; onSwitchToSignup: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      trackEvent("login_success");
      onSuccess();
    }
  };

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://www.hedgefun.fun',
      },
    });
    if (error) toast({ title: error.message, variant: "destructive" });
  };

  const handleForgot = async () => {
    if (!email) {
      toast({ title: "Enter your email first", variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast({ title: error.message, variant: "destructive" });
    else toast({ title: "Password reset email sent." });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-pw">Password</Label>
          <button type="button" onClick={handleForgot} className="text-xs text-accent-blue hover:underline">
            Forgot password?
          </button>
        </div>
        <Input id="login-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground" disabled={loading}>
        {loading ? "Logging in..." : "Log In"}
      </Button>
      <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
        <GoogleIcon /> Or sign in with Google
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Don't have an account?{" "}
        <button type="button" onClick={onSwitchToSignup} className="text-accent-blue hover:underline">
          Sign Up
        </button>
      </p>
    </form>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
