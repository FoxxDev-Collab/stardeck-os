"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  Activity,
  ListChecks,
  Search,
  XCircle,
  AlertCircle,
  Cpu,
  Database,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Gauge
} from "lucide-react";

interface Process {
  pid: number;
  ppid: number;
  name: string;
  user: string;
  cpu_percent: number;
  memory_bytes: number;
  memory_mb: number;
  command: string;
  state: string;
  threads: number;
  start_time: number;
}

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
  };
  load_avg: {
    load_1: number;
    load_5: number;
    load_15: number;
  };
  uptime: number;
}

type SortField = "pid" | "name" | "user" | "cpu" | "memory" | "state";
type SortDirection = "asc" | "desc";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function ProgressBar({ value, max, color, showLabel = false }: { value: number; max: number; color: string; showLabel?: boolean }) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && <span className="text-xs font-mono w-12 text-right">{percent.toFixed(0)}%</span>}
    </div>
  );
}

export default function ProcessManagerPage() {
  const { isAuthenticated, isLoading, token, user } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");

  // Check if user has permission (operator or admin)
  const hasPermission = user?.role === "admin" || user?.role === "operator" || user?.is_pam_admin;
  const [processes, setProcesses] = useState<Process[]>([]);
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("cpu");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;

    try {
      const [procRes, resRes] = await Promise.all([
        fetch("/api/processes", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/system/resources", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ]);

      if (!procRes.ok) throw new Error("Failed to fetch processes");

      const procData = await procRes.json();
      setProcesses(Array.isArray(procData) ? procData : []);

      if (resRes.ok) {
        const resData = await resRes.json();
        setResources(resData);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    }
  }, [token]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    } else if (!isLoading && isAuthenticated && !hasPermission) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, hasPermission, router]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchData();
      const interval = setInterval(fetchData, 3000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, token, fetchData]);

  if (isLoading || !isAuthenticated || !hasPermission) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Activity className="w-12 h-12 text-accent animate-pulse" />
      </div>
    );
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "pid" ? "asc" : "desc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortDirection === "asc"
      ? <ArrowUp className="w-3 h-3 ml-1 text-accent" />
      : <ArrowDown className="w-3 h-3 ml-1 text-accent" />;
  };

  const filteredProcesses = processes
    .filter((p) =>
      p.command.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.pid.toString().includes(searchTerm)
    )
    .sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      switch (sortField) {
        case "cpu": return (b.cpu_percent - a.cpu_percent) * dir;
        case "memory": return (b.memory_mb - a.memory_mb) * dir;
        case "pid": return (a.pid - b.pid) * dir;
        case "name": return a.name.localeCompare(b.name) * dir;
        case "user": return a.user.localeCompare(b.user) * dir;
        case "state": return a.state.localeCompare(b.state) * dir;
        default: return 0;
      }
    });

  const runningCount = processes.filter((p) => p.state === "R").length;
  const sleepingCount = processes.filter((p) => p.state === "S").length;
  const zombieCount = processes.filter((p) => p.state === "Z").length;

  const cpuCores = resources?.cpu.cores ?? 0;
  const cpuUsage = resources?.cpu.usage_percent ?? 0;
  const memTotal = resources?.memory.total ?? 0;
  const memUsed = resources?.memory.used ?? 0;
  const memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
  const loadAvg = resources?.load_avg;
  const uptime = resources?.uptime ?? 0;

  const handleKillProcess = async (pid: number, name: string) => {
    if (!confirm(`Kill process ${name} (PID: ${pid})?`)) return;

    try {
      const response = await fetch(`/api/processes/${pid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to kill process");
      }

      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to kill process");
    }
  };

  return (
    <DashboardLayout title="PROCESS MANAGER" time={time}>
      <div className="p-6 space-y-6">
        {/* Error message */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* System Overview - Top Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {/* CPU Cores */}
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <Cpu className="w-4 h-4 text-chart-3" />
                <span className="text-2xl font-bold">{cpuCores}</span>
              </div>
              <p className="text-xs text-muted-foreground">CPU Cores</p>
            </CardContent>
          </Card>

          {/* CPU Usage */}
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <Gauge className="w-4 h-4 text-chart-3" />
                <span className="text-2xl font-bold">{cpuUsage.toFixed(1)}%</span>
              </div>
              <ProgressBar value={cpuUsage} max={100} color="bg-chart-3" />
              <p className="text-xs text-muted-foreground mt-1">CPU Usage</p>
            </CardContent>
          </Card>

          {/* Memory */}
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <Database className="w-4 h-4 text-chart-4" />
                <span className="text-2xl font-bold">{formatBytes(memTotal)}</span>
              </div>
              <ProgressBar value={memUsed} max={memTotal} color="bg-chart-4" />
              <p className="text-xs text-muted-foreground mt-1">
                {formatBytes(memUsed)} used ({memPercent.toFixed(0)}%)
              </p>
            </CardContent>
          </Card>

          {/* Load Average */}
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <Activity className="w-4 h-4 text-chart-2" />
                <span className="text-lg font-bold font-mono">
                  {loadAvg ? `${loadAvg.load_1.toFixed(2)}` : "—"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Load: {loadAvg ? `${loadAvg.load_1.toFixed(2)} / ${loadAvg.load_5.toFixed(2)} / ${loadAvg.load_15.toFixed(2)}` : "—"}
              </p>
            </CardContent>
          </Card>

          {/* Uptime */}
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-lg font-bold">{formatUptime(uptime)}</span>
              </div>
              <p className="text-xs text-muted-foreground">System Uptime</p>
            </CardContent>
          </Card>

          {/* Process Count */}
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <ListChecks className="w-4 h-4 text-accent" />
                <span className="text-2xl font-bold">{processes.length}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="text-primary">{runningCount}R</span>
                {" / "}
                <span className="text-muted-foreground">{sleepingCount}S</span>
                {zombieCount > 0 && <span className="text-destructive"> / {zombieCount}Z</span>}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Process List */}
        <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-3">
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="w-5 h-5 text-accent" />
                  Process List
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  className="h-8 w-8 p-0"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, command, user, or PID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-input/80 border-border/60"
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Showing {filteredProcesses.length} of {processes.length} processes
              {searchTerm && ` matching "${searchTerm}"`}
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground">
                      <button
                        onClick={() => handleSort("pid")}
                        className="flex items-center hover:text-accent transition-colors"
                      >
                        PID {getSortIcon("pid")}
                      </button>
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground">
                      <button
                        onClick={() => handleSort("name")}
                        className="flex items-center hover:text-accent transition-colors"
                      >
                        NAME {getSortIcon("name")}
                      </button>
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground">
                      <button
                        onClick={() => handleSort("user")}
                        className="flex items-center hover:text-accent transition-colors"
                      >
                        USER {getSortIcon("user")}
                      </button>
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground min-w-[140px]">
                      <button
                        onClick={() => handleSort("cpu")}
                        className="flex items-center hover:text-accent transition-colors"
                      >
                        CPU % {getSortIcon("cpu")}
                      </button>
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground min-w-[140px]">
                      <button
                        onClick={() => handleSort("memory")}
                        className="flex items-center hover:text-accent transition-colors"
                      >
                        MEMORY {getSortIcon("memory")}
                      </button>
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground">
                      <button
                        onClick={() => handleSort("state")}
                        className="flex items-center hover:text-accent transition-colors"
                      >
                        STATE {getSortIcon("state")}
                      </button>
                    </th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground max-w-xs">COMMAND</th>
                    <th className="text-right py-3 px-3 text-xs font-medium text-muted-foreground">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProcesses.slice(0, 100).map((process) => (
                    <tr
                      key={process.pid}
                      className="border-b border-border/30 hover:bg-accent/5 transition-colors group"
                    >
                      <td className="py-2 px-3 font-mono text-sm">{process.pid}</td>
                      <td className="py-2 px-3 text-sm font-medium">{process.name}</td>
                      <td className="py-2 px-3 text-sm text-muted-foreground">{process.user}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                process.cpu_percent > 50 ? "bg-destructive" :
                                process.cpu_percent > 20 ? "bg-chart-2" : "bg-chart-3"
                              }`}
                              style={{ width: `${Math.min(process.cpu_percent, 100)}%` }}
                            />
                          </div>
                          <span className={`font-mono text-sm ${
                            process.cpu_percent > 50 ? "text-destructive" :
                            process.cpu_percent > 20 ? "text-chart-2" : ""
                          }`}>
                            {process.cpu_percent.toFixed(1)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                process.memory_mb > 500 ? "bg-destructive" :
                                process.memory_mb > 200 ? "bg-chart-2" : "bg-chart-4"
                              }`}
                              style={{ width: `${Math.min((process.memory_mb / 1024) * 100, 100)}%` }}
                            />
                          </div>
                          <span className={`font-mono text-sm ${
                            process.memory_mb > 500 ? "text-destructive" :
                            process.memory_mb > 200 ? "text-chart-2" : ""
                          }`}>
                            {process.memory_mb >= 1024
                              ? `${(process.memory_mb / 1024).toFixed(1)}G`
                              : `${process.memory_mb.toFixed(0)}M`}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${
                          process.state === "R" ? "bg-primary/20 text-primary" :
                          process.state === "S" ? "bg-muted text-muted-foreground" :
                          process.state === "D" ? "bg-chart-2/20 text-chart-2" :
                          process.state === "Z" ? "bg-destructive/20 text-destructive" :
                          process.state === "T" ? "bg-chart-5/20 text-chart-5" : "bg-muted"
                        }`}>
                          {process.state}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-muted-foreground max-w-xs truncate" title={process.command}>
                        {process.command}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleKillProcess(process.pid, process.name)}
                          className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all h-7 w-7 p-0"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredProcesses.length > 100 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Showing first 100 processes. Use search to find specific processes.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
