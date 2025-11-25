"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Monitor, Cpu, HardDrive, Network, Settings, Users, Package, Activity } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DesktopPage() {
  const [time, setTime] = useState<string>("");
  const [date, setDate] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour12: false }));
      setDate(now.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Using theme colors: accent, primary, destructive, and chart-1 through chart-5
  const desktopApps = [
    { name: "System Monitor", icon: Activity, color: "text-accent" },
    { name: "Process Manager", icon: Cpu, color: "text-primary" },
    { name: "Storage", icon: HardDrive, color: "text-chart-3" },
    { name: "Network", icon: Network, color: "text-chart-4" },
    { name: "Services", icon: Settings, color: "text-chart-5" },
    { name: "Users", icon: Users, color: "text-chart-2" },
    { name: "Updates", icon: Package, color: "text-chart-1" },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
      {/* Animated background grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'linear-gradient(to right, hsl(var(--border) / 0.1) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      {/* Glow effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[128px] animate-pulse" style={{ animationDuration: '4s' }} />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-primary/20 rounded-full blur-[96px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />

      {/* Top bar */}
      <header className="relative z-10 h-12 bg-card/60 backdrop-blur-md border-b border-border/50 flex items-center justify-between px-6 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative w-6 h-6">
              <div className="absolute inset-0 border-2 border-accent rounded rotate-45 flex items-center justify-center shadow-[0_0_10px_rgba(112,187,179,0.5)]">
                <span className="text-[10px] font-bold text-accent -rotate-45 tracking-tighter">SD</span>
              </div>
              <div className="absolute inset-0 border-2 border-accent/30 rounded rotate-45 blur-sm" />
            </div>
            <span className="text-sm font-bold tracking-widest text-foreground">STARDECK</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <ThemeToggle />
          <span className="tracking-wider">{date}</span>
          <span className="font-mono text-accent">{time}</span>
        </div>
      </header>

      {/* Desktop area */}
      <main className="relative z-10 flex-1 p-6">
        {/* Desktop icons grid */}
        <div className="grid grid-cols-6 gap-4 max-w-4xl">
          {desktopApps.map((app) => (
            <button
              key={app.name}
              className="group flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-accent/10 transition-all duration-200"
            >
              <div className="w-16 h-16 rounded-lg bg-card/60 backdrop-blur-sm border border-border/50 flex items-center justify-center group-hover:border-accent group-hover:shadow-[0_0_15px_rgba(112,187,179,0.3)] transition-all duration-200">
                <app.icon className={`w-8 h-8 ${app.color} group-hover:scale-110 transition-transform duration-200`} />
              </div>
              <span className="text-xs text-center text-muted-foreground group-hover:text-accent transition-colors duration-200 font-medium">
                {app.name}
              </span>
            </button>
          ))}
        </div>

        {/* Center welcome message */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center pointer-events-auto space-y-4">
            <div className="relative inline-block">
              <Monitor className="w-20 h-20 mx-auto text-accent drop-shadow-[0_0_20px_rgba(112,187,179,0.5)]" />
              <div className="absolute inset-0 w-20 h-20 mx-auto">
                <div className="absolute inset-0 bg-accent/20 rounded-full blur-xl" />
              </div>
            </div>
            <h1 className="text-4xl font-bold tracking-[0.3em] mb-2 bg-gradient-to-r from-foreground via-accent to-foreground bg-clip-text text-transparent">STARDECK</h1>
            <p className="text-sm text-muted-foreground tracking-wider">
              <span className="text-accent font-mono">&gt;</span> Server Management Desktop <span className="text-primary">{"//"} Phase 1</span>
            </p>
            <div className="pt-4">
              <Link href="/login">
                <Button 
                  variant="outline" 
                  className="border-2 border-accent/70 hover:bg-accent hover:text-accent-foreground hover:shadow-[0_0_20px_rgba(112,187,179,0.4)] transition-all duration-300 font-semibold tracking-wider px-8"
                >
                  INITIALIZE SESSION
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom dock */}
      <footer className="relative z-10 h-16 bg-card/60 backdrop-blur-md border-t border-border/50 flex items-center justify-center px-4 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-3 px-5 py-2 bg-background/40 rounded-xl border border-border/50 backdrop-blur-sm shadow-lg">
          {desktopApps.slice(0, 5).map((app) => (
            <button
              key={app.name}
              className="w-12 h-12 rounded-lg bg-card/60 border border-border/50 flex items-center justify-center hover:border-accent hover:bg-accent/10 hover:shadow-[0_0_10px_rgba(112,187,179,0.3)] transition-all duration-200 hover:scale-110"
              title={app.name}
            >
              <app.icon className={`w-6 h-6 ${app.color}`} />
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
