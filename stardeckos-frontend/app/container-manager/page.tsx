"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSettings } from "@/lib/settings-context";
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
import { TemplatesTab } from "@/components/templates-tab";
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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Box,
  Play,
  Square,
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
  Clock,
  Cpu,
  MemoryStick,
  Package,
  Layers,
  Settings,
  FolderOpen,
  ShieldAlert,
  Pencil,
  FileCode2,
  ExternalLink,
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

interface BindMount {
  host_path: string;
  container_path: string;
  container_id: string;
  container_name: string;
  rw: boolean;
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

interface StorageConfig {
  graph_root: string;
  run_root: string;
  driver: string;
  config_path: string;
  is_default: boolean;
}

export default function ContainerManagerPage() {
  const { isAuthenticated, isLoading, token, user } = useAuth();
  const { settings, updateContainerSettings } = useSettings();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
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
  const [bindMounts, setBindMounts] = useState<BindMount[]>([]);
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

  // Create Volume dialog state
  const [showCreateVolumeDialog, setShowCreateVolumeDialog] = useState(false);
  const [newVolumeName, setNewVolumeName] = useState("");
  const [creatingVolume, setCreatingVolume] = useState(false);

  // Storage config state
  const [storageConfig, setStorageConfig] = useState<StorageConfig | null>(null);
  const [newGraphRoot, setNewGraphRoot] = useState("");
  const [updatingStorage, setUpdatingStorage] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Adopt container dialog state
  const [showAdoptDialog, setShowAdoptDialog] = useState(false);
  const [adoptingContainer, setAdoptingContainer] = useState<Container | null>(null);
  const [adoptForm, setAdoptForm] = useState({
    hasWebUI: false,
    webUIPort: "",
    webUIPath: "/",
    icon: "",
    autoStart: false,
  });
  const [isAdopting, setIsAdopting] = useState(false);

  // Edit container dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingContainer, setEditingContainer] = useState<Container | null>(null);
  const [editForm, setEditForm] = useState({
    hasWebUI: false,
    webUIPort: "",
    webUIPath: "/",
    icon: "",
    iconLight: "",
    iconDark: "",
    autoStart: false,
  });
  const [isEditing, setIsEditing] = useState(false);

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

  const fetchStorageConfig = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const response = await fetch("/api/storage-config", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setStorageConfig(data);
        setNewGraphRoot(data.graph_root);
      }
    } catch {
      // Ignore errors - storage config is optional
    }
  }, [token, isAdmin]);

  const updateStorageLocation = async () => {
    if (!token || !newGraphRoot) return;

    setUpdatingStorage(true);
    setStorageError(null);

    try {
      const response = await fetch("/api/storage-config", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ graph_root: newGraphRoot }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStorageError(data.error || "Failed to update storage location");
        return;
      }

      // Refresh storage config
      await fetchStorageConfig();
      // Refresh containers/volumes as they may have been reset
      await Promise.all([fetchContainers(), fetchVolumes()]);
    } catch (err) {
      setStorageError("Failed to update storage location");
    } finally {
      setUpdatingStorage(false);
    }
  };

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

  const fetchBindMounts = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/bind-mounts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch bind mounts");
      const data = await response.json();
      setBindMounts(data || []);
    } catch (err) {
      console.error("Failed to load bind mounts:", err);
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
      fetchBindMounts();
      fetchNetworks();
      fetchStorageConfig();

      const interval = setInterval(() => {
        fetchContainers();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, token, checkPodman, fetchContainers, fetchImages, fetchVolumes, fetchBindMounts, fetchNetworks, fetchStorageConfig]);

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

  // Check if a container is managed by Stardeck (has a database entry)
  const isManaged = (container: Container) => {
    return container.id && container.id !== "" && container.id !== container.container_id;
  };

  // Open adopt dialog for unmanaged container
  const openAdoptDialog = (container: Container) => {
    setAdoptingContainer(container);
    // Pre-fill port from first HTTP port mapping if available
    const httpPort = container.ports?.find(p =>
      p.container_port === 80 || p.container_port === 443 ||
      p.container_port === 8080 || p.container_port === 3000
    );
    setAdoptForm({
      hasWebUI: !!httpPort,
      webUIPort: httpPort ? String(httpPort.host_port) : "",
      webUIPath: "/",
      icon: container.name.split("-")[0].toLowerCase(),
      autoStart: false,
    });
    setShowAdoptDialog(true);
  };

  // Handle adopt container submission
  const handleAdoptContainer = async () => {
    if (!token || !adoptingContainer) return;

    setIsAdopting(true);
    try {
      const response = await fetch("/api/containers/adopt", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          container_id: adoptingContainer.container_id,
          has_web_ui: adoptForm.hasWebUI,
          web_ui_port: adoptForm.hasWebUI ? parseInt(adoptForm.webUIPort) || 0 : 0,
          web_ui_path: adoptForm.webUIPath || "/",
          icon: adoptForm.icon,
          auto_start: adoptForm.autoStart,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to adopt container");
      }

      setShowAdoptDialog(false);
      setAdoptingContainer(null);
      await fetchContainers();
      alert(`Container "${adoptingContainer.name}" adopted successfully!`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to adopt container");
    } finally {
      setIsAdopting(false);
    }
  };

  // Open edit dialog for managed container
  const openEditDialog = async (container: Container) => {
    if (!token) return;

    // Fetch current container details to get web_ui settings
    try {
      const response = await fetch(`/api/containers/${container.container_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      setEditingContainer(container);
      setEditForm({
        hasWebUI: data.has_web_ui || false,
        webUIPort: data.web_ui_port ? String(data.web_ui_port) : "",
        webUIPath: data.web_ui_path || "/",
        icon: data.icon || "",
        iconLight: data.icon_light || "",
        iconDark: data.icon_dark || "",
        autoStart: data.auto_start || false,
      });
      setShowEditDialog(true);
    } catch {
      alert("Failed to load container details");
    }
  };

  // Handle edit container submission
  const handleEditContainer = async () => {
    if (!token || !editingContainer) return;

    setIsEditing(true);
    try {
      const response = await fetch(`/api/containers/${editingContainer.container_id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          has_web_ui: editForm.hasWebUI,
          web_ui_port: editForm.hasWebUI ? parseInt(editForm.webUIPort) || 0 : 0,
          web_ui_path: editForm.webUIPath || "/",
          icon: editForm.icon,
          icon_light: editForm.iconLight,
          icon_dark: editForm.iconDark,
          auto_start: editForm.autoStart,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update container");
      }

      setShowEditDialog(false);
      setEditingContainer(null);
      await fetchContainers();
      alert(`Container "${editingContainer.name}" updated successfully!`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update container");
    } finally {
      setIsEditing(false);
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

  const handleCreateVolume = async () => {
    if (!token || !newVolumeName.trim()) return;

    setCreatingVolume(true);
    try {
      const response = await fetch("/api/volumes", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newVolumeName.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create volume");
      }

      setShowCreateVolumeDialog(false);
      setNewVolumeName("");
      await fetchVolumes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create volume");
    } finally {
      setCreatingVolume(false);
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
            <TabsTrigger value="templates" className="gap-2">
              <FileCode2 className="w-4 h-4" /> Templates
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
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowSettingsDialog(true)}
                    className="gap-2"
                  >
                    <Settings className="w-4 h-4" /> Settings
                  </Button>
                  <Button
                    onClick={() => router.push("/container-create")}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" /> Create Container
                  </Button>
                </div>
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
                                {/* Start/Stop - Admin only */}
                                {isAdmin && (
                                  container.status === "running" ? (
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
                                  )
                                )}
                                {/* View Details - Always visible */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => router.push(`/container-details?id=${container.id || container.container_id}`)}
                                  title="View Details"
                                  className="text-cyan-400 hover:text-cyan-400"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Button>
                                {/* Adopt unmanaged containers - Admin only */}
                                {isAdmin && !isManaged(container) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openAdoptDialog(container)}
                                    title="Adopt Container"
                                    className="text-amber-400 hover:text-amber-400"
                                  >
                                    <Package className="w-4 h-4" />
                                  </Button>
                                )}
                                {/* Delete - Admin only */}
                                {isAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleContainerAction(container.container_id, "remove")}
                                    disabled={actionInProgress === container.container_id || container.status === "running"}
                                    className="text-destructive hover:text-destructive"
                                    title={container.status === "running" ? "Stop container first" : "Remove"}
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
          <TabsContent value="volumes" className="space-y-6">
            {/* Bind Mounts Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-accent" />
                Bind Mounts
              </h3>
              <p className="text-sm text-muted-foreground">
                Host directories mounted into containers
              </p>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Host Path
                          </th>
                          <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Container Path
                          </th>
                          <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Container
                          </th>
                          <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Mode
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {bindMounts.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-8 text-center text-muted-foreground">
                              No bind mounts found
                            </td>
                          </tr>
                        ) : (
                          bindMounts.map((mount, index) => (
                            <tr
                              key={`${mount.container_id}-${mount.host_path}-${index}`}
                              className="border-b border-border/30 hover:bg-accent/5 transition-colors"
                            >
                              <td className="p-4 text-sm font-mono text-muted-foreground">
                                {mount.host_path}
                              </td>
                              <td className="p-4 text-sm font-mono text-muted-foreground">
                                {mount.container_path}
                              </td>
                              <td className="p-4">
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent">
                                  {mount.container_name}
                                </span>
                              </td>
                              <td className="p-4">
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  mount.rw
                                    ? "bg-primary/20 text-primary"
                                    : "bg-muted text-muted-foreground"
                                }`}>
                                  {mount.rw ? "RW" : "RO"}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Podman Volumes Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-accent" />
                    Podman Volumes
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Managed storage volumes created with Podman
                  </p>
                </div>
                {isAdmin && (
                  <Button
                    size="sm"
                    onClick={() => setShowCreateVolumeDialog(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Volume
                  </Button>
                )}
              </div>

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
                              No Podman volumes found
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
            </div>
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

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <TemplatesTab token={token || ""} isAdmin={isAdmin} />
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

      {/* Container Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-accent" />
              Container Settings
            </DialogTitle>
            <DialogDescription>
              Configure default settings for container creation
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Podman Storage Location */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-accent" />
                <Label className="font-medium">Podman Storage Location</Label>
              </div>
              {storageConfig ? (
                <>
                  <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Current location:</span>
                      <code className="font-mono text-xs bg-background px-2 py-1 rounded">{storageConfig.graph_root}</code>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Storage driver:</span>
                      <span className="text-xs">{storageConfig.driver}</span>
                    </div>
                    {storageConfig.is_default && (
                      <p className="text-xs text-muted-foreground">Using default Podman storage location</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Change storage location</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="/mnt/containers/storage"
                        value={newGraphRoot}
                        onChange={(e) => setNewGraphRoot(e.target.value)}
                        className="font-mono flex-1"
                        disabled={updatingStorage}
                      />
                      <Button
                        variant="outline"
                        onClick={updateStorageLocation}
                        disabled={updatingStorage || newGraphRoot === storageConfig.graph_root || !newGraphRoot}
                      >
                        {updatingStorage ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Apply"
                        )}
                      </Button>
                    </div>
                  </div>
                  {storageError && (
                    <div className="p-2 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive">
                      {storageError}
                    </div>
                  )}
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      <strong>Warning:</strong> Changing storage location will reset Podman storage.
                      All existing containers, images, and volumes will be removed.
                      Stop all containers before changing this setting.
                    </p>
                  </div>
                </>
              ) : (
                <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                  Storage configuration not available. Podman may not be installed.
                </div>
              )}
            </div>

            {/* Restart Policy & Network Mode */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Default Restart Policy</Label>
                <Select
                  value={settings.container.defaultRestartPolicy}
                  onValueChange={(value) => updateContainerSettings({ defaultRestartPolicy: value as "no" | "always" | "unless-stopped" | "on-failure" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No (manual)</SelectItem>
                    <SelectItem value="always">Always</SelectItem>
                    <SelectItem value="unless-stopped">Unless Stopped</SelectItem>
                    <SelectItem value="on-failure">On Failure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Default Network Mode</Label>
                <Select
                  value={settings.container.defaultNetworkMode}
                  onValueChange={(value) => updateContainerSettings({ defaultNetworkMode: value as "bridge" | "host" | "none" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bridge">Bridge (isolated)</SelectItem>
                    <SelectItem value="host">Host (shared)</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Toggle Options */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Play className="w-4 h-4 text-green-500" />
                  <div>
                    <Label className="font-medium">Auto-start Containers</Label>
                    <p className="text-xs text-muted-foreground">Start containers after creation</p>
                  </div>
                </div>
                <Switch
                  checked={settings.container.autoStartContainers}
                  onCheckedChange={(checked) => updateContainerSettings({ autoStartContainers: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-4 h-4 text-destructive" />
                  <div>
                    <Label className="font-medium">Privileged Mode Default</Label>
                    <p className="text-xs text-muted-foreground">Not recommended</p>
                  </div>
                </div>
                <Switch
                  checked={settings.container.enablePrivilegedByDefault}
                  onCheckedChange={(checked) => updateContainerSettings({ enablePrivilegedByDefault: checked })}
                />
              </div>

              {settings.container.enablePrivilegedByDefault && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <p className="text-xs text-destructive">
                    Privileged containers have full host access. Use with caution.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Volume Dialog */}
      <Dialog open={showCreateVolumeDialog} onOpenChange={setShowCreateVolumeDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-accent" />
              Create Podman Volume
            </DialogTitle>
            <DialogDescription>
              Create a managed volume for persistent container storage
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="volume-name">Volume Name</Label>
              <Input
                id="volume-name"
                placeholder="my-app-data"
                value={newVolumeName}
                onChange={(e) => setNewVolumeName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                disabled={creatingVolume}
              />
              <p className="text-xs text-muted-foreground">
                Only letters, numbers, underscores, and hyphens allowed
              </p>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>Managed by Podman</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>Data persists across container restarts</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>Easy backup and migration</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateVolumeDialog(false);
                setNewVolumeName("");
              }}
              disabled={creatingVolume}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateVolume}
              disabled={!newVolumeName.trim() || creatingVolume}
            >
              {creatingVolume ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Volume"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adopt Container Dialog */}
      <Dialog open={showAdoptDialog} onOpenChange={setShowAdoptDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-cyan-400" />
              Adopt Container
            </DialogTitle>
            <DialogDescription>
              Configure <span className="font-mono text-foreground">{adoptingContainer?.name}</span> for Stardeck management.
              This enables desktop icons and web UI proxy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Web UI Settings */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Has Web UI</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable to add desktop icon and proxy
                  </p>
                </div>
                <Switch
                  checked={adoptForm.hasWebUI}
                  onCheckedChange={(checked) => setAdoptForm(prev => ({ ...prev, hasWebUI: checked }))}
                />
              </div>

              {adoptForm.hasWebUI && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="web-ui-port">Web UI Host Port</Label>
                    <Select
                      value={adoptForm.webUIPort}
                      onValueChange={(value) => setAdoptForm(prev => ({ ...prev, webUIPort: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select port" />
                      </SelectTrigger>
                      <SelectContent>
                        {adoptingContainer?.ports?.map((port) => (
                          <SelectItem key={port.host_port} value={String(port.host_port)}>
                            {port.host_port} → {port.container_port}/{port.protocol}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Select the host port that serves the web interface
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="web-ui-path">Web UI Path</Label>
                    <Input
                      id="web-ui-path"
                      value={adoptForm.webUIPath}
                      onChange={(e) => setAdoptForm(prev => ({ ...prev, webUIPath: e.target.value }))}
                      placeholder="/"
                    />
                    <p className="text-xs text-muted-foreground">
                      Path prefix for the web UI (usually &quot;/&quot;)
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Icon */}
            <div className="space-y-2">
              <Label htmlFor="icon-name">Icon Name</Label>
              <Input
                id="icon-name"
                value={adoptForm.icon}
                onChange={(e) => setAdoptForm(prev => ({ ...prev, icon: e.target.value }))}
                placeholder="gitea, nextcloud, etc."
              />
              <p className="text-xs text-muted-foreground">
                Used for desktop icon display
              </p>
            </div>

            {/* Auto Start */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto Start</Label>
                <p className="text-xs text-muted-foreground">
                  Start container on system boot
                </p>
              </div>
              <Switch
                checked={adoptForm.autoStart}
                onCheckedChange={(checked) => setAdoptForm(prev => ({ ...prev, autoStart: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAdoptDialog(false);
                setAdoptingContainer(null);
              }}
              disabled={isAdopting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdoptContainer}
              disabled={isAdopting || (adoptForm.hasWebUI && !adoptForm.webUIPort)}
              className="gap-2"
            >
              {isAdopting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adopting...
                </>
              ) : (
                <>
                  <Package className="w-4 h-4" />
                  Adopt Container
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Container Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-amber-400" />
              Edit Container
            </DialogTitle>
            <DialogDescription>
              Update settings for {editingContainer?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Icon URLs for Light/Dark themes */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="edit-icon-light">Icon URL (Light Theme)</Label>
                <Input
                  id="edit-icon-light"
                  placeholder="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/app-light.svg"
                  value={editForm.iconLight}
                  onChange={(e) => setEditForm(prev => ({ ...prev, iconLight: e.target.value }))}
                />
                {editForm.iconLight && (
                  <div className="flex items-center gap-2 p-2 bg-white border rounded">
                    <span className="text-xs text-gray-500">Preview:</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={editForm.iconLight}
                      alt="Light icon preview"
                      className="w-8 h-8 object-contain"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-icon-dark">Icon URL (Dark Theme)</Label>
                <Input
                  id="edit-icon-dark"
                  placeholder="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/app-dark.svg"
                  value={editForm.iconDark}
                  onChange={(e) => setEditForm(prev => ({ ...prev, iconDark: e.target.value }))}
                />
                {editForm.iconDark && (
                  <div className="flex items-center gap-2 p-2 bg-gray-900 border border-gray-700 rounded">
                    <span className="text-xs text-gray-400">Preview:</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={editForm.iconDark}
                      alt="Dark icon preview"
                      className="w-8 h-8 object-contain"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Icon URLs from selfh.st/icons or other sources. Light theme icons display on light backgrounds, dark theme icons on dark backgrounds.
              </p>
            </div>

            {/* Has Web UI */}
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-webui">Has Web UI</Label>
              <Switch
                id="edit-webui"
                checked={editForm.hasWebUI}
                onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, hasWebUI: checked }))}
              />
            </div>

            {editForm.hasWebUI && (
              <>
                {/* Web UI Port */}
                <div className="space-y-2">
                  <Label htmlFor="edit-port">Web UI Port</Label>
                  <Input
                    id="edit-port"
                    type="number"
                    placeholder="8080"
                    value={editForm.webUIPort}
                    onChange={(e) => setEditForm(prev => ({ ...prev, webUIPort: e.target.value }))}
                  />
                </div>

                {/* Web UI Path */}
                <div className="space-y-2">
                  <Label htmlFor="edit-path">Web UI Path</Label>
                  <Input
                    id="edit-path"
                    placeholder="/"
                    value={editForm.webUIPath}
                    onChange={(e) => setEditForm(prev => ({ ...prev, webUIPath: e.target.value }))}
                  />
                </div>
              </>
            )}

            {/* Auto Start */}
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-autostart">Auto Start</Label>
              <Switch
                id="edit-autostart"
                checked={editForm.autoStart}
                onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, autoStart: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(false);
                setEditingContainer(null);
              }}
              disabled={isEditing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditContainer}
              disabled={isEditing || (editForm.hasWebUI && !editForm.webUIPort)}
              className="gap-2"
            >
              {isEditing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Pencil className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
