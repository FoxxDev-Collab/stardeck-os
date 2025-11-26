"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, User, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const success = await login(username, password);

      if (success) {
        toast.success("Authentication successful", {
          description: "Welcome aboard, Commander.",
        });
        router.push("/dashboard");
      } else {
        toast.error("Authentication failed", {
          description: "Invalid username or password",
        });
      }
    } catch (err) {
      toast.error("Connection error", {
        description: err instanceof Error ? err.message : "Login failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
      {/* Animated background grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'linear-gradient(to right, hsl(var(--border) / 0.15) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.15) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      {/* Scan line effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/10 to-transparent h-[200%] animate-[scan_8s_linear_infinite]" />
      </div>

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[128px]" style={{ animation: 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-primary/20 rounded-full blur-[96px]" style={{ animation: 'pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite', animationDelay: '1s' }} />

      {/* Main content */}
      <div className="relative z-10 w-full max-w-md px-4">
        {/* Theme toggle - top right */}
        <div className="absolute top-0 right-4">
          <ThemeToggle />
        </div>

        {/* Logo section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-6">
            <div className="relative">
              {/* Outer ring */}
              <div className="w-24 h-24 border-2 border-accent rounded-lg rotate-45 flex items-center justify-center shadow-[0_0_30px_rgba(112,187,179,0.4)]">
                <div className="w-16 h-16 border-2 border-accent/60 rounded-md flex items-center justify-center -rotate-45 bg-accent/5">
                  <span className="text-3xl font-bold text-accent tracking-tighter drop-shadow-[0_0_10px_rgba(112,187,179,0.8)]">SD</span>
                </div>
              </div>
              {/* Glow effect */}
              <div className="absolute inset-0 w-24 h-24 border-2 border-accent rounded-lg rotate-45 blur-md opacity-60" />
              <div className="absolute inset-0 w-24 h-24 bg-accent/10 rounded-lg rotate-45 blur-2xl" />
            </div>
          </div>

          <h1 className="text-4xl font-bold tracking-[0.3em] text-foreground mb-2 drop-shadow-[0_0_20px_rgba(112,187,179,0.3)]">
            STARDECK
          </h1>
          <p className="text-sm text-muted-foreground tracking-widest uppercase font-medium">
            Server Management System
          </p>

          {/* Version tag */}
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 bg-accent/10 border border-accent/40 rounded-md text-xs text-accent font-mono shadow-[0_0_15px_rgba(112,187,179,0.2)]">
            <span className="w-2 h-2 bg-accent rounded-full shadow-[0_0_6px_rgba(112,187,179,0.8)]" style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
            <span className="tracking-wider">v1.0.0 <span className="text-primary">{"//"} PHASE 1</span></span>
          </div>
        </div>

        {/* Login card */}
        <Card className="border-2 border-border/60 bg-card/70 backdrop-blur-md shadow-2xl shadow-accent/10">
          <CardContent className="pt-6">
            {/* Terminal header */}
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border/50">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(163,208,84,0.6)]" />
                <div className="w-3 h-3 rounded-full bg-accent shadow-[0_0_8px_rgba(112,187,179,0.6)]" />
              </div>
              <span className="text-xs text-muted-foreground ml-3 tracking-widest font-mono">
                <span className="text-accent">&gt;</span> AUTHENTICATION REQUIRED
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username field */}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs tracking-wider uppercase text-muted-foreground">
                  Username
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    className="pl-10 bg-input/80 border-border/60 focus:border-accent focus:ring-2 focus:ring-accent/30 focus:shadow-[0_0_15px_rgba(112,187,179,0.2)] transition-all duration-200"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs tracking-wider uppercase text-muted-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="pl-10 bg-input/80 border-border/60 focus:border-accent focus:ring-2 focus:ring-accent/30 focus:shadow-[0_0_15px_rgba(112,187,179,0.2)] transition-all duration-200"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Submit button */}
              <Button
                type="submit"
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(112,187,179,0.3)] hover:shadow-[0_0_30px_rgba(112,187,179,0.5)] transition-all duration-300 border border-accent/20 h-11"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <span className="text-accent-foreground/80 mr-2">&gt;</span>
                    Initialize Session
                  </>
                )}
              </Button>
            </form>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-border/50">
              <p className="text-xs text-center text-muted-foreground font-mono">
                <span className="text-accent">&gt;</span> Secure connection established <span className="inline-block w-1.5 h-1.5 bg-accent rounded-full ml-2 shadow-[0_0_4px_rgba(112,187,179,0.8)]" style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
              </p>
            </div>
          </CardContent>
        </Card>

        {/* System info footer */}
        <div className="mt-6 text-center space-y-3">
          <p className="text-xs text-muted-foreground/60 tracking-wider">
            ROCKY LINUX 10 // ENTERPRISE EDITION
          </p>

          {/* Login info */}
          <div className="p-3 bg-accent/5 border border-accent/20 rounded-lg">
            <p className="text-xs text-muted-foreground mb-2">
              <span className="text-accent font-bold">AUTH</span> - Login with:
            </p>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex items-center justify-center gap-2">
                <span className="text-muted-foreground">Local account</span>
                <span className="text-accent">or</span>
                <span className="text-muted-foreground">Linux system user</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
