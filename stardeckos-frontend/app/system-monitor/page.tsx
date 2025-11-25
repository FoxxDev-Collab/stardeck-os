"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Activity, Cpu, Database, Network, HardDrive, RefreshCw } from "lucide-react";

interface SystemInfo {
  hostname: string;
  os: string;
  kernel: string;
  architecture: string;
  cpu_model: string;
  cpu_cores: number;
  boot_time: string;
  ip: string;
}

interface SystemResources {
  cpu: {
    usage_percent: number;
    cores: number;
    model: string;
    per_core: number[];
  };
  memory: {
    total: number;
    used: number;
    available: number;
    cached: number;
  };
  disk: {
    total: number;
    used: number;
    available: number;
  };
  network: {
    bytes_recv: number;
    bytes_sent: number;
    packets_recv: number;
    packets_sent: number;
  };
  load_avg: {
    load_1: number;
    load_5: number;
    load_15: number;
  };
  uptime: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatBytesPerSec(bytes: number): string {
  if (bytes === 0) return "0 B/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function SystemMonitorPage() {
  const { isAuthenticated, isLoading, token } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track previous network values for rate calculation
  const prevNetworkRef = useRef<{ recv: number; sent: number; time: number } | null>(null);
  const [networkRate, setNetworkRate] = useState<{ recv: number; sent: number }>({ recv: 0, sent: 0 });

  const fetchData = useCallback(async () => {
    if (!token) return;

    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [infoRes, resourcesRes] = await Promise.all([
        fetch("/api/system/info", { headers }),
        fetch("/api/system/resources", { headers }),
      ]);

      if (!infoRes.ok || !resourcesRes.ok) {
        throw new Error("Failed to fetch system data");
      }

      const [info, res] = await Promise.all([
        infoRes.json(),
        resourcesRes.json(),
      ]);

      setSystemInfo(info);
      setResources(res);
      setError(null);

      // Calculate network rate
      const now = Date.now();
      if (prevNetworkRef.current) {
        const timeDiff = (now - prevNetworkRef.current.time) / 1000; // seconds
        if (timeDiff > 0) {
          const recvRate = (res.network.bytes_recv - prevNetworkRef.current.recv) / timeDiff;
          const sentRate = (res.network.bytes_sent - prevNetworkRef.current.sent) / timeDiff;
          setNetworkRate({
            recv: Math.max(0, recvRate),
            sent: Math.max(0, sentRate),
          });
        }
      }
      prevNetworkRef.current = {
        recv: res.network.bytes_recv,
        sent: res.network.bytes_sent,
        time: now,
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoadingData(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch system data
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchData();
      // Refresh every 2 seconds for more responsive monitoring
      const interval = setInterval(fetchData, 2000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, token, fetchData]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Activity className="w-12 h-12 text-accent animate-pulse" />
      </div>
    );
  }

  const cpuUsage = resources?.cpu.usage_percent ?? 0;
  const cpuCores = resources?.cpu.per_core ?? [];
  const memoryUsed = resources?.memory.used ?? 0;
  const memoryTotal = resources?.memory.total ?? 1;
  const memoryCached = resources?.memory.cached ?? 0;
  const diskUsed = resources?.disk.used ?? 0;
  const diskTotal = resources?.disk.total ?? 1;
  const uptime = resources?.uptime ?? 0;

  return (
    <DashboardLayout title="SYSTEM MONITOR" time={time}>
      <div className="p-6 space-y-6">
        {/* Error message */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                CPU Usage
              </CardTitle>
              <Cpu className="w-4 h-4 text-chart-3" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{cpuUsage.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                {resources?.cpu.cores ?? 0} cores
              </p>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-chart-3 transition-all duration-300"
                  style={{ width: `${Math.min(cpuUsage, 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Memory Usage
              </CardTitle>
              <Database className="w-4 h-4 text-chart-4" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {((memoryUsed / memoryTotal) * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatBytes(memoryUsed)} / {formatBytes(memoryTotal)}
              </p>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-chart-4 transition-all duration-300"
                  style={{ width: `${(memoryUsed / memoryTotal) * 100}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Network I/O
              </CardTitle>
              <Network className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatBytesPerSec(networkRate.recv + networkRate.sent)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                ↑ {formatBytesPerSec(networkRate.sent)} ↓ {formatBytesPerSec(networkRate.recv)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Total: {formatBytes(resources?.network.bytes_recv ?? 0)} / {formatBytes(resources?.network.bytes_sent ?? 0)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Disk Usage
              </CardTitle>
              <HardDrive className="w-4 h-4 text-chart-5" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {((diskUsed / diskTotal) * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatBytes(diskUsed)} / {formatBytes(diskTotal)}
              </p>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-chart-5 transition-all duration-300"
                  style={{ width: `${(diskUsed / diskTotal) * 100}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CPU Cores */}
        <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-chart-3" />
              CPU Cores
              {loadingData && (
                <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin ml-auto" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cpuCores.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {cpuCores.map((usage, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Core {index}</span>
                      <span className="font-mono text-foreground">{usage.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-chart-3 transition-all duration-300"
                        style={{ width: `${Math.min(usage, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Activity className="w-8 h-8 text-accent animate-pulse" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-accent" />
                System Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              {systemInfo ? (
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Hostname</dt>
                    <dd className="font-mono text-foreground">{systemInfo.hostname}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">OS</dt>
                    <dd className="font-mono text-foreground">{systemInfo.os}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Kernel</dt>
                    <dd className="font-mono text-foreground">{systemInfo.kernel}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Architecture</dt>
                    <dd className="font-mono text-foreground">{systemInfo.architecture}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">IP Address</dt>
                    <dd className="font-mono text-foreground">{systemInfo.ip}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Uptime</dt>
                    <dd className="font-mono text-foreground">{formatUptime(uptime)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Load Average</dt>
                    <dd className="font-mono text-foreground">
                      {resources?.load_avg.load_1.toFixed(2)}, {resources?.load_avg.load_5.toFixed(2)}, {resources?.load_avg.load_15.toFixed(2)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <Activity className="w-8 h-8 text-accent animate-pulse" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-chart-4" />
                Memory Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground">Total Memory</dt>
                  <dd className="font-mono text-foreground">{formatBytes(memoryTotal)}</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground">Used Memory</dt>
                  <dd className="font-mono text-chart-4">{formatBytes(memoryUsed)}</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground">Available</dt>
                  <dd className="font-mono text-primary">{formatBytes(resources?.memory.available ?? 0)}</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground">Cached</dt>
                  <dd className="font-mono text-foreground">{formatBytes(memoryCached)}</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground">Usage</dt>
                  <dd className="font-mono text-foreground">
                    {((memoryUsed / memoryTotal) * 100).toFixed(1)}%
                  </dd>
                </div>
              </dl>
              <div className="mt-4 h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-chart-4 transition-all duration-300"
                  style={{ width: `${(memoryUsed / memoryTotal) * 100}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CPU Model Info */}
        {systemInfo?.cpu_model && (
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-chart-3" />
                Processor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                <p className="font-mono text-foreground">{systemInfo.cpu_model}</p>
                <p className="text-muted-foreground mt-1">
                  {systemInfo.cpu_cores} cores • Current usage: {cpuUsage.toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
