"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Activity, ListChecks, Search, XCircle, AlertCircle, Cpu, Database } from "lucide-react";

interface Process {
  pid: number;
  user: string;
  cpu: number;
  memory: number;
  command: string;
  status: string;
}

export default function ProcessManagerPage() {
  const { isAuthenticated, isLoading, token } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [processes, setProcesses] = useState<Process[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"cpu" | "memory" | "pid">("cpu");
  const [error, setError] = useState<string | null>(null);

  const fetchProcesses = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/processes", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch processes");
      }

      const data = await response.json();
      setProcesses(data.processes || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load processes");
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

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchProcesses();
      const interval = setInterval(fetchProcesses, 5000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, token, fetchProcesses]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Activity className="w-12 h-12 text-accent animate-pulse" />
      </div>
    );
  }

  const filteredProcesses = processes
    .filter((p) =>
      p.command.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.pid.toString().includes(searchTerm)
    )
    .sort((a, b) => {
      if (sortBy === "cpu") return b.cpu - a.cpu;
      if (sortBy === "memory") return b.memory - a.memory;
      return a.pid - b.pid;
    });

  const totalCpu = processes.reduce((acc, p) => acc + p.cpu, 0);
  const totalMemory = processes.reduce((acc, p) => acc + p.memory, 0);

  const handleKillProcess = async (pid: number) => {
    if (!confirm(`Are you sure you want to kill process ${pid}?`)) return;

    try {
      const response = await fetch(`/api/processes/${pid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to kill process");
      }

      // Refresh process list
      await fetchProcesses();
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

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Processes
              </CardTitle>
              <ListChecks className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{processes.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {processes.filter((p) => p.status === "running").length} running
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total CPU
              </CardTitle>
              <Cpu className="w-4 h-4 text-chart-3" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalCpu.toFixed(1)}%</div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Memory
              </CardTitle>
              <Database className="w-4 h-4 text-chart-4" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalMemory.toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>

        {/* Process List */}
        <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
          <CardHeader>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-accent" />
                Running Processes
              </CardTitle>
              <div className="flex gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search processes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-input/80 border-border/60"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">
                      <button onClick={() => setSortBy("pid")} className="hover:text-accent">
                        PID
                      </button>
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">USER</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">
                      <button onClick={() => setSortBy("cpu")} className="hover:text-accent">
                        CPU %
                      </button>
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">
                      <button onClick={() => setSortBy("memory")} className="hover:text-accent">
                        MEM %
                      </button>
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">COMMAND</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">STATUS</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProcesses.map((process) => (
                    <tr
                      key={process.pid}
                      className="border-b border-border/30 hover:bg-accent/5 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-sm">{process.pid}</td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">{process.user}</td>
                      <td className="py-3 px-4 font-mono text-sm">
                        <span className={process.cpu > 10 ? "text-chart-2" : ""}>
                          {process.cpu.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-sm">
                        <span className={process.memory > 10 ? "text-chart-2" : ""}>
                          {process.memory.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-sm truncate max-w-md">
                        {process.command}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <span className={`inline-flex items-center gap-1 text-xs ${
                          process.status === "running" ? "text-primary" : "text-muted-foreground"
                        }`}>
                          {process.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleKillProcess(process.pid)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
