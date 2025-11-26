"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Cpu, HardDrive, Network, Settings, Users, Activity,
  Compass, Zap, Radio, ChevronRight, Server, MemoryStick,
  Thermometer, Clock, Wifi
} from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { SubtleStarfield } from "@/components/subtle-starfield";

// Status row component
function StatusRow({
  label,
  value,
  status
}: {
  label: string;
  value: string;
  status: "nominal" | "warning" | "offline"
}) {
  const statusStyles = {
    nominal: "text-accent",
    warning: "text-primary",
    offline: "text-destructive",
  };

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-xs font-mono ${statusStyles[status]}`}>{value}</span>
    </div>
  );
}

export default function BridgePage() {
  const [time, setTime] = useState<string>("");
  const [stardate, setStardate] = useState<string>("");
  const [bootProgress, setBootProgress] = useState(0);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour12: false }));
      const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
      setStardate(`${now.getFullYear()}.${dayOfYear.toString().padStart(3, '0')}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setBootProgress((prev) => (prev < 100 ? prev + 2 : 100));
    }, 30);
    return () => clearInterval(timer);
  }, []);

  const shipSystems = [
    { name: "REACTOR CORE", icon: Zap, desc: "CPU & Processes", status: "ONLINE" },
    { name: "LIFE SUPPORT", icon: Activity, desc: "System Health", status: "NOMINAL" },
    { name: "HELM CONTROL", icon: Compass, desc: "Process Control", status: "READY" },
    { name: "CARGO BAY", icon: HardDrive, desc: "Storage Systems", status: "SECURE" },
    { name: "COMMS ARRAY", icon: Radio, desc: "Network Status", status: "ACTIVE" },
    { name: "CREW ROSTER", icon: Users, desc: "User Management", status: "LOCKED" },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
      <SubtleStarfield starCount={120} speed={0.1} opacity={0.7} />

      {/* Scanlines overlay */}
      <div className="absolute inset-0 z-[1] pointer-events-none scanlines opacity-50" />

      {/* Ambient glow effects */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] animate-pulse-slow" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[120px] animate-pulse-slow delay-2000" />

      {/* Command bar */}
      <header className="relative z-10 h-14 bg-card/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          {/* Ship emblem */}
          <div className="relative w-9 h-9">
            <svg viewBox="0 0 40 40" className="w-full h-full">
              <polygon
                points="20,2 38,11 38,29 20,38 2,29 2,11"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-accent"
              />
              <polygon
                points="20,8 32,14 32,26 20,32 8,26 8,14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-accent/50"
              />
              <text x="20" y="24" textAnchor="middle" className="text-[10px] font-bold fill-accent">SD</text>
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-[0.3em] text-foreground">STARDECK</span>
            <span className="text-[10px] text-muted-foreground tracking-widest">VESSEL COMMAND SYSTEM</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground tracking-wider">STARDATE</span>
              <span className="font-mono text-accent">{stardate}</span>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground tracking-wider">SHIP TIME</span>
              <span className="font-mono text-primary">{time}</span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main bridge console */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-6xl">
          <div className="grid grid-cols-12 gap-6">

            {/* Left panel - Core Systems (Server Resources) */}
            <div className="col-span-3 space-y-4">
              <Card className="bg-card/60 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold tracking-widest text-muted-foreground flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-accent" />
                    CORE SYSTEMS
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <Separator className="mb-3" />
                  <StatusRow label="System Status" value="OPERATIONAL" status="nominal" />
                  <StatusRow label="Uptime" value="AWAITING" status="nominal" />
                  <StatusRow label="Load Average" value="STANDBY" status="nominal" />
                  <StatusRow label="Services" value="READY" status="nominal" />
                </CardContent>
              </Card>

              <Card className="bg-card/60 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold tracking-widest text-muted-foreground flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                    REACTOR OUTPUT
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Separator className="mb-3" />
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Cpu className="w-3 h-3" /> CPU CORES
                        </span>
                        <span className="text-accent font-mono">IDLE</span>
                      </div>
                      <Progress value={bootProgress} className="h-1.5" />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <MemoryStick className="w-3 h-3" /> MEMORY
                        </span>
                        <span className="text-accent font-mono">STANDBY</span>
                      </div>
                      <Progress value={bootProgress * 0.6} className="h-1.5" />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Thermometer className="w-3 h-3" /> TEMP
                        </span>
                        <span className="text-accent font-mono">NOMINAL</span>
                      </div>
                      <Progress value={35} className="h-1.5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Center panel - Main display */}
            <div className="col-span-6 flex flex-col items-center justify-center">
              {/* Animated emblem */}
              <div className="relative mb-8">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-48 h-48 border border-accent/20 rounded-full animate-[spin_20s_linear_infinite]" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-40 h-40 border border-primary/20 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-32 h-32 border border-accent/30 rounded-full animate-pulse-slow" />
                </div>

                <div className="relative w-48 h-48 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-6xl font-bold tracking-[0.2em] bg-gradient-to-b from-accent via-foreground to-primary bg-clip-text text-transparent">
                      SD
                    </div>
                    <div className="text-[10px] tracking-[0.5em] text-muted-foreground mt-2">COMMAND</div>
                  </div>
                </div>
              </div>

              <h1 className="text-3xl font-bold tracking-[0.4em] mb-2 text-foreground">
                STARDECK
              </h1>
              <p className="text-sm text-muted-foreground tracking-widest mb-1">
                VESSEL MANAGEMENT SYSTEM
              </p>
              <Badge variant="outline" className="mb-8 tracking-wider border-accent/50 text-accent">
                PHASE 2 — OPERATIONAL
              </Badge>

              <Link href="/login">
                <Button
                  variant="outline"
                  size="lg"
                  className="border-2 border-accent/50 bg-accent/5 hover:bg-accent/20 hover:border-accent transition-all duration-300 font-bold tracking-[0.2em] px-10 py-6 group"
                >
                  <span className="flex items-center gap-3">
                    BOARD VESSEL
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Button>
              </Link>

              <p className="text-[10px] text-muted-foreground mt-4 tracking-wider">
                AUTHORIZATION REQUIRED FOR BRIDGE ACCESS
              </p>
            </div>

            {/* Right panel - Ship Systems (Server Modules) */}
            <div className="col-span-3 space-y-4">
              <Card className="bg-card/60 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold tracking-widest text-muted-foreground flex items-center gap-2">
                    <Settings className="w-3.5 h-3.5 text-accent" />
                    SHIP SYSTEMS
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Separator className="mb-3" />
                  <div className="space-y-2">
                    {shipSystems.map((system) => (
                      <div
                        key={system.name}
                        className="flex items-center justify-between py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <system.icon className="w-3 h-3 text-accent/70" />
                          <div className="flex flex-col">
                            <span className="text-[10px] text-foreground uppercase tracking-wider">{system.name}</span>
                            <span className="text-[9px] text-muted-foreground">{system.desc}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-accent/30 text-accent">
                          {system.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/60 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold tracking-widest text-muted-foreground flex items-center gap-2">
                    <Wifi className="w-3.5 h-3.5 text-primary" />
                    NETWORK STATUS
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Separator className="mb-3" />
                  <div className="space-y-2 text-[10px]">
                    <StatusRow label="Signal" value="STRONG" status="nominal" />
                    <StatusRow label="Interfaces" value="READY" status="nominal" />
                    <StatusRow label="Firewall" value="ARMED" status="nominal" />
                    <StatusRow label="DNS" value="RESOLVED" status="nominal" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom status bar */}
      <footer className="relative z-10 h-10 bg-card/80 backdrop-blur-xl border-t border-border flex items-center justify-between px-6 text-[10px]">
        <div className="flex items-center gap-6 text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            SYSTEMS NOMINAL
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            CREW: AWAITING
          </span>
          <span className="flex items-center gap-1">
            <Network className="w-3 h-3" />
            SECTOR: LOCAL-NET
          </span>
        </div>
        <div className="flex items-center gap-6 text-muted-foreground">
          <span>ROCKY LINUX 10</span>
          <span className="text-accent font-mono">STARDECK v2.0</span>
        </div>
      </footer>
    </div>
  );
}
