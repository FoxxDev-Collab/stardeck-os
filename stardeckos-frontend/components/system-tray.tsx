"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSettings } from "@/lib/settings-context";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Cpu, Database, HardDrive, Wifi, WifiOff, ArrowRight, Activity } from "lucide-react";

interface SystemResources {
  cpu: {
    usage_percent: number;
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    available: number;
    cached: number;
    buffers: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface TrayItemProps {
  icon: React.ReactNode;
  value: string;
  percentage?: number;
  color?: string;
}

function TrayItemDisplay({ icon, value, percentage, color = "bg-accent" }: TrayItemProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/10 transition-colors cursor-pointer group">
      <div className="text-muted-foreground group-hover:text-accent transition-colors">
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-mono text-foreground leading-none">{value}</span>
        {percentage !== undefined && (
          <div className="w-12 h-1 bg-muted rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full ${color} transition-all duration-300`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface PopoverDetailRowProps {
  label: string;
  value: string;
  highlight?: boolean;
}

function PopoverDetailRow({ label, value, highlight }: PopoverDetailRowProps) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-mono ${highlight ? "text-accent font-semibold" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

export function SystemTray() {
  const { token } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  const fetchResources = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch("/api/system/resources", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to fetch");

      const data = await res.json();
      setResources(data);
      setIsConnected(true);
    } catch {
      setIsConnected(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchResources();
      const intervalMs = settings.tray.refreshInterval * 1000;
      const interval = setInterval(fetchResources, intervalMs);
      return () => clearInterval(interval);
    }
  }, [token, fetchResources, settings.tray.refreshInterval]);

  const cpuUsage = resources?.cpu.usage_percent ?? 0;
  const cpuCores = resources?.cpu.cores ?? 0;
  const memUsed = resources?.memory.used ?? 0;
  const memTotal = resources?.memory.total ?? 1;
  const memFree = resources?.memory.free ?? 0;
  const memAvailable = resources?.memory.available ?? 0;
  const memCached = resources?.memory.cached ?? 0;
  const memPercent = (memUsed / memTotal) * 100;
  const diskUsed = resources?.disk.used ?? 0;
  const diskTotal = resources?.disk.total ?? 1;
  const diskFree = resources?.disk.free ?? 0;
  const diskPercent = (diskUsed / diskTotal) * 100;

  const { showCpu, showMemory, showDisk, showNetwork } = settings.tray;
  const hasAnyMetric = showCpu || showMemory || showDisk || showNetwork;

  if (!hasAnyMetric) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 border-l border-border/50 pl-3 ml-2">
      {/* Connection status */}
      {showNetwork && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="px-2 py-1 rounded hover:bg-accent/10 transition-colors">
              {isConnected ? (
                <Wifi className="w-3.5 h-3.5 text-primary" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-destructive" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <Wifi className="w-4 h-4 text-primary" />
                ) : (
                  <WifiOff className="w-4 h-4 text-destructive" />
                )}
                <span className="font-medium text-sm">
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {isConnected
                  ? "System monitoring is active and receiving data."
                  : "Unable to connect to the backend server."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => router.push("/network-manager")}
              >
                Network Manager
                <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {showNetwork && (showCpu || showMemory || showDisk) && (
        <div className="h-4 w-px bg-border/50" />
      )}

      {/* CPU */}
      {showCpu && (
        <Popover>
          <PopoverTrigger asChild>
            <button>
              <TrayItemDisplay
                icon={<Cpu className="w-3.5 h-3.5" />}
                value={`${cpuUsage.toFixed(0)}%`}
                percentage={cpuUsage}
                color="bg-chart-3"
              />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-chart-3" />
                  <span className="font-medium text-sm">CPU Usage</span>
                </div>
                <span className="text-2xl font-bold text-chart-3">{cpuUsage.toFixed(1)}%</span>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-chart-3 transition-all duration-300"
                  style={{ width: `${Math.min(cpuUsage, 100)}%` }}
                />
              </div>

              <div className="border-t border-border pt-2 space-y-1">
                <PopoverDetailRow label="Cores" value={`${cpuCores}`} />
                <PopoverDetailRow label="Usage" value={`${cpuUsage.toFixed(1)}%`} highlight />
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => router.push("/process-manager")}
              >
                <Activity className="w-3 h-3" />
                View Processes
                <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Memory */}
      {showMemory && (
        <Popover>
          <PopoverTrigger asChild>
            <button>
              <TrayItemDisplay
                icon={<Database className="w-3.5 h-3.5" />}
                value={`${formatBytes(memUsed)}/${formatBytes(memTotal)}`}
                percentage={memPercent}
                color="bg-chart-4"
              />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-chart-4" />
                  <span className="font-medium text-sm">Memory Usage</span>
                </div>
                <span className="text-2xl font-bold text-chart-4">{memPercent.toFixed(1)}%</span>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-chart-4 transition-all duration-300"
                  style={{ width: `${Math.min(memPercent, 100)}%` }}
                />
              </div>

              <div className="border-t border-border pt-2 space-y-1">
                <PopoverDetailRow label="Total" value={formatBytes(memTotal)} />
                <PopoverDetailRow label="Used" value={formatBytes(memUsed)} highlight />
                <PopoverDetailRow label="Free" value={formatBytes(memFree)} />
                <PopoverDetailRow label="Available" value={formatBytes(memAvailable)} />
                {memCached > 0 && (
                  <PopoverDetailRow label="Cached" value={formatBytes(memCached)} />
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => router.push("/process-manager")}
              >
                <Activity className="w-3 h-3" />
                View Processes
                <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Disk */}
      {showDisk && (
        <Popover>
          <PopoverTrigger asChild>
            <button>
              <TrayItemDisplay
                icon={<HardDrive className="w-3.5 h-3.5" />}
                value={`${diskPercent.toFixed(0)}%`}
                percentage={diskPercent}
                color="bg-chart-5"
              />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-chart-5" />
                  <span className="font-medium text-sm">Disk Usage</span>
                </div>
                <span className="text-2xl font-bold text-chart-5">{diskPercent.toFixed(1)}%</span>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-chart-5 transition-all duration-300"
                  style={{ width: `${Math.min(diskPercent, 100)}%` }}
                />
              </div>

              <div className="border-t border-border pt-2 space-y-1">
                <PopoverDetailRow label="Total" value={formatBytes(diskTotal)} />
                <PopoverDetailRow label="Used" value={formatBytes(diskUsed)} highlight />
                <PopoverDetailRow label="Free" value={formatBytes(diskFree)} />
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => router.push("/storage")}
              >
                <HardDrive className="w-3 h-3" />
                Storage Manager
                <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
