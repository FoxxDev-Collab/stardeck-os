"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Box,
  X,
  Copy,
  Play,
  Square,
  RotateCw,
  Trash2,
  ExternalLink,
  Terminal,
  FileText,
  Activity,
  Network,
  HardDrive,
  Settings,
  Clock,
  Cpu,
  MemoryStick,
  Globe,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
} from "lucide-react";

interface ContainerDetails {
  container_id: string;
  name: string;
  image: string;
  status: string;
  running: boolean;
  created: string;
  started_at: string;
  finished_at: string;
  exit_code: number;
  pid: number;
  hostname: string;
  user: string;
  working_dir: string;
  entrypoint: string[];
  cmd: string[];
  env: string[];
  labels: Record<string, string>;
  restart_policy: {
    name: string;
    max_retries: number;
  };
  network_mode: string;
  mounts: Array<{
    Type: string;
    Source: string;
    Destination: string;
    RW: boolean;
  }>;
  networks: Record<string, {
    IPAddress: string;
    Gateway: string;
    MacAddress: string;
  }>;
  // Stardeck metadata
  id?: string;
  has_web_ui?: boolean;
  web_ui_port?: number;
  web_ui_path?: string;
  icon?: string;
  auto_start?: boolean;
}

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

interface ContainerDetailsSheetProps {
  containerId: string | null;
  onClose: () => void;
  onAction: (containerId: string, action: "start" | "stop" | "restart" | "remove") => void;
  onOpenTerminal: (containerId: string) => void;
  onOpenWebUI?: (containerId: string) => void;
  isAdmin: boolean;
}

export function ContainerDetailsSheet({
  containerId,
  onClose,
  onAction,
  onOpenTerminal,
  onOpenWebUI,
  isAdmin,
}: ContainerDetailsSheetProps) {
  const { token } = useAuth();
  const [details, setDetails] = useState<ContainerDetails | null>(null);
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [actionInProgress, setActionInProgress] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!token || !containerId) return;

    try {
      const response = await fetch(`/api/containers/${containerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch container details");
      const data = await response.json();
      setDetails(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load details");
    } finally {
      setLoading(false);
    }
  }, [token, containerId]);

  const fetchStats = useCallback(async () => {
    if (!token || !containerId || !details?.running) return;

    try {
      const response = await fetch(`/api/containers/${containerId}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch {
      // Stats are optional
    }
  }, [token, containerId, details?.running]);

  useEffect(() => {
    if (containerId) {
      setLoading(true);
      setDetails(null);
      setStats(null);
      fetchDetails();
    }
  }, [containerId, fetchDetails]);

  useEffect(() => {
    if (details?.running) {
      fetchStats();
      const interval = setInterval(fetchStats, 3000);
      return () => clearInterval(interval);
    }
  }, [details?.running, fetchStats]);

  const handleAction = async (action: "start" | "stop" | "restart" | "remove") => {
    if (!containerId) return;
    setActionInProgress(true);
    try {
      await onAction(containerId, action);
      if (action !== "remove") {
        await fetchDetails();
      } else {
        onClose();
      }
    } finally {
      setActionInProgress(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr || dateStr === "0001-01-01T00:00:00Z") return "-";
    return new Date(dateStr).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "text-green-500 bg-green-500/20";
      case "paused":
        return "text-yellow-500 bg-yellow-500/20";
      case "exited":
      case "dead":
        return "text-red-500 bg-red-500/20";
      default:
        return "text-gray-500 bg-gray-500/20";
    }
  };

  return (
    <Sheet open={!!containerId} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="border-b border-border/50 pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                <Box className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <span className="block">{details?.name || "Loading..."}</span>
                {details && (
                  <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(details.status)}`}>
                    {details.status}
                  </span>
                )}
              </div>
            </SheetTitle>
          </div>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <p className="text-destructive">{error}</p>
          </div>
        ) : details ? (
          <div className="py-4 space-y-6">
            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
              {details.running ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAction("stop")}
                    disabled={actionInProgress}
                    className="gap-2"
                  >
                    <Square className="w-4 h-4" />
                    Stop
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAction("restart")}
                    disabled={actionInProgress}
                    className="gap-2"
                  >
                    <RotateCw className="w-4 h-4" />
                    Restart
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenTerminal(containerId!)}
                    className="gap-2"
                  >
                    <Terminal className="w-4 h-4" />
                    Shell
                  </Button>
                  {details.has_web_ui && onOpenWebUI && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenWebUI(containerId!)}
                      className="gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Web UI
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAction("start")}
                  disabled={actionInProgress}
                  className="gap-2"
                >
                  <Play className="w-4 h-4" />
                  Start
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAction("remove")}
                  disabled={actionInProgress}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </Button>
              )}
            </div>

            {/* Live Stats (if running) */}
            {details.running && stats && (
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-accent" />
                    Live Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">CPU</div>
                    <div className="text-lg font-semibold">{stats.cpu_percent.toFixed(1)}%</div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full bg-cyan-500 transition-all"
                        style={{ width: `${Math.min(stats.cpu_percent, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Memory</div>
                    <div className="text-lg font-semibold">{formatBytes(stats.memory_used)}</div>
                    <div className="text-xs text-muted-foreground">
                      / {formatBytes(stats.memory_limit)} ({stats.memory_percent.toFixed(1)}%)
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Network I/O</div>
                    <div className="text-sm">
                      <span className="text-green-500">↓</span> {formatBytes(stats.network_rx)}
                    </div>
                    <div className="text-sm">
                      <span className="text-blue-500">↑</span> {formatBytes(stats.network_tx)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">PIDs</div>
                    <div className="text-lg font-semibold">{stats.pids}</div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabs for detailed info */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                <TabsTrigger value="network" className="text-xs">Network</TabsTrigger>
                <TabsTrigger value="volumes" className="text-xs">Volumes</TabsTrigger>
                <TabsTrigger value="env" className="text-xs">Environment</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                {/* Container Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Container ID</div>
                    <div className="font-mono text-xs flex items-center gap-2">
                      {details.container_id}
                      <button onClick={() => copyToClipboard(details.container_id)} className="text-muted-foreground hover:text-accent">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Image</div>
                    <div className="font-mono text-xs truncate">{details.image}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Created</div>
                    <div className="text-xs">{formatDate(details.created)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Started</div>
                    <div className="text-xs">{formatDate(details.started_at)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Hostname</div>
                    <div className="font-mono text-xs">{details.hostname || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">PID</div>
                    <div className="font-mono text-xs">{details.running ? details.pid : "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">User</div>
                    <div className="font-mono text-xs">{details.user || "root"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Restart Policy</div>
                    <div className="text-xs">{details.restart_policy?.name || "no"}</div>
                  </div>
                </div>

                {/* Command */}
                {(details.entrypoint?.length > 0 || details.cmd?.length > 0) && (
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Command</div>
                    <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs overflow-x-auto">
                      {[...(details.entrypoint || []), ...(details.cmd || [])].join(" ")}
                    </div>
                  </div>
                )}

                {/* Labels */}
                {details.labels && Object.keys(details.labels).length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Labels</div>
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
                      {Object.entries(details.labels).map(([key, value]) => (
                        <div key={key} className="font-mono text-xs">
                          <span className="text-cyan-400">{key}</span>
                          <span className="text-muted-foreground">=</span>
                          <span>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="network" className="space-y-4 mt-4">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Network Mode</div>
                  <div className="text-sm">{details.network_mode || "bridge"}</div>
                </div>

                {details.networks && Object.keys(details.networks).length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Connected Networks</div>
                    <div className="space-y-3">
                      {Object.entries(details.networks).map(([name, network]) => (
                        <Card key={name} className="bg-muted/30">
                          <CardContent className="p-3">
                            <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                              <Network className="w-4 h-4 text-accent" />
                              {name}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">IP Address:</span>
                                <span className="ml-2 font-mono">{network.IPAddress || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Gateway:</span>
                                <span className="ml-2 font-mono">{network.Gateway || "-"}</span>
                              </div>
                              <div className="col-span-2">
                                <span className="text-muted-foreground">MAC Address:</span>
                                <span className="ml-2 font-mono">{network.MacAddress || "-"}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="volumes" className="space-y-4 mt-4">
                {details.mounts && details.mounts.length > 0 ? (
                  <div className="space-y-3">
                    {details.mounts.map((mount, i) => (
                      <Card key={i} className="bg-muted/30">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <HardDrive className="w-4 h-4 text-accent" />
                            <span className="font-semibold text-sm">{mount.Type}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${mount.RW ? "bg-green-500/20 text-green-500" : "bg-yellow-500/20 text-yellow-500"}`}>
                              {mount.RW ? "RW" : "RO"}
                            </span>
                          </div>
                          <div className="space-y-1 text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground w-16">Source:</span>
                              <span className="truncate">{mount.Source}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <ChevronRight className="w-3 h-3 text-muted-foreground" />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground w-16">Target:</span>
                              <span className="truncate">{mount.Destination}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No volumes mounted</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="env" className="space-y-4 mt-4">
                {details.env && details.env.length > 0 ? (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1 max-h-80 overflow-y-auto">
                    {details.env.map((env, i) => {
                      const [key, ...valueParts] = env.split("=");
                      const value = valueParts.join("=");
                      const isSecret = key.toLowerCase().includes("password") ||
                                      key.toLowerCase().includes("secret") ||
                                      key.toLowerCase().includes("key") ||
                                      key.toLowerCase().includes("token");
                      return (
                        <div key={i} className="font-mono text-xs">
                          <span className="text-cyan-400">{key}</span>
                          <span className="text-muted-foreground">=</span>
                          <span>{isSecret ? "••••••••" : value}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No environment variables</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
