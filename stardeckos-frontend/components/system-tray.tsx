"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useSettings } from "@/lib/settings-context";
import { Cpu, Database, HardDrive, Wifi, WifiOff } from "lucide-react";

interface SystemResources {
  cpu: {
    usage_percent: number;
    cores: number;
  };
  memory: {
    total: number;
    used: number;
  };
  disk: {
    total: number;
    used: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(0)) + sizes[i];
}

interface TrayItemProps {
  icon: React.ReactNode;
  value: string;
  percentage?: number;
  color?: string;
}

function TrayItem({ icon, value, percentage, color = "bg-accent" }: TrayItemProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/10 transition-colors cursor-default group">
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

export function SystemTray() {
  const { token } = useAuth();
  const { settings } = useSettings();
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
  const memUsed = resources?.memory.used ?? 0;
  const memTotal = resources?.memory.total ?? 1;
  const memPercent = (memUsed / memTotal) * 100;
  const diskUsed = resources?.disk.used ?? 0;
  const diskTotal = resources?.disk.total ?? 1;
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
        <div className="px-2">
          {isConnected ? (
            <Wifi className="w-3.5 h-3.5 text-primary" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-destructive" />
          )}
        </div>
      )}

      {showNetwork && (showCpu || showMemory || showDisk) && (
        <div className="h-4 w-px bg-border/50" />
      )}

      {/* CPU */}
      {showCpu && (
        <TrayItem
          icon={<Cpu className="w-3.5 h-3.5" />}
          value={`${cpuUsage.toFixed(0)}%`}
          percentage={cpuUsage}
          color="bg-chart-3"
        />
      )}

      {/* Memory */}
      {showMemory && (
        <TrayItem
          icon={<Database className="w-3.5 h-3.5" />}
          value={formatBytes(memUsed)}
          percentage={memPercent}
          color="bg-chart-4"
        />
      )}

      {/* Disk */}
      {showDisk && (
        <TrayItem
          icon={<HardDrive className="w-3.5 h-3.5" />}
          value={`${diskPercent.toFixed(0)}%`}
          percentage={diskPercent}
          color="bg-chart-5"
        />
      )}
    </div>
  );
}
