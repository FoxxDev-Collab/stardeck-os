"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSettings } from "@/lib/settings-context";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PortSelector } from "@/components/port-selector";
import {
  ArrowLeft,
  Search,
  Plus,
  Trash2,
  Download,
  Upload,
  FileText,
  Network,
  HardDrive,
  Settings,
  Play,
  Info,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Terminal,
  Globe
} from "lucide-react";

interface DockerHubImage {
  repo_name: string;
  short_description: string;
  star_count: number;
  pull_count: number;
  repo_owner: string;
  is_official: boolean;
  is_automated: boolean;
}

interface PortMapping {
  hostPort: string;
  containerPort: string;
  protocol: "tcp" | "udp";
}

interface VolumeMount {
  type: "bind" | "volume";  // bind = host path, volume = podman volume
  hostPath: string;         // Used for bind mounts
  volumeName: string;       // Used for podman volumes
  containerPath: string;
  readOnly: boolean;
}

interface PodmanVolume {
  name: string;
  driver: string;
  mount_point: string;
}

interface EnvVar {
  key: string;
  value: string;
}

interface ValidationResult {
  check: string;
  status: "ok" | "warning" | "error";
  message: string;
  details?: string;
}

interface DeployStep {
  step: string;
  message: string;
  error: boolean;
  complete?: boolean;
  output?: boolean;
}

interface ImagePort {
  port: number;
  protocol: string;
}

interface ImageEnvVar {
  key: string;
  value: string;
  has_value: boolean;
}

interface ImageConfig {
  exposed_ports: ImagePort[];
  environment: ImageEnvVar[];
  volumes: string[];
  labels: Record<string, string>;
  working_dir: string;
  user: string;
  entrypoint: string[];
  cmd: string[];
}

function ContainerCreateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const { settings } = useSettings();
  const deployOutputRef = useRef<HTMLDivElement>(null);

  // Edit mode state
  const editContainerId = searchParams.get("edit");
  const isEditMode = !!editContainerId;
  const [isLoadingContainer, setIsLoadingContainer] = useState(false);
  const [originalContainerName, setOriginalContainerName] = useState("");

  // Basic settings - use container defaults from settings
  const [containerName, setContainerName] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageTag, setImageTag] = useState("latest");
  const [autoStart, setAutoStart] = useState(settings.container.autoStartContainers);
  const [privileged, setPrivileged] = useState(settings.container.enablePrivilegedByDefault);
  const [networkMode, setNetworkMode] = useState<string>(settings.container.defaultNetworkMode);
  const [restartPolicy, setRestartPolicy] = useState<string>(settings.container.defaultRestartPolicy);
  
  // Docker Hub search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DockerHubImage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Port mappings
  const [ports, setPorts] = useState<PortMapping[]>([]);
  
  // Volume mounts
  const [volumes, setVolumes] = useState<VolumeMount[]>([]);
  const [newVolumeType, setNewVolumeType] = useState<"bind" | "volume">("volume");
  const [newVolumeName, setNewVolumeName] = useState("");
  const [newHostPath, setNewHostPath] = useState("");
  const [newContainerPath, setNewContainerPath] = useState("");
  const [newReadOnly, setNewReadOnly] = useState(false);
  const [podmanVolumes, setPodmanVolumes] = useState<PodmanVolume[]>([]);
  
  // Environment variables
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  
  // Advanced settings
  const [command, setCommand] = useState("");
  const [entrypoint, setEntrypoint] = useState("");
  const [workingDir, setWorkingDir] = useState("");
  const [user, setUser] = useState("");
  const [hostname, setHostname] = useState("");
  const [cpuLimit, setCpuLimit] = useState("");
  const [memoryLimit, setMemoryLimit] = useState("");

  // Web UI settings (for desktop icon)
  const [hasWebUI, setHasWebUI] = useState(false);
  const [webUIPort, setWebUIPort] = useState("");
  const [webUIPath, setWebUIPath] = useState("/");
  const [containerIcon, setContainerIcon] = useState("");
  const [iconLight, setIconLight] = useState("");
  const [iconDark, setIconDark] = useState("");

  // UI state
  const [error, setError] = useState<string | null>(null);
  
  // Validation and deployment state
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [showDeployDialog, setShowDeployDialog] = useState(false);
  const [deploySteps, setDeploySteps] = useState<DeployStep[]>([]);
  const [deployOutput, setDeployOutput] = useState<string[]>([]);
  const [deployComplete, setDeployComplete] = useState(false);
  const [deployError, setDeployError] = useState(false);

  // Image inspection state
  const [showInspectDialog, setShowInspectDialog] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectStatus, setInspectStatus] = useState<string>("");
  const [inspectOutput, setInspectOutput] = useState<string[]>([]);
  const [imageConfig, setImageConfig] = useState<ImageConfig | null>(null);
  const inspectOutputRef = useRef<HTMLDivElement>(null);

  // Fetch available Podman volumes
  useEffect(() => {
    const fetchVolumes = async () => {
      if (!token) return;
      try {
        const response = await fetch("/api/volumes", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setPodmanVolumes(data || []);
        }
      } catch (err) {
        console.error("Failed to fetch volumes:", err);
      }
    };
    fetchVolumes();
  }, [token]);

  // Auto-scroll deploy output
  useEffect(() => {
    if (deployOutputRef.current) {
      deployOutputRef.current.scrollTop = deployOutputRef.current.scrollHeight;
    }
  }, [deployOutput, deploySteps]);

  // Auto-scroll inspect output
  useEffect(() => {
    if (inspectOutputRef.current) {
      inspectOutputRef.current.scrollTop = inspectOutputRef.current.scrollHeight;
    }
  }, [inspectOutput]);

  // Load existing container configuration in edit mode
  useEffect(() => {
    if (!editContainerId || !token) return;

    const loadContainerConfig = async () => {
      setIsLoadingContainer(true);
      setError(null);

      try {
        const response = await fetch(`/api/containers/${editContainerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Failed to load container configuration");
        }

        const data = await response.json();

        // Set basic settings
        const name = data.name?.replace(/^\//, "") || "";
        setContainerName(name);
        setOriginalContainerName(name);

        // Parse image name and tag
        const imageWithTag = data.image || "";
        const lastColon = imageWithTag.lastIndexOf(":");
        if (lastColon > 0 && !imageWithTag.substring(lastColon).includes("/")) {
          setImageName(imageWithTag.substring(0, lastColon));
          setImageTag(imageWithTag.substring(lastColon + 1));
        } else {
          setImageName(imageWithTag);
          setImageTag("latest");
        }

        // Set restart policy
        if (data.restart_policy?.name) {
          setRestartPolicy(data.restart_policy.name);
        }

        // Set network mode
        if (data.network_mode) {
          setNetworkMode(data.network_mode);
        }

        // Set hostname
        if (data.hostname) {
          setHostname(data.hostname);
        }

        // Set user
        if (data.user) {
          setUser(data.user);
        }

        // Set working directory
        if (data.working_dir) {
          setWorkingDir(data.working_dir);
        }

        // Parse environment variables
        if (data.env && Array.isArray(data.env)) {
          const skipEnvVars = new Set(["PATH", "HOME", "HOSTNAME", "TERM"]);
          const parsedEnvVars: EnvVar[] = data.env
            .map((envStr: string) => {
              const eqIndex = envStr.indexOf("=");
              if (eqIndex > 0) {
                return {
                  key: envStr.substring(0, eqIndex),
                  value: envStr.substring(eqIndex + 1),
                };
              }
              return null;
            })
            .filter((e: EnvVar | null): e is EnvVar => e !== null && !skipEnvVars.has(e.key));
          setEnvVars(parsedEnvVars);
        }

        // Parse port bindings
        if (data.port_bindings) {
          const parsedPorts: PortMapping[] = [];
          for (const [containerPortProto, bindings] of Object.entries(data.port_bindings)) {
            const [containerPort, protocol] = containerPortProto.split("/");
            if (Array.isArray(bindings)) {
              for (const binding of bindings as Array<{ HostPort: string }>) {
                parsedPorts.push({
                  hostPort: binding.HostPort || containerPort,
                  containerPort: containerPort,
                  protocol: (protocol || "tcp") as "tcp" | "udp",
                });
              }
            }
          }
          setPorts(parsedPorts);
        }

        // Parse mounts/volumes
        if (data.mounts && Array.isArray(data.mounts)) {
          const parsedVolumes: VolumeMount[] = data.mounts
            .filter((m: { Type: string }) => m.Type === "bind" || m.Type === "volume")
            .map((m: { Type: string; Source: string; Destination: string; RW: boolean }) => ({
              type: m.Type === "volume" ? "volume" as const : "bind" as const,
              hostPath: m.Type === "bind" ? (m.Source || "") : "",
              volumeName: m.Type === "volume" ? (m.Source || "") : "",
              containerPath: m.Destination || "",
              readOnly: !m.RW,
            }));
          setVolumes(parsedVolumes);
        }

        // Set command (Cmd)
        if (data.cmd && Array.isArray(data.cmd) && data.cmd.length > 0) {
          setCommand(data.cmd.join(" "));
        }

        // Set entrypoint
        if (data.entrypoint && Array.isArray(data.entrypoint) && data.entrypoint.length > 0) {
          setEntrypoint(data.entrypoint.join(" "));
        }

        // Set memory limit (convert from bytes to MB string)
        if (data.memory_limit && data.memory_limit > 0) {
          const memoryMB = Math.round(data.memory_limit / (1024 * 1024));
          setMemoryLimit(`${memoryMB}m`);
        }

        // Set auto-start from Stardeck metadata
        if (data.auto_start !== undefined) {
          setAutoStart(data.auto_start);
        }

        // Set Web UI settings from Stardeck metadata
        if (data.has_web_ui !== undefined) {
          setHasWebUI(data.has_web_ui);
        }
        if (data.web_ui_port) {
          setWebUIPort(String(data.web_ui_port));
        }
        if (data.web_ui_path) {
          setWebUIPath(data.web_ui_path);
        }
        if (data.icon) {
          setContainerIcon(data.icon);
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load container");
      } finally {
        setIsLoadingContainer(false);
      }
    };

    loadContainerConfig();
  }, [editContainerId, token]);

  // Inspect image via WebSocket (with optional pull)
  const inspectImage = (pullIfNeeded: boolean) => {
    if (!imageName) {
      setError("Please enter an image name first");
      return;
    }

    setShowInspectDialog(true);
    setIsInspecting(true);
    setInspectStatus("connecting");
    setInspectOutput([]);
    setImageConfig(null);

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/images/inspect/ws`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      const fullImage = imageTag ? `${imageName}:${imageTag}` : imageName;
      ws.send(JSON.stringify({ image: fullImage, pull: pullIfNeeded }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.error) {
          setInspectStatus("error");
          setInspectOutput(prev => [...prev, `Error: ${data.error}`]);
          setIsInspecting(false);
          return;
        }

        if (data.status === "pulling") {
          setInspectStatus("pulling");
          if (data.output) {
            setInspectOutput(prev => [...prev, data.output]);
          } else if (data.message) {
            setInspectOutput(prev => [...prev, data.message]);
          }
        } else if (data.status === "pulled") {
          setInspectOutput(prev => [...prev, "✓ Image pulled successfully"]);
        } else if (data.status === "inspecting") {
          setInspectStatus("inspecting");
          setInspectOutput(prev => [...prev, "Analyzing image configuration..."]);
        } else if (data.status === "complete") {
          setInspectStatus("complete");
          if (data.config) {
            setImageConfig(data.config);
            setInspectOutput(prev => [...prev, "✓ Image configuration loaded"]);
          }
          setIsInspecting(false);
        } else if (data.status === "not_found") {
          setInspectStatus("not_found");
          setIsInspecting(false);
        }
      } catch (err) {
        console.error("WebSocket message parse error:", err);
      }
    };

    ws.onerror = () => {
      setInspectStatus("error");
      setInspectOutput(prev => [...prev, "WebSocket connection failed"]);
      setIsInspecting(false);
    };

    ws.onclose = () => {
      if (isInspecting) {
        setIsInspecting(false);
      }
    };
  };

  // Apply image configuration to form
  const applyImageConfig = () => {
    if (!imageConfig) return;

    // Apply exposed ports
    if (imageConfig.exposed_ports && imageConfig.exposed_ports.length > 0) {
      const newPorts: PortMapping[] = imageConfig.exposed_ports.map(p => ({
        hostPort: String(p.port),
        containerPort: String(p.port),
        protocol: (p.protocol || "tcp") as "tcp" | "udp",
      }));
      setPorts(prev => {
        // Merge with existing, avoiding duplicates
        const existingContainerPorts = new Set(prev.map(p => `${p.containerPort}/${p.protocol}`));
        const toAdd = newPorts.filter(p => !existingContainerPorts.has(`${p.containerPort}/${p.protocol}`));
        return [...prev, ...toAdd];
      });
    }

    // Apply volumes - always default to Podman volumes (managed storage)
    if (imageConfig.volumes && imageConfig.volumes.length > 0) {
      // Generate a container-specific subdirectory name from the image name
      const containerSubdir = containerName || imageName.replace(/[^a-zA-Z0-9-_]/g, '-');

      const newVolumes: VolumeMount[] = imageConfig.volumes.map(v => {
        // Create volume name from container path (e.g., /var/lib/postgresql/data -> postgres-data)
        const volName = v.split('/').filter(Boolean).pop() || 'data';
        const suggestedVolumeName = `${containerSubdir}-${volName}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

        return {
          type: "volume" as const,
          hostPath: "",
          volumeName: suggestedVolumeName,
          containerPath: v,
          readOnly: false,
        };
      });
      setVolumes(prev => {
        const existingPaths = new Set(prev.map(v => v.containerPath));
        const toAdd = newVolumes.filter(v => !existingPaths.has(v.containerPath));
        return [...prev, ...toAdd];
      });
    }

    // Apply environment variables (only those with values, skip PATH and common system vars)
    const skipEnvVars = new Set(["PATH", "HOME", "HOSTNAME", "TERM", "LANG", "LC_ALL"]);
    if (imageConfig.environment && imageConfig.environment.length > 0) {
      const newEnvVars: EnvVar[] = imageConfig.environment
        .filter(e => e.has_value && !skipEnvVars.has(e.key) && !e.key.startsWith("GPG_"))
        .map(e => ({
          key: e.key,
          value: e.value,
        }));
      setEnvVars(prev => {
        const existingKeys = new Set(prev.map(e => e.key));
        const toAdd = newEnvVars.filter(e => !existingKeys.has(e.key));
        return [...prev, ...toAdd];
      });
    }

    // Apply working directory
    if (imageConfig.working_dir && !workingDir) {
      setWorkingDir(imageConfig.working_dir);
    }

    // Apply user
    if (imageConfig.user && !user) {
      setUser(imageConfig.user);
    }

    setShowInspectDialog(false);
  };

  // Build the container creation payload
  const buildPayload = useCallback(() => {
    return {
      name: containerName || undefined,
      image: imageTag ? `${imageName}:${imageTag}` : imageName,
      auto_start: autoStart,
      privileged,
      network_mode: networkMode,
      restart_policy: restartPolicy,
      ports: ports.map(p => ({
        host_port: parseInt(p.hostPort),
        container_port: parseInt(p.containerPort),
        protocol: p.protocol,
      })),
      volumes: volumes.map(v => ({
        type: v.type,
        source: v.type === "bind" ? v.hostPath : v.volumeName,
        target: v.containerPath,
        read_only: v.readOnly,
      })),
      environment: envVars.reduce((acc, ev) => {
        acc[ev.key] = ev.value;
        return acc;
      }, {} as Record<string, string>),
      command: command ? command.split(" ") : undefined,
      entrypoint: entrypoint ? entrypoint.split(" ") : undefined,
      work_dir: workingDir || undefined,
      user: user || undefined,
      hostname: hostname || undefined,
      cpu_limit: cpuLimit ? parseFloat(cpuLimit) : undefined,
      memory_limit: memoryLimit ? parseInt(memoryLimit) * 1024 * 1024 : undefined,
      // Web UI settings for desktop icon
      has_web_ui: hasWebUI,
      web_ui_port: hasWebUI && webUIPort ? parseInt(webUIPort) : undefined,
      web_ui_path: hasWebUI ? webUIPath || "/" : undefined,
      icon: containerIcon || undefined,
      icon_light: iconLight || undefined,
      icon_dark: iconDark || undefined,
    };
  }, [containerName, imageTag, imageName, autoStart, privileged, networkMode, restartPolicy, ports, volumes, envVars, command, entrypoint, workingDir, user, hostname, cpuLimit, memoryLimit, hasWebUI, webUIPort, webUIPath, containerIcon, iconLight, iconDark]);

  // Live validation when key fields change
  useEffect(() => {
    const validateConfig = async () => {
      if (!token || !imageName) {
        setValidationResults([]);
        return;
      }

      setIsValidating(true);
      try {
        const payload = buildPayload();
        const response = await fetch("/api/containers/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const data = await response.json();
          setValidationResults(data.results || []);
        }
      } catch (err) {
        console.error("Validation error:", err);
      } finally {
        setIsValidating(false);
      }
    };

    const timer = setTimeout(validateConfig, 500);
    return () => clearTimeout(timer);
  }, [token, imageName, buildPayload]);

  // Deploy container with WebSocket streaming
  const deployContainer = async () => {
    if (!imageName) {
      setError("Please specify an image");
      return;
    }

    // Check for validation errors
    const hasErrors = validationResults.some(r => r.status === "error");
    if (hasErrors) {
      setError("Please fix validation errors before deploying");
      return;
    }

    setShowDeployDialog(true);
    setDeploySteps([]);
    setDeployOutput([]);
    setDeployComplete(false);
    setDeployError(false);

    // In edit mode, first stop and remove the old container
    if (isEditMode && editContainerId) {
      setDeploySteps([{ step: "replace", message: "Stopping old container...", error: false }]);

      try {
        // Stop the container (ignore errors if it's already stopped)
        await fetch(`/api/containers/${editContainerId}/stop`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });

        setDeploySteps([{ step: "replace", message: "Removing old container...", error: false }]);

        // Remove the container
        const removeResponse = await fetch(`/api/containers/${editContainerId}?force=true`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!removeResponse.ok) {
          throw new Error("Failed to remove old container");
        }

        setDeploySteps([{ step: "replace", message: "Old container removed", error: false, complete: true }]);
      } catch (err) {
        setDeploySteps(prev => [...prev, {
          step: "replace",
          message: `Failed to replace container: ${err instanceof Error ? err.message : "Unknown error"}`,
          error: true,
        }]);
        setDeployError(true);
        return;
      }
    }

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/containers/deploy`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // Send container configuration
      ws.send(JSON.stringify(buildPayload()));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.output) {
          // This is streaming output (like pull progress)
          setDeployOutput(prev => [...prev, data.message]);
        } else {
          // This is a step update
          setDeploySteps(prev => {
            const existing = prev.find(s => s.step === data.step);
            if (existing) {
              return prev.map(s => s.step === data.step ? data : s);
            }
            return [...prev, data];
          });

          if (data.error) {
            setDeployError(true);
          }

          if (data.step === "complete" && data.complete) {
            setDeployComplete(true);
          }
        }
      } catch (err) {
        console.error("WebSocket message parse error:", err);
      }
    };

    ws.onerror = () => {
      setDeploySteps(prev => [...prev, {
        step: "error",
        message: "WebSocket connection failed",
        error: true,
      }]);
      setDeployError(true);
    };

    ws.onclose = () => {
      if (!deployComplete && !deployError) {
        // Connection closed unexpectedly
        setDeploySteps(prev => [...prev, {
          step: "error",
          message: "Connection closed unexpectedly",
          error: true,
        }]);
      }
    };
  };

  // Search Docker Hub images
  const searchDockerHub = useCallback(async (query: string) => {
    if (!query.trim() || !token) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/dockerhub/search?query=${encodeURIComponent(query)}&page_size=10`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      if (!response.ok) throw new Error("Failed to search Docker Hub");
      
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.error("Docker Hub search error:", err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [token]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchDockerHub(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, searchDockerHub]);

  // Select image from search results
  const selectImage = (image: DockerHubImage) => {
    console.log("Selecting image:", image);
    setImageName(image.repo_name);
    setSearchQuery("");
    setSearchResults([]);
  };

  // Volume management
  const addVolume = (type: "bind" | "volume", source: string, containerPath: string, readOnly: boolean) => {
    if (source && containerPath) {
      setVolumes([...volumes, {
        type,
        hostPath: type === "bind" ? source : "",
        volumeName: type === "volume" ? source : "",
        containerPath,
        readOnly
      }]);
      setNewHostPath("");
      setNewContainerPath("");
      setNewReadOnly(false);
      setNewVolumeName("");
      setNewVolumeType("volume");
    }
  };

  const removeVolume = (index: number) => {
    setVolumes(volumes.filter((_, i) => i !== index));
  };

  // Environment variable management
  const addEnvVar = () => {
    if (newEnvKey && newEnvValue) {
      setEnvVars([...envVars, { key: newEnvKey, value: newEnvValue }]);
      setNewEnvKey("");
      setNewEnvValue("");
    }
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  // Import .env file
  const importEnvFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const lines = content.split("\n");
      const newVars: EnvVar[] = [];

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=");
          if (key && valueParts.length > 0) {
            newVars.push({
              key: key.trim(),
              value: valueParts.join("=").trim().replace(/^["']|["']$/g, ""),
            });
          }
        }
      });

      setEnvVars([...envVars, ...newVars]);
    };
    reader.readAsText(file);
  };

  // Export .env file
  const exportEnvFile = () => {
    const content = envVars.map(v => `${v.key}=${v.value}`).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${containerName || "container"}.env`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/container-manager")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {isEditMode ? "Edit Container" : "Create Container"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isEditMode
                  ? `Editing ${originalContainerName || "container"} - changes will recreate the container`
                  : "Deploy a new container with custom configuration"
                }
              </p>
            </div>
            {isLoadingContainer && (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/container-manager")}>
              Cancel
            </Button>
            <Button
              onClick={deployContainer}
              disabled={isValidating || isLoadingContainer || !imageName || validationResults.some(r => r.status === "error")}
            >
              <Play className="h-4 w-4 mr-2" />
              {isEditMode ? "Update Container" : "Deploy Container"}
            </Button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
            {error}
          </div>
        )}

        {/* Validation errors banner */}
        {validationResults.some(r => r.status === "error") && (
          <div className="mx-6 mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-amber-500 font-medium mb-2">
              <AlertCircle className="h-4 w-4" />
              Configuration Issues
            </div>
            <ul className="text-sm text-amber-400 space-y-1">
              {validationResults.filter(r => r.status === "error").map((r, i) => (
                <li key={i}>• {r.message}: {r.details}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-6 max-w-6xl mx-auto space-y-6">
            {/* Image Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Container Image</CardTitle>
                <CardDescription>
                  Select or search for a Docker image from Docker Hub
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search Docker Hub (e.g., nginx, postgres, redis)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-3 text-xs text-muted-foreground">
                      Searching...
                    </div>
                  )}
                </div>

                {/* Search results */}
                {searchResults.length > 0 && (
                  <Card className="border-dashed">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Search Results</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {searchResults.map((image, index) => (
                        <button
                          key={index}
                          type="button"
                          className="w-full flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-accent cursor-pointer transition-colors group text-left"
                          onClick={() => {
                            console.log("Clicked image:", image.repo_name);
                            selectImage(image);
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold group-hover:text-primary transition-colors">{image.repo_name}</span>
                              {image.is_official && (
                                <Badge variant="default" className="text-xs">Official</Badge>
                              )}
                              {image.is_automated && (
                                <Badge variant="secondary" className="text-xs">Automated</Badge>
                              )}
                              {!image.is_official && image.repo_owner && (
                                <Badge variant="outline" className="text-xs">by {image.repo_owner}</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {image.short_description || "No description available"}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span>★ {image.star_count.toLocaleString()}</span>
                              <span>↓ {image.pull_count.toLocaleString()} pulls</span>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                            Click to select →
                          </div>
                        </button>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Selected image */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Image Name</Label>
                    <Input
                      placeholder="e.g., nginx, postgres, myapp"
                      value={imageName}
                      onChange={(e) => setImageName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tag</Label>
                    <Input
                      placeholder="latest"
                      value={imageTag}
                      onChange={(e) => setImageTag(e.target.value)}
                    />
                  </div>
                </div>

                {imageName && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        Will pull: <code className="px-1.5 py-0.5 bg-background rounded">{imageName}:{imageTag}</code>
                      </span>
                      <a
                        href={`https://hub.docker.com/r/${imageName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        View on Docker Hub
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    {/* Inspect Image Buttons */}
                    <div className="flex items-center gap-2 p-3 bg-accent/10 border border-accent/20 rounded-lg">
                      <Download className="h-4 w-4 text-accent" />
                      <span className="text-sm flex-1">
                        Pull image to auto-detect ports, volumes, and environment variables
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => inspectImage(true)}
                        disabled={isInspecting}
                      >
                        {isInspecting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Inspecting...
                          </>
                        ) : (
                          <>
                            <Search className="h-4 w-4 mr-2" />
                            Pull & Inspect
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Configuration Tabs */}
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="ports">Ports</TabsTrigger>
                <TabsTrigger value="volumes">Volumes</TabsTrigger>
                <TabsTrigger value="env">Environment</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>

              {/* Basic Settings */}
              <TabsContent value="basic" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Configuration</CardTitle>
                    <CardDescription>
                      Configure basic container settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Container Name (optional)</Label>
                      <Input
                        placeholder="my-container"
                        value={containerName}
                        onChange={(e) => setContainerName(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        If not specified, a random name will be generated
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Network Mode</Label>
                        <Select value={networkMode} onValueChange={setNetworkMode}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bridge">Bridge</SelectItem>
                            <SelectItem value="host">Host</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Restart Policy</Label>
                        <Select value={restartPolicy} onValueChange={setRestartPolicy}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no">No</SelectItem>
                            <SelectItem value="always">Always</SelectItem>
                            <SelectItem value="unless-stopped">Unless Stopped</SelectItem>
                            <SelectItem value="on-failure">On Failure</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Auto-start container</Label>
                        <p className="text-xs text-muted-foreground">
                          Start the container immediately after creation
                        </p>
                      </div>
                      <Switch checked={autoStart} onCheckedChange={setAutoStart} />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Privileged mode</Label>
                        <p className="text-xs text-muted-foreground">
                          Grant extended privileges (use with caution)
                        </p>
                      </div>
                      <Switch checked={privileged} onCheckedChange={setPrivileged} />
                    </div>

                    {/* Web UI / Desktop Icon Section */}
                    <div className="pt-4 border-t">
                      <div className="flex items-center gap-2 mb-4">
                        <Globe className="h-4 w-4 text-cyan-400" />
                        <Label className="text-base font-semibold">Desktop App Settings</Label>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label>Has Web UI</Label>
                            <p className="text-xs text-muted-foreground">
                              Enable to show as desktop app with icon
                            </p>
                          </div>
                          <Switch checked={hasWebUI} onCheckedChange={setHasWebUI} />
                        </div>

                        {hasWebUI && (
                          <>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Web UI Port</Label>
                                <Select value={webUIPort} onValueChange={setWebUIPort}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select port" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ports.length > 0 ? (
                                      ports.map((port, index) => (
                                        <SelectItem key={index} value={port.hostPort}>
                                          {port.hostPort} → {port.containerPort}/{port.protocol}
                                        </SelectItem>
                                      ))
                                    ) : (
                                      <SelectItem value="" disabled>
                                        Add ports first
                                      </SelectItem>
                                    )}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  Host port that serves the web interface
                                </p>
                              </div>

                              <div className="space-y-2">
                                <Label>Web UI Path</Label>
                                <Input
                                  placeholder="/"
                                  value={webUIPath}
                                  onChange={(e) => setWebUIPath(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                  URL path to app (e.g. &quot;/&quot; or &quot;/admin&quot;)
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Icon URL (Light Theme)</Label>
                                <Input
                                  placeholder="https://example.com/icon-light.svg"
                                  value={iconLight}
                                  onChange={(e) => setIconLight(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Icon for light backgrounds
                                </p>
                              </div>
                              <div className="space-y-2">
                                <Label>Icon URL (Dark Theme)</Label>
                                <Input
                                  placeholder="https://example.com/icon-dark.svg"
                                  value={iconDark}
                                  onChange={(e) => setIconDark(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Icon for dark backgrounds
                                </p>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Port Mappings */}
              {/* Port Mappings */}
              <TabsContent value="ports" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Port Mappings</CardTitle>
                    <CardDescription>
                      Expose container ports to the host. Ports in use are highlighted.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PortSelector ports={ports} onPortsChange={setPorts} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Volume Mounts */}
              <TabsContent value="volumes" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Volume Mounts</CardTitle>
                    <CardDescription>
                      Mount Podman volumes or host directories into the container. Podman volumes are recommended for better isolation and portability.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Volume type info */}
                    <div className="p-3 bg-accent/10 border border-accent/20 rounded-lg text-sm">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-accent">Volume Types</p>
                          <ul className="mt-1 text-muted-foreground text-xs space-y-1">
                            <li><strong>Podman Volume</strong> (recommended): Managed storage, better isolation, portable</li>
                            <li><strong>Bind Mount</strong>: Direct host directory access, for config files or shared data</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Add volume form */}
                    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Volume Type</Label>
                          <Select value={newVolumeType} onValueChange={(v: "bind" | "volume") => setNewVolumeType(v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="volume">Podman Volume</SelectItem>
                              <SelectItem value="bind">Bind Mount</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Container Path</Label>
                          <Input
                            placeholder="/container/path"
                            value={newContainerPath}
                            onChange={(e) => setNewContainerPath(e.target.value)}
                          />
                        </div>
                      </div>

                      {newVolumeType === "volume" ? (
                        <div className="space-y-2">
                          <Label>Volume Name</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="my-volume (will be created if it doesn't exist)"
                              value={newVolumeName}
                              onChange={(e) => setNewVolumeName(e.target.value)}
                              className="flex-1"
                            />
                            {podmanVolumes.length > 0 && (
                              <Select onValueChange={(v) => setNewVolumeName(v)}>
                                <SelectTrigger className="w-48">
                                  <SelectValue placeholder="Or select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {podmanVolumes.map((vol) => (
                                    <SelectItem key={vol.name} value={vol.name}>
                                      {vol.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Enter a name for a new volume or select an existing one
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label>Host Path</Label>
                          <Input
                            placeholder="/path/on/host"
                            value={newHostPath}
                            onChange={(e) => setNewHostPath(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Absolute path to directory on the host system
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <Label>Read-only mount</Label>
                        <Switch checked={newReadOnly} onCheckedChange={setNewReadOnly} />
                      </div>

                      <Button
                        onClick={() => {
                          const source = newVolumeType === "volume" ? newVolumeName : newHostPath;
                          addVolume(newVolumeType, source, newContainerPath, newReadOnly);
                        }}
                        className="w-full"
                        disabled={!newContainerPath || (newVolumeType === "volume" ? !newVolumeName : !newHostPath)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Volume
                      </Button>
                    </div>

                    {/* Volume list */}
                    {volumes.length > 0 && (
                      <div className="space-y-2">
                        <Label>Configured Volumes ({volumes.length})</Label>
                        <div className="space-y-2">
                          {volumes.map((volume, index) => (
                            <div
                              key={index}
                              className={`p-3 rounded-lg border ${
                                volume.type === "bind" && !volume.hostPath
                                  ? 'border-amber-500/50 bg-amber-500/5'
                                  : volume.type === "volume" && !volume.volumeName
                                    ? 'border-amber-500/50 bg-amber-500/5'
                                    : 'bg-card'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <HardDrive className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <Badge variant={volume.type === "volume" ? "default" : "secondary"} className="text-xs">
                                  {volume.type === "volume" ? "Podman Volume" : "Bind Mount"}
                                </Badge>
                                <span className="text-xs text-muted-foreground flex-1">→</span>
                                <code className="text-xs bg-muted px-2 py-1 rounded">{volume.containerPath}</code>
                                {volume.readOnly && (
                                  <Badge variant="outline" className="flex-shrink-0 text-xs">RO</Badge>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeVolume(index)}
                                  className="h-6 w-6"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>

                              {volume.type === "volume" ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    placeholder="Enter volume name (required)"
                                    value={volume.volumeName}
                                    onChange={(e) => {
                                      const updated = [...volumes];
                                      updated[index] = { ...updated[index], volumeName: e.target.value };
                                      setVolumes(updated);
                                    }}
                                    className={`font-mono text-sm ${!volume.volumeName ? 'border-amber-500/50' : ''}`}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Input
                                    placeholder="Enter host path (required)"
                                    value={volume.hostPath}
                                    onChange={(e) => {
                                      const updated = [...volumes];
                                      updated[index] = { ...updated[index], hostPath: e.target.value };
                                      setVolumes(updated);
                                    }}
                                    className={`font-mono text-sm ${!volume.hostPath ? 'border-amber-500/50' : ''}`}
                                  />
                                </div>
                              )}

                              {volume.type === "bind" && !volume.hostPath && (
                                <p className="text-xs text-amber-500 mt-1">
                                  Host path required - enter the directory on your server
                                </p>
                              )}
                              {volume.type === "volume" && !volume.volumeName && (
                                <p className="text-xs text-amber-500 mt-1">
                                  Volume name required
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Environment Variables */}
              <TabsContent value="env" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Environment Variables</CardTitle>
                    <CardDescription>
                      Set environment variables for the container
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Import/Export */}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => document.getElementById("env-file-input")?.click()}>
                        <Upload className="h-4 w-4 mr-2" />
                        Import .env
                      </Button>
                      <input
                        id="env-file-input"
                        type="file"
                        accept=".env,.txt"
                        className="hidden"
                        onChange={importEnvFile}
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={exportEnvFile}
                        disabled={envVars.length === 0}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export .env
                      </Button>
                    </div>

                    {/* Add env var */}
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-5 space-y-2">
                        <Label>Key</Label>
                        <Input
                          placeholder="DATABASE_URL"
                          value={newEnvKey}
                          onChange={(e) => setNewEnvKey(e.target.value.toUpperCase())}
                        />
                      </div>
                      <div className="col-span-5 space-y-2">
                        <Label>Value</Label>
                        <Input
                          placeholder="postgres://..."
                          value={newEnvValue}
                          onChange={(e) => setNewEnvValue(e.target.value)}
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label className="invisible">Add</Label>
                        <Button onClick={addEnvVar} className="w-full">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Env var list */}
                    {envVars.length > 0 && (
                      <div className="space-y-2">
                        <Label>Environment Variables ({envVars.length})</Label>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {envVars.map((env, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 p-2 rounded-lg border bg-card"
                            >
                              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <Input
                                value={env.key}
                                onChange={(e) => {
                                  const updated = [...envVars];
                                  updated[index] = { ...updated[index], key: e.target.value.toUpperCase() };
                                  setEnvVars(updated);
                                }}
                                className="font-mono text-sm w-40 flex-shrink-0"
                                placeholder="KEY"
                              />
                              <span className="text-muted-foreground">=</span>
                              <Input
                                value={env.value}
                                onChange={(e) => {
                                  const updated = [...envVars];
                                  updated[index] = { ...updated[index], value: e.target.value };
                                  setEnvVars(updated);
                                }}
                                className="font-mono text-sm flex-1"
                                placeholder="value"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeEnvVar(index)}
                                className="flex-shrink-0 h-8 w-8"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Advanced Settings */}
              <TabsContent value="advanced" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Advanced Configuration</CardTitle>
                    <CardDescription>
                      Fine-tune container runtime settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Command</Label>
                        <Input
                          placeholder="Override default command"
                          value={command}
                          onChange={(e) => setCommand(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Entrypoint</Label>
                        <Input
                          placeholder="Override default entrypoint"
                          value={entrypoint}
                          onChange={(e) => setEntrypoint(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Working Directory</Label>
                        <Input
                          placeholder="/app"
                          value={workingDir}
                          onChange={(e) => setWorkingDir(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>User</Label>
                        <Input
                          placeholder="1000:1000 or username"
                          value={user}
                          onChange={(e) => setUser(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Hostname</Label>
                        <Input
                          placeholder="my-container"
                          value={hostname}
                          onChange={(e) => setHostname(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>CPU Limit (cores)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="1.5"
                          value={cpuLimit}
                          onChange={(e) => setCpuLimit(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Number of CPU cores (e.g., 1.5)
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Memory Limit (MB)</Label>
                        <Input
                          type="number"
                          placeholder="512"
                          value={memoryLimit}
                          onChange={(e) => setMemoryLimit(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Maximum memory in megabytes
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </div>

      {/* Deployment Dialog */}
      <Dialog open={showDeployDialog} onOpenChange={setShowDeployDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {deployComplete ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Deployment Complete
                </>
              ) : deployError ? (
                <>
                  <XCircle className="h-5 w-5 text-red-500" />
                  Deployment Failed
                </>
              ) : (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Deploying Container
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {/* Deployment Steps */}
          <div className="space-y-3 overflow-hidden">
            {deploySteps.map((step, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 p-3 rounded-lg border overflow-hidden ${
                  step.error
                    ? "bg-red-500/10 border-red-500/30"
                    : step.complete
                      ? "bg-green-500/10 border-green-500/30"
                      : "bg-muted/50 border-muted"
                }`}
              >
                {step.error ? (
                  <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                ) : step.complete ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="font-medium capitalize">
                    {step.step === "replace" ? "Replace" :
                     step.step === "validate" ? "Validation" :
                     step.step === "pull" ? "Image" :
                     step.step === "volumes" ? "Volumes" :
                     step.step === "create" ? "Create" :
                     step.step === "start" ? "Start" :
                     step.step === "complete" ? "Complete" :
                     step.step}
                  </div>
                  <div className="text-sm text-muted-foreground break-words">{step.message}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Streaming Output */}
          {deployOutput.length > 0 && (
            <div className="mt-4">
              <Label className="mb-2 block">Output</Label>
              <ScrollArea className="h-48 border rounded-lg bg-black/90 p-3">
                <div ref={deployOutputRef} className="font-mono text-xs text-green-400 space-y-0.5">
                  {deployOutput.map((line, index) => (
                    <div key={index} className="whitespace-pre-wrap">{line}</div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Validation Results Summary */}
          {validationResults.length > 0 && !deployComplete && (
            <div className="mt-4 space-y-2">
              <Label className="mb-2 block">Pre-flight Checks</Label>
              {validationResults.map((result, index) => (
                <div 
                  key={index}
                  className={`flex items-start gap-2 p-2 rounded text-sm ${
                    result.status === "error" 
                      ? "bg-red-500/10 text-red-400" 
                      : result.status === "warning"
                        ? "bg-yellow-500/10 text-yellow-400"
                        : "bg-green-500/10 text-green-400"
                  }`}
                >
                  {result.status === "error" ? (
                    <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  ) : result.status === "warning" ? (
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-medium">{result.check}:</span> {result.message}
                    {result.details && (
                      <div className="text-xs opacity-75 mt-1">{result.details}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-4">
            {deployComplete ? (
              <>
                <Button variant="outline" onClick={() => setShowDeployDialog(false)}>
                  Deploy Another
                </Button>
                <Button onClick={() => router.push("/container-manager")}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  View Containers
                </Button>
              </>
            ) : deployError ? (
              <Button variant="outline" onClick={() => setShowDeployDialog(false)}>
                Close
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Inspection Dialog */}
      <Dialog open={showInspectDialog} onOpenChange={(open) => !isInspecting && setShowInspectDialog(open)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {inspectStatus === "complete" ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Image Configuration Loaded
                </>
              ) : inspectStatus === "error" || inspectStatus === "not_found" ? (
                <>
                  <XCircle className="h-5 w-5 text-red-500" />
                  {inspectStatus === "not_found" ? "Image Not Found" : "Inspection Failed"}
                </>
              ) : (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {inspectStatus === "pulling" ? "Pulling Image..." : "Inspecting Image..."}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
            {/* Pull Progress Output */}
            {inspectOutput.length > 0 && (
              <div className="mt-2">
                <Label className="mb-2 block text-sm">Progress</Label>
                <ScrollArea className="h-32 border rounded-lg bg-black/90 p-3">
                  <div ref={inspectOutputRef} className="font-mono text-xs text-green-400 space-y-0.5">
                    {inspectOutput.map((line, index) => (
                      <div key={index} className="whitespace-pre-wrap break-all">{line}</div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Image Configuration Results */}
            {imageConfig && inspectStatus === "complete" && (
              <div className="mt-4 space-y-4">
                <Label className="block text-sm font-semibold">Discovered Configuration</Label>

              {/* Exposed Ports */}
              {imageConfig.exposed_ports && imageConfig.exposed_ports.length > 0 && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Network className="h-4 w-4 text-accent" />
                    <span className="text-sm font-medium">Exposed Ports ({imageConfig.exposed_ports.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {imageConfig.exposed_ports.map((port, i) => (
                      <span key={i} className="px-2 py-1 bg-accent/20 rounded text-xs font-mono">
                        {port.port}/{port.protocol}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Volume Mounts */}
              {imageConfig.volumes && imageConfig.volumes.length > 0 && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive className="h-4 w-4 text-accent" />
                    <span className="text-sm font-medium">Required Volumes ({imageConfig.volumes.length})</span>
                  </div>
                  <div className="space-y-1">
                    {imageConfig.volumes.map((vol, i) => (
                      <div key={i} className="text-xs font-mono text-muted-foreground">
                        {vol}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Environment Variables */}
              {imageConfig.environment && imageConfig.environment.filter(e => e.has_value && !["PATH", "HOME", "HOSTNAME"].includes(e.key)).length > 0 && (
                <div className="p-3 bg-muted/50 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 mb-2">
                    <Settings className="h-4 w-4 text-accent flex-shrink-0" />
                    <span className="text-sm font-medium">
                      Environment Variables ({imageConfig.environment.filter(e => e.has_value && !["PATH", "HOME", "HOSTNAME"].includes(e.key)).length})
                    </span>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto overflow-x-hidden">
                    {imageConfig.environment
                      .filter(e => e.has_value && !["PATH", "HOME", "HOSTNAME", "TERM", "LANG", "LC_ALL"].includes(e.key) && !e.key.startsWith("GPG_"))
                      .map((env, i) => (
                        <div key={i} className="text-xs font-mono flex items-start gap-0 min-w-0">
                          <span className="text-primary flex-shrink-0">{env.key}</span>
                          <span className="text-muted-foreground flex-shrink-0">=</span>
                          <span className="text-muted-foreground break-all">{env.value.length > 40 ? env.value.substring(0, 40) + "..." : env.value}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Working Directory */}
              {imageConfig.working_dir && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-accent" />
                    <span className="text-sm font-medium">Working Directory:</span>
                    <span className="text-xs font-mono text-muted-foreground">{imageConfig.working_dir}</span>
                  </div>
                </div>
              )}

              {/* No configuration found */}
              {(!imageConfig.exposed_ports || imageConfig.exposed_ports.length === 0) &&
               (!imageConfig.volumes || imageConfig.volumes.length === 0) &&
               (!imageConfig.environment || imageConfig.environment.filter(e => e.has_value).length === 0) && (
                <div className="p-3 bg-muted/50 rounded-lg text-center text-muted-foreground text-sm">
                  No specific configuration hints found in this image.
                </div>
              )}
            </div>
          )}

          {/* Not found message */}
          {inspectStatus === "not_found" && (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-center">
              <p className="text-sm text-destructive">
                Image not found locally. Click &quot;Pull &amp; Inspect&quot; to download it.
              </p>
            </div>
          )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-4 flex-shrink-0">
            {inspectStatus === "complete" && imageConfig && (
              <Button onClick={applyImageConfig}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Apply Configuration
              </Button>
            )}
            {!isInspecting && (
              <Button variant="outline" onClick={() => setShowInspectDialog(false)}>
                {inspectStatus === "complete" ? "Skip" : "Close"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// Wrap in Suspense for useSearchParams
export default function ContainerCreatePage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    }>
      <ContainerCreateContent />
    </Suspense>
  );
}
