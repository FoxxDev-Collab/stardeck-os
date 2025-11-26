"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContainerDetailsSheet } from "./components/container-details";
import { ContainerStatsChart } from "./components/container-stats-chart";
import { ContainerTerminal } from "./components/container-terminal";
import { ContainerLogs } from "./components/container-logs";
import { ImageBrowser } from "./components/image-browser";
import { StacksTab } from "@/components/stacks-tab";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Box,
  Play,
  Square,
  RotateCw,
  Trash2,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  HardDrive,
  Network,
  Download,
  FileText,
  Activity,
  Clock,
  Cpu,
  MemoryStick,
  Globe,
  Terminal,
  Package,
  Layers,
} from "lucide-react";

interface Container {
  id: string;
  container_id: string;
  name: string;
  image: string;
  status: string;
  has_web_ui: boolean;
  icon: string;
  created_at: string;
  uptime: string;
  ports: PortMapping[];
}

interface PortMapping {
  host_ip: string;
  host_port: number;
  container_port: number;
  protocol: string;
}

interface ContainerImage {
  id: string;
  repository: string;
  tag: string;
  size: number;
  created: string;
  containers: number;
}

interface Volume {
  name: string;
  driver: string;
  mount_point: string;
  created_at: string;
}

interface PodmanNetwork {
  id: string;
  name: string;
  driver: string;
  subnet: string;
  gateway: string;
  internal: boolean;
}

interface ContainerStats {
  container_id: string;
  cpu_percent: number;
  memory_used: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
  pids: number;
}

interface InstallMessage {
  step?: string;
  message?: string;
  output?: string;
  error?: boolean | string;
  complete?: boolean;
  success?: boolean;
  version?: string;
}

export default function ContainerManagerPage() {
  const { isAuthenticated, isLoading, token, user } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [podmanAvailable, setPodmanAvailable] = useState<boolean | null>(null);

  // Check if user has permission (operator or admin)
  const hasPermission = user?.role === "admin" || user?.role === "operator" || user?.is_pam_admin;
  const [podmanVersion, setPodmanVersion] = useState<string>("");
  const [composeAvailable, setComposeAvailable] = useState<boolean>(false);

  // Installation states
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installStep, setInstallStep] = useState<string>("");
  const [installProgress, setInstallProgress] = useState<number>(0);
  const [installLogs, setInstallLogs] = useState<string[]>([]);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState(false);
  const installLogsRef = useRef<HTMLDivElement>(null);

  // Data states
  const [containers, setContainers] = useState<Container[]>([]);
  const [images, setImages] = useState<ContainerImage[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [networks, setNetworks] = useState<PodmanNetwork[]>([]);

  // UI states
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "running" | "stopped" | "exited">("all");
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("containers");

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [selectedContainerForDetails, setSelectedContainerForDetails] = useState<string | null>(null);
  const [selectedContainerForLogs, setSelectedContainerForLogs] = useState<string | null>(null);
  const [selectedContainerForTerminal, setSelectedContainerForTerminal] = useState<string | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);

  // Create container form
  const [newContainer, setNewContainer] = useState({
    name: "",
    image: "",
    ports: "",
    volumes: "",
    environment: "",
    restart_policy: "no",
  });

  const isAdmin = user?.role === "admin";

  const checkPodman = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/containers/check", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setPodmanAvailable(data.available);
      setPodmanVersion(data.version || "");
      setComposeAvailable(data.compose_available || false);
    } catch {
      setPodmanAvailable(false);
    }
  }, [token]);

  const startPodmanInstall = () => {
    setShowInstallDialog(true);
    setIsInstalling(true);
    setInstallStep("");
    setInstallProgress(0);
    setInstallLogs([]);
    setInstallError(null);
    setInstallSuccess(false);

    // Construct WebSocket URL
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/containers/install?token=${encodeURIComponent(token || "")}`;

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data: InstallMessage = JSON.parse(event.data);

        if (data.complete) {
          setIsInstalling(false);
          if (data.success) {
            setInstallSuccess(true);
            setPodmanVersion(data.version || "");
            setInstallProgress(100);
            setInstallLogs(prev => [...prev, `Podman v${data.version} installed successfully!`]);
          } else {
            const errorMsg = typeof data.error === "string" ? data.error : "Installation failed";
            setInstallError(errorMsg);
          }
          return;
        }

        if (data.step) {
          setInstallStep(data.step);
          // Update progress based on step
          const progressMap: Record<string, number> = {
            epel: 25,
            podman: 50,
            compose: 75,
            verify: 90,
          };
          setInstallProgress(progressMap[data.step] || 0);
        }

        if (data.message) {
          setInstallLogs(prev => [...prev, data.message!]);
        }

        if (data.output) {
          setInstallLogs(prev => [...prev, data.output!]);
        }

        // Auto-scroll logs
        if (installLogsRef.current) {
          installLogsRef.current.scrollTop = installLogsRef.current.scrollHeight;
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      setIsInstalling(false);
      setInstallError("WebSocket connection failed");
    };

    ws.onclose = () => {
      if (isInstalling) {
        setIsInstalling(false);
      }
    };
  };

  const handleInstallComplete = () => {
    setShowInstallDialog(false);
    if (installSuccess) {
      setPodmanAvailable(true);
      checkPodman();
    }
  };

  const fetchContainers = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/containers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch containers");
      const data = await response.json();
      setContainers(data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load containers");
    }
  }, [token]);

  const fetchImages = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/images", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch images");
      const data = await response.json();
      setImages(data || []);
    } catch (err) {
      console.error("Failed to load images:", err);
    }
  }, [token]);

  const fetchVolumes = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/volumes", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch volumes");
      const data = await response.json();
      setVolumes(data || []);
    } catch (err) {
      console.error("Failed to load volumes:", err);
    }
  }, [token]);

  const fetchNetworks = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/podman-networks", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch networks");
      const data = await response.json();
      setNetworks(data || []);
    } catch (err) {
      console.error("Failed to load networks:", err);
    }
  }, [token]);

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
      checkPodman();
      fetchContainers();
      fetchImages();
      fetchVolumes();
      fetchNetworks();

      const interval = setInterval(() => {
        fetchContainers();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, token, checkPodman, fetchContainers, fetchImages, fetchVolumes, fetchNetworks]);

  if (isLoading || !isAuthenticated || !hasPermission) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Box className="w-12 h-12 text-accent animate-pulse" />
      </div>
    );
  }

  const filteredContainers = containers.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.image.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || c.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const runningCount = containers.filter((c) => c.status === "running").length;
  const stoppedCount = containers.filter((c) => c.status === "exited" || c.status === "stopped").length;

  const handleContainerAction = async (containerID: string, action: "start" | "stop" | "restart" | "remove") => {
    if (!token) return;

    if (action === "remove" && !confirm("Are you sure you want to remove this container?")) {
      return;
    }

    setActionInProgress(containerID);
    try {
      const method = action === "remove" ? "DELETE" : "POST";
      const url = action === "remove"
        ? `/api/containers/${containerID}?force=true`
        : `/api/containers/${containerID}/${action}`;

      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${action} container`);
      }

      await fetchContainers();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action} container`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCreateContainer = async () => {
    if (!token || !newContainer.name || !newContainer.image) return;

    setActionInProgress("create");
    try {
      // Parse ports (format: "8080:80,443:443")
      const ports = newContainer.ports
        ? newContainer.ports.split(",").map((p) => {
            const [hostPort, containerPort] = p.trim().split(":");
            return {
              host_port: parseInt(hostPort),
              container_port: parseInt(containerPort),
              protocol: "tcp",
            };
          })
        : [];

      // Parse volumes (format: "/host/path:/container/path")
      const volumesList = newContainer.volumes
        ? newContainer.volumes.split(",").map((v) => {
            const [source, target] = v.trim().split(":");
            return { source, target, type: "bind" };
          })
        : [];

      // Parse environment (format: "KEY=value,KEY2=value2")
      const environment: Record<string, string> = {};
      if (newContainer.environment) {
        newContainer.environment.split(",").forEach((e) => {
          const [key, ...valueParts] = e.trim().split("=");
          environment[key] = valueParts.join("=");
        });
      }

      const response = await fetch("/api/containers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newContainer.name,
          image: newContainer.image,
          ports,
          volumes: volumesList,
          environment,
          restart_policy: newContainer.restart_policy,
          auto_start: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create container");
      }

      setShowCreateDialog(false);
      setNewContainer({
        name: "",
        image: "",
        ports: "",
        volumes: "",
        environment: "",
        restart_policy: "no",
      });
      await fetchContainers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create container");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRemoveVolume = async (volumeName: string) => {
    if (!token) return;
    if (!confirm("Are you sure you want to remove this volume?")) return;

    try {
      const response = await fetch(`/api/volumes/${volumeName}?force=true`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove volume");
      }

      await fetchVolumes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove volume");
    }
  };

  const viewLogs = (container: Container) => {
    setSelectedContainer(container);
    setSelectedContainerForLogs(container.container_id);
  };

  const viewStats = (container: Container) => {
    setSelectedContainer(container);
    setSelectedContainerForDetails(container.container_id);
  };

  const openTerminal = (container: Container) => {
    setSelectedContainer(container);
    setSelectedContainerForTerminal(container.container_id);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <CheckCircle2 className="w-4 h-4 text-primary" />;
      case "exited":
      case "stopped":
        return <XCircle className="w-4 h-4 text-muted-foreground" />;
      case "dead":
      case "error":
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (podmanAvailable === false) {
    return (
      <DashboardLayout title="CONTAINER MANAGER" time={time}>
        <div className="p-6">
          <Card className="border-amber-500/50 bg-card/70 max-w-2xl mx-auto">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-4">
                <Package className="w-8 h-8 text-amber-500" />
              </div>
              <CardTitle className="text-xl">Podman Not Installed</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-6">
              <p className="text-muted-foreground">
                Podman is required for container management but is not currently installed on this system.
                Install Podman to create and manage containers, images, volumes, and networks.
              </p>

              <div className="bg-background/50 rounded-lg p-4 text-left">
                <h4 className="text-sm font-semibold text-foreground mb-3">What will be installed:</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent" />
                    <span><strong>EPEL Release</strong> - Required repository for Podman packages</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent" />
                    <span><strong>Podman</strong> - Container engine (Docker-compatible)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent" />
                    <span><strong>Podman Compose</strong> - Docker Compose compatibility layer</span>
                  </li>
                </ul>
              </div>

              {isAdmin ? (
                <Button
                  size="lg"
                  onClick={startPodmanInstall}
                  className="gap-2 px-8"
                >
                  <Download className="w-5 h-5" />
                  Install Podman
                </Button>
              ) : (
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
                  <AlertCircle className="w-4 h-4 inline mr-2" />
                  Administrator privileges required to install Podman. Please contact your system administrator.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Installation Progress Dialog */}
        <Dialog open={showInstallDialog} onOpenChange={(open) => !isInstalling && setShowInstallDialog(open)}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {isInstalling ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-accent" />
                    Installing Podman...
                  </>
                ) : installSuccess ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    Installation Complete
                  </>
                ) : installError ? (
                  <>
                    <XCircle className="w-5 h-5 text-destructive" />
                    Installation Failed
                  </>
                ) : (
                  "Podman Installation"
                )}
              </DialogTitle>
              <DialogDescription>
                {isInstalling
                  ? "Please wait while Podman and related packages are being installed..."
                  : installSuccess
                  ? `Podman v${podmanVersion} has been successfully installed.`
                  : installError
                  ? installError
                  : "Ready to install Podman"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{installStep || "Preparing..."}</span>
                  <span className="text-accent">{installProgress}%</span>
                </div>
                <Progress value={installProgress} className="h-2" />
              </div>

              {/* Installation logs */}
              <div
                ref={installLogsRef}
                className="bg-muted/50 border border-border rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs"
              >
                {installLogs.length === 0 ? (
                  <span className="text-muted-foreground">Waiting for installation output...</span>
                ) : (
                  installLogs.map((log, i) => (
                    <div key={i} className="text-foreground/80 whitespace-pre-wrap">
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>

            <DialogFooter>
              {!isInstalling && (
                <Button onClick={handleInstallComplete}>
                  {installSuccess ? "Continue to Container Manager" : "Close"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="CONTAINER MANAGER" time={time}>
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Containers
              </CardTitle>
              <Box className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{containers.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {runningCount} running, {stoppedCount} stopped
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Running
              </CardTitle>
              <Play className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{runningCount}</div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Images
              </CardTitle>
              <ImageIcon className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{images.length}</div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Volumes
              </CardTitle>
              <HardDrive className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{volumes.length}</div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Networks
              </CardTitle>
              <Network className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{networks.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Podman Version Info */}
        {podmanVersion && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              Podman v{podmanVersion}
            </span>
            <span className="flex items-center gap-1">
              {composeAvailable ? (
                <CheckCircle2 className="w-3 h-3 text-green-500" />
              ) : (
                <XCircle className="w-3 h-3 text-muted-foreground" />
              )}
              podman-compose {composeAvailable ? "available" : "not installed"}
            </span>
          </div>
        )}

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-card/70 border border-border/50">
            <TabsTrigger value="containers" className="gap-2">
              <Box className="w-4 h-4" /> Containers
            </TabsTrigger>
            <TabsTrigger value="images" className="gap-2">
              <ImageIcon className="w-4 h-4" /> Images
            </TabsTrigger>
            <TabsTrigger value="volumes" className="gap-2">
              <HardDrive className="w-4 h-4" /> Volumes
            </TabsTrigger>
            <TabsTrigger value="networks" className="gap-2">
              <Network className="w-4 h-4" /> Networks
            </TabsTrigger>
            <TabsTrigger value="stacks" className="gap-2">
              <Layers className="w-4 h-4" /> Stacks
            </TabsTrigger>
          </TabsList>

          {/* Containers Tab */}
          <TabsContent value="containers" className="space-y-4">
            {/* Search and Actions */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <div className="flex gap-2 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search containers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-card/70 border-border/50"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                  className="px-3 py-2 rounded-md bg-card/70 border border-border/50 text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="running">Running</option>
                  <option value="exited">Stopped</option>
                </select>
              </div>
              {isAdmin && (
                <Button
                  onClick={() => router.push("/container-create")}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" /> Create Container
                </Button>
              )}
            </div>

            {error && (
              <Card className="border-destructive/50 bg-destructive/10">
                <CardContent className="py-3">
                  <p className="text-sm text-destructive">{error}</p>
                </CardContent>
              </Card>
            )}

            {/* Container List */}
            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Name
                        </th>
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Image
                        </th>
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Ports
                        </th>
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContainers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-muted-foreground">
                            No containers found
                          </td>
                        </tr>
                      ) : (
                        filteredContainers.map((container) => (
                          <tr
                            key={container.container_id}
                            className="border-b border-border/30 hover:bg-accent/5 transition-colors"
                          >
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(container.status)}
                                <span className="font-medium">{container.name}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 font-mono">
                                {container.container_id.substring(0, 12)}
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="text-sm">{container.image}</span>
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                container.status === "running"
                                  ? "bg-primary/20 text-primary"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                {container.status}
                              </span>
                              {container.uptime && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {container.uptime}
                                </div>
                              )}
                            </td>
                            <td className="p-4">
                              {container.ports && container.ports.length > 0 ? (
                                <div className="space-y-1">
                                  {container.ports.map((port, i) => (
                                    <div key={i} className="text-xs font-mono">
                                      {port.host_port}:{port.container_port}/{port.protocol}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="p-4">
                              <div className="flex gap-1">
                                {container.status === "running" ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleContainerAction(container.container_id, "stop")}
                                      disabled={actionInProgress === container.container_id}
                                      title="Stop"
                                    >
                                      {actionInProgress === container.container_id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Square className="w-4 h-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleContainerAction(container.container_id, "restart")}
                                      disabled={actionInProgress === container.container_id}
                                      title="Restart"
                                    >
                                      <RotateCw className="w-4 h-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleContainerAction(container.container_id, "start")}
                                    disabled={actionInProgress === container.container_id}
                                    title="Start"
                                  >
                                    {actionInProgress === container.container_id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Play className="w-4 h-4" />
                                    )}
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => viewLogs(container)}
                                  title="View Logs"
                                >
                                  <FileText className="w-4 h-4" />
                                </Button>
                                {container.status === "running" && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => viewStats(container)}
                                      title="View Stats"
                                    >
                                      <Activity className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openTerminal(container)}
                                      title="Open Terminal"
                                    >
                                      <Terminal className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                                {container.has_web_ui && container.status === "running" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open(`/api/containers/${container.container_id}/proxy/`, "_blank")}
                                    title="Open Web UI"
                                  >
                                    <Globe className="w-4 h-4" />
                                  </Button>
                                )}
                                {isAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleContainerAction(container.container_id, "remove")}
                                    disabled={actionInProgress === container.container_id}
                                    className="text-destructive hover:text-destructive"
                                    title="Remove"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Images Tab */}
          <TabsContent value="images" className="space-y-4">
            <ImageBrowser onRefresh={fetchImages} />
          </TabsContent>

          {/* Volumes Tab */}
          <TabsContent value="volumes" className="space-y-4">
            <h3 className="text-lg font-semibold">Volumes</h3>

            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Name
                        </th>
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Driver
                        </th>
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Mount Point
                        </th>
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {volumes.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-muted-foreground">
                            No volumes found
                          </td>
                        </tr>
                      ) : (
                        volumes.map((volume) => (
                          <tr
                            key={volume.name}
                            className="border-b border-border/30 hover:bg-accent/5 transition-colors"
                          >
                            <td className="p-4 font-medium">{volume.name}</td>
                            <td className="p-4">{volume.driver}</td>
                            <td className="p-4 text-sm font-mono text-muted-foreground">
                              {volume.mount_point}
                            </td>
                            <td className="p-4">
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveVolume(volume.name)}
                                  className="text-destructive hover:text-destructive"
                                  title="Remove"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Networks Tab */}
          <TabsContent value="networks" className="space-y-4">
            <h3 className="text-lg font-semibold">Podman Networks</h3>

            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Name
                        </th>
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Driver
                        </th>
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Subnet
                        </th>
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Gateway
                        </th>
                        <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Internal
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {networks.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-muted-foreground">
                            No networks found
                          </td>
                        </tr>
                      ) : (
                        networks.map((network) => (
                          <tr
                            key={network.id}
                            className="border-b border-border/30 hover:bg-accent/5 transition-colors"
                          >
                            <td className="p-4 font-medium">{network.name}</td>
                            <td className="p-4">{network.driver}</td>
                            <td className="p-4 text-sm font-mono">{network.subnet || "-"}</td>
                            <td className="p-4 text-sm font-mono">{network.gateway || "-"}</td>
                            <td className="p-4">
                              {network.internal ? (
                                <CheckCircle2 className="w-4 h-4 text-primary" />
                              ) : (
                                <XCircle className="w-4 h-4 text-muted-foreground" />
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stacks Tab */}
          <TabsContent value="stacks" className="space-y-4">
            <StacksTab token={token || ""} isAdmin={isAdmin} composeAvailable={composeAvailable} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Container Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Container</DialogTitle>
            <DialogDescription>
              Create a new container from an image.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Container Name</Label>
              <Input
                id="name"
                placeholder="my-container"
                value={newContainer.name}
                onChange={(e) => setNewContainer({ ...newContainer, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image">Image</Label>
              <Input
                id="image"
                placeholder="nginx:latest"
                value={newContainer.image}
                onChange={(e) => setNewContainer({ ...newContainer, image: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ports">Ports (host:container, comma-separated)</Label>
              <Input
                id="ports"
                placeholder="8080:80, 443:443"
                value={newContainer.ports}
                onChange={(e) => setNewContainer({ ...newContainer, ports: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="volumes">Volumes (host:container, comma-separated)</Label>
              <Input
                id="volumes"
                placeholder="/data:/app/data"
                value={newContainer.volumes}
                onChange={(e) => setNewContainer({ ...newContainer, volumes: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="env">Environment Variables (KEY=value, comma-separated)</Label>
              <Input
                id="env"
                placeholder="DEBUG=true, API_KEY=xxx"
                value={newContainer.environment}
                onChange={(e) => setNewContainer({ ...newContainer, environment: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="restart">Restart Policy</Label>
              <select
                id="restart"
                value={newContainer.restart_policy}
                onChange={(e) => setNewContainer({ ...newContainer, restart_policy: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
              >
                <option value="no">No</option>
                <option value="always">Always</option>
                <option value="on-failure">On Failure</option>
                <option value="unless-stopped">Unless Stopped</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateContainer}
              disabled={!newContainer.name || !newContainer.image || actionInProgress === "create"}
            >
              {actionInProgress === "create" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Elite Components */}
      <ContainerDetailsSheet
        containerId={selectedContainerForDetails}
        onClose={() => setSelectedContainerForDetails(null)}
        onAction={handleContainerAction}
        onOpenTerminal={(id) => {
          const container = containers.find(c => c.container_id === id);
          if (container) openTerminal(container);
        }}
        onOpenWebUI={(id) => {
          window.open(`/api/containers/${id}/proxy/`, "_blank");
        }}
        isAdmin={isAdmin}
      />

      <ContainerLogs
        containerId={selectedContainerForLogs}
        containerName={selectedContainer?.name}
        onClose={() => {
          setSelectedContainerForLogs(null);
          setSelectedContainer(null);
        }}
      />

      <ContainerTerminal
        containerId={selectedContainerForTerminal}
        containerName={selectedContainer?.name}
        onClose={() => {
          setSelectedContainerForTerminal(null);
          setSelectedContainer(null);
        }}
      />
    </DashboardLayout>
  );
}
