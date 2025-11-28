"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Play,
  Square,
  RotateCw,
  Terminal,
  FileText,
  Activity,
  Settings,
  Globe,
  Network,
  HardDrive,
  Clock,
  Cpu,
  MemoryStick,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  Save,
  Trash2,
  Box,
  Info,
  ArrowUpCircle,
} from "lucide-react";
import { ContainerStatsChart } from "../container-manager/components/container-stats-chart";
import { TerminalTab } from "./components/terminal-tab";
import { LogsTab } from "./components/logs-tab";
import { UpdateTab } from "./components/update-tab";

interface Container {
  id: string;
  container_id: string;
  name: string;
  image: string;
  status: string;
  uptime?: string;
  ports?: Array<{ host_port: number; container_port: number; protocol: string }>;
  has_web_ui?: boolean;
  web_ui_port?: number;
  web_ui_path?: string;
  icon?: string;
  auto_start?: boolean;
}

interface ContainerInspect {
  Id: string;
  Name: string;
  State: {
    Status: string;
    Running: boolean;
    Paused: boolean;
    StartedAt: string;
    FinishedAt: string;
    ExitCode: number;
    Pid: number;
  };
  Config: {
    Image: string;
    Cmd: string[];
    Env: string[];
    Labels: Record<string, string>;
    WorkingDir: string;
    User: string;
    Hostname: string;
  };
  NetworkSettings: {
    IPAddress: string;
    Gateway: string;
    MacAddress: string;
    Ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null>;
  };
  Mounts: Array<{
    Type: string;
    Source: string;
    Destination: string;
    Mode: string;
    RW: boolean;
  }>;
  HostConfig: {
    Memory: number;
    NanoCpus: number;
    RestartPolicy: { Name: string };
    Privileged: boolean;
  };
  Created: string;
}

function ContainerDetailsContent() {
  const { isAuthenticated, isLoading, token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const containerId = searchParams.get("id");

  const [time, setTime] = useState<string>("");
  const [container, setContainer] = useState<Container | null>(null);
  const [inspect, setInspect] = useState<ContainerInspect | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [actionInProgress, setActionInProgress] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable settings
  const [hasWebUI, setHasWebUI] = useState(false);
  const [webUIPort, setWebUIPort] = useState("");
  const [webUIPath, setWebUIPath] = useState("/");
  const [iconUrl, setIconUrl] = useState("");
  const [autoStart, setAutoStart] = useState(false);

  const isAdmin = user?.role === "admin" || user?.is_pam_admin;

  // Fetch container info
  const fetchContainer = useCallback(async () => {
    if (!token || !containerId) return;

    try {
      const [containerRes, inspectRes] = await Promise.all([
        fetch(`/api/containers/${containerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/containers/${containerId}/inspect`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!containerRes.ok) {
        throw new Error("Container not found");
      }

      const containerData = await containerRes.json();
      setContainer(containerData);

      // Load settings into form
      setHasWebUI(containerData.has_web_ui || false);
      setWebUIPort(containerData.web_ui_port?.toString() || "");
      setWebUIPath(containerData.web_ui_path || "/");
      setIconUrl(containerData.icon || "");
      setAutoStart(containerData.auto_start || false);

      if (inspectRes.ok) {
        const inspectData = await inspectRes.json();
        setInspect(inspectData);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load container");
    } finally {
      setLoading(false);
    }
  }, [token, containerId]);

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
    if (isAuthenticated && token && containerId) {
      fetchContainer();
      const interval = setInterval(fetchContainer, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, token, containerId, fetchContainer]);

  const handleContainerAction = async (action: "start" | "stop" | "restart" | "remove") => {
    if (!token || !containerId) return;

    if (action === "remove") {
      if (!confirm("Are you sure you want to remove this container? This cannot be undone.")) {
        return;
      }
    }

    setActionInProgress(true);
    try {
      const response = await fetch(`/api/containers/${containerId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to ${action} container`);
      }

      if (action === "remove") {
        router.push("/container-manager");
      } else {
        await fetchContainer();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action} container`);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!token || !containerId || !container) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/containers/${container.id}/settings`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          has_web_ui: hasWebUI,
          web_ui_port: hasWebUI && webUIPort ? parseInt(webUIPort) : null,
          web_ui_path: hasWebUI ? webUIPath || "/" : null,
          icon: iconUrl || null,
          auto_start: autoStart,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      await fetchContainer();
      alert("Settings saved successfully");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    if (!dateString || dateString === "0001-01-01T00:00:00Z") return "-";
    return new Date(dateString).toLocaleString();
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-accent animate-spin" />
      </div>
    );
  }

  if (!containerId) {
    return (
      <DashboardLayout title="ERROR" time={time}>
        <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Container Specified</h2>
            <p className="text-muted-foreground mb-4">Please select a container from the manager.</p>
            <Button onClick={() => router.push("/container-manager")}>
              Return to Container Manager
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout title="LOADING..." time={time}>
        <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-accent animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !container) {
    return (
      <DashboardLayout title="ERROR" time={time}>
        <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Container Not Found</h2>
            <p className="text-muted-foreground mb-4">{error || "The container could not be found."}</p>
            <Button onClick={() => router.push("/container-manager")}>
              Return to Container Manager
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isRunning = container.status === "running";

  return (
    <DashboardLayout title={container.name.toUpperCase()} time={time}>
      <div className="h-[calc(100vh-3.5rem)] flex flex-col">
        {/* Header */}
        <div className="shrink-0 border-b border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/container-manager")}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <div className="flex items-center gap-3">
                  {container.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={container.icon} alt="" className="w-10 h-10 rounded-lg" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                      <Box className="w-5 h-5 text-cyan-400" />
                    </div>
                  )}
                  <div>
                    <h1 className="text-xl font-semibold">{container.name}</h1>
                    <p className="text-sm text-muted-foreground font-mono">{container.image}</p>
                  </div>
                </div>
                <Badge variant={isRunning ? "default" : "secondary"} className={isRunning ? "bg-green-500/20 text-green-500 border-green-500/40" : ""}>
                  {container.status}
                </Badge>
                {container.uptime && (
                  <span className="text-sm text-muted-foreground">{container.uptime}</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleContainerAction("stop")}
                      disabled={actionInProgress || !isAdmin}
                      title={!isAdmin ? "Admin required" : "Stop container"}
                    >
                      {actionInProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                      <span className="ml-2">Stop</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleContainerAction("restart")}
                      disabled={actionInProgress || !isAdmin}
                      title={!isAdmin ? "Admin required" : "Restart container"}
                    >
                      <RotateCw className="w-4 h-4" />
                      <span className="ml-2">Restart</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleContainerAction("start")}
                    disabled={actionInProgress || !isAdmin}
                    title={!isAdmin ? "Admin required" : "Start container"}
                  >
                    {actionInProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    <span className="ml-2">Start</span>
                  </Button>
                )}
                {container.has_web_ui && isRunning && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/container-app?id=${container.id}`)}
                  >
                    <Globe className="w-4 h-4" />
                    <span className="ml-2">Open App</span>
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleContainerAction("remove")}
                    disabled={actionInProgress || isRunning}
                    title={isRunning ? "Stop container first" : "Remove container"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Content */}
        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="shrink-0 px-6 pt-4 border-b border-border/30">
              <TabsList className="bg-background/50">
                <TabsTrigger value="overview" className="gap-2">
                  <Info className="w-4 h-4" />
                  Overview
                </TabsTrigger>
                {isRunning && (
                  <>
                    <TabsTrigger value="stats" className="gap-2">
                      <Activity className="w-4 h-4" />
                      Stats
                    </TabsTrigger>
                    <TabsTrigger value="terminal" className="gap-2">
                      <Terminal className="w-4 h-4" />
                      Terminal
                    </TabsTrigger>
                  </>
                )}
                <TabsTrigger value="logs" className="gap-2">
                  <FileText className="w-4 h-4" />
                  Logs
                </TabsTrigger>
                <TabsTrigger value="update" className="gap-2">
                  <ArrowUpCircle className="w-4 h-4" />
                  Update
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-2">
                  <Settings className="w-4 h-4" />
                  Settings
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-auto">
              {/* Overview Tab */}
              <TabsContent value="overview" className="h-full m-0 p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Container Info */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Box className="w-4 h-4 text-cyan-400" />
                        Container Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-muted-foreground">ID</span>
                        <span className="font-mono">{container.container_id.substring(0, 12)}</span>
                        <span className="text-muted-foreground">Name</span>
                        <span>{container.name}</span>
                        <span className="text-muted-foreground">Image</span>
                        <span className="font-mono text-xs">{container.image}</span>
                        <span className="text-muted-foreground">Status</span>
                        <span className={isRunning ? "text-green-500" : "text-muted-foreground"}>{container.status}</span>
                        {inspect && (
                          <>
                            <span className="text-muted-foreground">Created</span>
                            <span>{formatDate(inspect.Created)}</span>
                            <span className="text-muted-foreground">Started</span>
                            <span>{formatDate(inspect.State.StartedAt)}</span>
                            {inspect.State.Pid > 0 && (
                              <>
                                <span className="text-muted-foreground">PID</span>
                                <span>{inspect.State.Pid}</span>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Network Info */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Network className="w-4 h-4 text-blue-400" />
                        Network
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {inspect?.NetworkSettings && (
                          <>
                            <span className="text-muted-foreground">IP Address</span>
                            <span className="font-mono">{inspect.NetworkSettings.IPAddress || "-"}</span>
                            <span className="text-muted-foreground">Gateway</span>
                            <span className="font-mono">{inspect.NetworkSettings.Gateway || "-"}</span>
                            <span className="text-muted-foreground">MAC Address</span>
                            <span className="font-mono text-xs">{inspect.NetworkSettings.MacAddress || "-"}</span>
                          </>
                        )}
                      </div>
                      {container.ports && container.ports.length > 0 && (
                        <div className="pt-3 border-t border-border/50">
                          <span className="text-sm text-muted-foreground">Port Mappings</span>
                          <div className="mt-2 space-y-1">
                            {container.ports.map((port, i) => (
                              <div key={i} className="text-sm font-mono bg-muted/30 px-2 py-1 rounded">
                                {port.host_port} → {port.container_port}/{port.protocol}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Resource Limits */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-purple-400" />
                        Resources
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {inspect?.HostConfig && (
                          <>
                            <span className="text-muted-foreground">Memory Limit</span>
                            <span>{inspect.HostConfig.Memory > 0 ? formatBytes(inspect.HostConfig.Memory) : "Unlimited"}</span>
                            <span className="text-muted-foreground">CPU Limit</span>
                            <span>{inspect.HostConfig.NanoCpus > 0 ? `${(inspect.HostConfig.NanoCpus / 1e9).toFixed(2)} cores` : "Unlimited"}</span>
                            <span className="text-muted-foreground">Restart Policy</span>
                            <span>{inspect.HostConfig.RestartPolicy?.Name || "no"}</span>
                            <span className="text-muted-foreground">Privileged</span>
                            <span>{inspect.HostConfig.Privileged ? "Yes" : "No"}</span>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Volumes */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-amber-400" />
                        Volumes & Mounts
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {inspect?.Mounts && inspect.Mounts.length > 0 ? (
                        <div className="space-y-2">
                          {inspect.Mounts.map((mount, i) => (
                            <div key={i} className="text-sm bg-muted/30 p-2 rounded">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">{mount.Type}</Badge>
                                {!mount.RW && <Badge variant="secondary" className="text-xs">Read-only</Badge>}
                              </div>
                              <div className="font-mono text-xs text-muted-foreground truncate" title={mount.Source}>
                                {mount.Source}
                              </div>
                              <div className="font-mono text-xs">
                                → {mount.Destination}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No volumes mounted</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Stats Tab */}
              {isRunning && (
                <TabsContent value="stats" className="h-full m-0 p-6">
                  <ContainerStatsChart
                    containerId={container.container_id}
                    isRunning={isRunning}
                  />
                </TabsContent>
              )}

              {/* Terminal Tab */}
              {isRunning && (
                <TabsContent value="terminal" className="h-full m-0 p-4">
                  <TerminalTab
                    containerId={container.container_id}
                    containerName={container.name}
                  />
                </TabsContent>
              )}

              {/* Logs Tab */}
              <TabsContent value="logs" className="h-full m-0 p-4">
                <LogsTab
                  containerId={container.container_id}
                  containerName={container.name}
                />
              </TabsContent>

              {/* Update Tab */}
              <TabsContent value="update" className="h-full m-0 p-6 overflow-auto">
                <div className="max-w-2xl">
                  <UpdateTab
                    containerId={container.container_id}
                    containerName={container.name}
                    currentImage={container.image}
                    hasVolumes={inspect?.Mounts && inspect.Mounts.some(m => m.Type === "bind") || false}
                  />
                </div>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="h-full m-0 p-6">
                <div className="max-w-2xl space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Globe className="w-4 h-4 text-cyan-400" />
                        Desktop App Settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Has Web UI</Label>
                          <p className="text-xs text-muted-foreground">Show as desktop app with icon</p>
                        </div>
                        <Switch checked={hasWebUI} onCheckedChange={setHasWebUI} disabled={!isAdmin} />
                      </div>

                      {hasWebUI && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Web UI Port</Label>
                              <Input
                                type="number"
                                placeholder="8080"
                                value={webUIPort}
                                onChange={(e) => setWebUIPort(e.target.value)}
                                disabled={!isAdmin}
                              />
                              <p className="text-xs text-muted-foreground">Host port for web interface</p>
                            </div>
                            <div className="space-y-2">
                              <Label>Web UI Path</Label>
                              <Input
                                placeholder="/"
                                value={webUIPath}
                                onChange={(e) => setWebUIPath(e.target.value)}
                                disabled={!isAdmin}
                              />
                              <p className="text-xs text-muted-foreground">URL path (usually &quot;/&quot;)</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Icon URL</Label>
                            <Input
                              placeholder="https://example.com/icon.svg"
                              value={iconUrl}
                              onChange={(e) => setIconUrl(e.target.value)}
                              disabled={!isAdmin}
                            />
                            <p className="text-xs text-muted-foreground">URL to icon image for desktop shortcut</p>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Settings className="w-4 h-4 text-amber-400" />
                        Container Options
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Auto Start</Label>
                          <p className="text-xs text-muted-foreground">Start container when Stardeck starts</p>
                        </div>
                        <Switch checked={autoStart} onCheckedChange={setAutoStart} disabled={!isAdmin} />
                      </div>
                    </CardContent>
                  </Card>

                  {isAdmin && (
                    <Button onClick={handleSaveSettings} disabled={saving}>
                      {saving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Save Settings
                    </Button>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function ContainerDetailsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-accent animate-spin" />
      </div>
    }>
      <ContainerDetailsContent />
    </Suspense>
  );
}
