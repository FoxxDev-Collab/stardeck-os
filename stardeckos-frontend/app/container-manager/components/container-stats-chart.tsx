"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Activity, Cpu, MemoryStick, Network, HardDrive, Loader2, AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ContainerStats {
  cpu_percent: number;
  memory_used: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
  block_read: number;
  block_write: number;
  pids: number;
}

interface StatsHistory {
  cpu: number[];
  memory: number[];
}

interface ContainerStatsChartProps {
  containerId: string;
  isRunning: boolean;
}

export function ContainerStatsChart({ containerId, isRunning }: ContainerStatsChartProps) {
  const { token } = useAuth();
  const [statsHistory, setStatsHistory] = useState<StatsHistory>({
    cpu: [],
    memory: [],
  });
  const [currentStats, setCurrentStats] = useState<ContainerStats | null>(null);
  const [prevStats, setPrevStats] = useState<ContainerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const maxDataPoints = 30;

  const fetchStats = useCallback(async () => {
    if (!token || !containerId || !isRunning) return;

    try {
      const response = await fetch(`/api/containers/${containerId}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to fetch stats");

      const stats: ContainerStats = await response.json();
      // Use functional updates to avoid stale closure issues
      setCurrentStats((prev) => {
        setPrevStats(prev);
        return stats;
      });
      setError(null);

      // Add to history
      setStatsHistory((prev) => ({
        cpu: [...prev.cpu, stats.cpu_percent].slice(-maxDataPoints),
        memory: [...prev.memory, stats.memory_percent].slice(-maxDataPoints),
      }));

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch stats");
      setLoading(false);
    }
  }, [token, containerId, isRunning]); // Removed currentStats to prevent infinite loop

  useEffect(() => {
    if (!isRunning) {
      setStatsHistory({ cpu: [], memory: [] });
      setCurrentStats(null);
      setPrevStats(null);
      setLoading(false);
      return;
    }

    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, [isRunning, fetchStats]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getTrend = (current: number, previous: number | undefined) => {
    if (previous === undefined) return "stable";
    const diff = current - previous;
    if (Math.abs(diff) < 0.5) return "stable";
    return diff > 0 ? "up" : "down";
  };

  const TrendIcon = ({ trend }: { trend: string }) => {
    switch (trend) {
      case "up":
        return <TrendingUp className="w-3 h-3 text-red-500" />;
      case "down":
        return <TrendingDown className="w-3 h-3 text-green-500" />;
      default:
        return <Minus className="w-3 h-3 text-muted-foreground" />;
    }
  };

  // Simple SVG sparkline component
  const Sparkline = ({ data, color = "#06b6d4" }: { data: number[]; color?: string }) => {
    if (data.length < 2) return null;

    const width = 120;
    const height = 24;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    }).join(" ");

    return (
      <svg width={width} height={height} className="opacity-60">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          points={points}
        />
      </svg>
    );
  };

  if (!isRunning) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Activity className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">Container is not running</p>
        </CardContent>
      </Card>
    );
  }

  if (loading && !currentStats) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!currentStats) return null;

  const cpuTrend = getTrend(currentStats.cpu_percent, prevStats?.cpu_percent);
  const memoryTrend = getTrend(currentStats.memory_percent, prevStats?.memory_percent);

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent" />
          Real-time Performance
        </CardTitle>
        <CardDescription>Live container resource usage</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* CPU Stats */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
                <Cpu className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">CPU Usage</span>
                  <TrendIcon trend={cpuTrend} />
                </div>
                <div className="text-2xl font-bold text-cyan-400">
                  {currentStats.cpu_percent.toFixed(1)}%
                </div>
              </div>
            </div>
            {statsHistory.cpu.length > 1 && (
              <Sparkline data={statsHistory.cpu} color="#06b6d4" />
            )}
          </div>
          <Progress 
            value={Math.min(currentStats.cpu_percent, 100)} 
            className="h-2"
          />
        </div>

        {/* Memory Stats */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
                <MemoryStick className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Memory Usage</span>
                  <TrendIcon trend={memoryTrend} />
                </div>
                <div className="text-2xl font-bold text-purple-400">
                  {currentStats.memory_percent.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(currentStats.memory_used)} / {formatBytes(currentStats.memory_limit)}
                </div>
              </div>
            </div>
            {statsHistory.memory.length > 1 && (
              <Sparkline data={statsHistory.memory} color="#a855f7" />
            )}
          </div>
          <Progress 
            value={Math.min(currentStats.memory_percent, 100)} 
            className="h-2"
          />
        </div>

        {/* Network & Disk I/O Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border/50">
          {/* Network */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 flex items-center justify-center">
                <Network className="w-4 h-4 text-green-400" />
              </div>
              <span className="text-sm font-medium">Network I/O</span>
            </div>
            <div className="space-y-2 pl-10">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-green-500">↓</span>
                  <span>Received</span>
                </div>
                <span className="font-mono text-green-400">{formatBytes(currentStats.network_rx)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-blue-500">↑</span>
                  <span>Transmitted</span>
                </div>
                <span className="font-mono text-blue-400">{formatBytes(currentStats.network_tx)}</span>
              </div>
            </div>
          </div>

          {/* Disk I/O */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
                <HardDrive className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-sm font-medium">Disk I/O</span>
            </div>
            <div className="space-y-2 pl-10">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-amber-500">R</span>
                  <span>Read</span>
                </div>
                <span className="font-mono text-amber-400">{formatBytes(currentStats.block_read)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-orange-500">W</span>
                  <span>Write</span>
                </div>
                <span className="font-mono text-orange-400">{formatBytes(currentStats.block_write)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Process Info */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <span className="text-sm text-muted-foreground">Active Processes</span>
          <Badge variant="outline" className="font-mono">
            {currentStats.pids} PIDs
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
