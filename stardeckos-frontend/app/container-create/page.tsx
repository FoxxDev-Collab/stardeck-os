"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
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
  Save,
  Info,
  ExternalLink
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
  hostPath: string;
  containerPath: string;
  readOnly: boolean;
}

interface EnvVar {
  key: string;
  value: string;
}

export default function ContainerCreatePage() {
  const router = useRouter();
  const { token } = useAuth();
  
  // Basic settings
  const [containerName, setContainerName] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageTag, setImageTag] = useState("latest");
  const [autoStart, setAutoStart] = useState(true);
  const [privileged, setPrivileged] = useState(false);
  const [networkMode, setNetworkMode] = useState("bridge");
  const [restartPolicy, setRestartPolicy] = useState("unless-stopped");
  
  // Docker Hub search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DockerHubImage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Port mappings
  const [ports, setPorts] = useState<PortMapping[]>([]);
  
  // Volume mounts
  const [volumes, setVolumes] = useState<VolumeMount[]>([]);
  const [newHostPath, setNewHostPath] = useState("");
  const [newContainerPath, setNewContainerPath] = useState("");
  const [newReadOnly, setNewReadOnly] = useState(false);
  
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
  
  // UI state
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Port management
  const addPort = () => {
    if (newHostPort && newContainerPort) {
      setPorts([...ports, { 
        hostPort: newHostPort, 
        containerPort: newContainerPort, 
        protocol: newProtocol 
      }]);
      setNewHostPort("");
      setNewContainerPort("");
    }
  };

  const removePort = (index: number) => {
    setPorts(ports.filter((_, i) => i !== index));
  };

  const addCommonPort = (port: string, name: string) => {
    setPorts([...ports, { 
      hostPort: port, 
      containerPort: port, 
      protocol: "tcp" 
    }]);
  };

  // Volume management
  const addVolume = () => {
    if (newHostPath && newContainerPath) {
      setVolumes([...volumes, { 
        hostPath: newHostPath, 
        containerPath: newContainerPath, 
        readOnly: newReadOnly 
      }]);
      setNewHostPath("");
      setNewContainerPath("");
      setNewReadOnly(false);
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

  // Create container
  const createContainer = async () => {
    if (!imageName) {
      setError("Please specify an image");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const payload = {
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
          host_path: v.hostPath,
          container_path: v.containerPath,
          read_only: v.readOnly,
        })),
        env_vars: envVars.reduce((acc, ev) => {
          acc[ev.key] = ev.value;
          return acc;
        }, {} as Record<string, string>),
        command: command || undefined,
        entrypoint: entrypoint || undefined,
        working_dir: workingDir || undefined,
        user: user || undefined,
        hostname: hostname || undefined,
        cpu_limit: cpuLimit ? parseFloat(cpuLimit) : undefined,
        memory_limit: memoryLimit ? parseInt(memoryLimit) : undefined,
      };

      const response = await fetch("/api/containers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create container");
      }

      router.push("/container-manager");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create container");
    } finally {
      setIsCreating(false);
    }
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
              <h1 className="text-2xl font-bold">Create Container</h1>
              <p className="text-sm text-muted-foreground">
                Deploy a new container with custom configuration
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/container-manager")}>
              Cancel
            </Button>
            <Button onClick={createContainer} disabled={isCreating || !imageName}>
              <Play className="h-4 w-4 mr-2" />
              {isCreating ? "Creating..." : "Create & Start"}
            </Button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
            {error}
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
                      Mount host directories or volumes into the container
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Add volume */}
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-5 space-y-2">
                        <Label>Host Path</Label>
                        <Input
                          placeholder="/host/path"
                          value={newHostPath}
                          onChange={(e) => setNewHostPath(e.target.value)}
                        />
                      </div>
                      <div className="col-span-5 space-y-2">
                        <Label>Container Path</Label>
                        <Input
                          placeholder="/container/path"
                          value={newContainerPath}
                          onChange={(e) => setNewContainerPath(e.target.value)}
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label className="invisible">Add</Label>
                        <Button onClick={addVolume} className="w-full">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>Read-only mount</Label>
                      <Switch checked={newReadOnly} onCheckedChange={setNewReadOnly} />
                    </div>

                    {/* Volume list */}
                    {volumes.length > 0 && (
                      <div className="space-y-2">
                        <Label>Configured Volumes</Label>
                        <div className="space-y-2">
                          {volumes.map((volume, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-3 rounded-lg border bg-card"
                            >
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                <HardDrive className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="font-mono text-sm truncate">
                                    {volume.hostPath}
                                  </div>
                                  <div className="font-mono text-xs text-muted-foreground truncate">
                                    → {volume.containerPath}
                                  </div>
                                </div>
                                {volume.readOnly && (
                                  <Badge variant="secondary" className="flex-shrink-0">Read-only</Badge>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeVolume(index)}
                                className="flex-shrink-0"
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
                              className="flex items-center justify-between p-3 rounded-lg border bg-card"
                            >
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <div className="flex-1 min-w-0 font-mono text-sm">
                                  <span className="text-primary">{env.key}</span>
                                  <span className="text-muted-foreground">=</span>
                                  <span className="truncate">{env.value}</span>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeEnvVar(index)}
                                className="flex-shrink-0"
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
    </DashboardLayout>
  );
}
