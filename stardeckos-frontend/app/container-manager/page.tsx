"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  Search,
  Play,
  Square,
  RotateCw,
  Trash2,
  FileText,
  Settings,
  Plus,
  Upload,
  Box,
  Layers,
  Network,
  HardDrive,
  Terminal,
  Globe,
  Cpu,
  MemoryStick,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PauseCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  Download,
  FolderOpen,
  FileCode,
  Rocket,
  Save,
  Eye,
  EyeOff,
  Lock,
  Variable,
  Server,
  Container,
  Workflow,
  LayoutTemplate,
  Code2,
} from "lucide-react";

// =============================================================================
// MOCK DATA - This represents what we'd get from the Podman API
// =============================================================================

interface ContainerType {
  id: string;
  name: string;
  image: string;
  status: "running" | "stopped" | "paused" | "exited" | "created";
  hasWebUI: boolean;
  webUIPort?: number;
  webUIPath?: string;
  uptime?: string;
  cpu: number;
  memory: number;
  memoryLimit: number;
  networkRx: number;
  networkTx: number;
  ports: { internal: number; external: number; protocol: string }[];
  volumes: { source: string; target: string; mode: string }[];
  networks: string[];
  envVars: { key: string; value: string; isSecret: boolean }[];
  autoStart: boolean;
  icon?: string;
  labels: Record<string, string>;
  createdAt: string;
}

interface ImageType {
  id: string;
  name: string;
  tag: string;
  size: number;
  created: string;
}

interface VolumeType {
  name: string;
  driver: string;
  mountPoint: string;
  usedBy: string[];
  size?: number;
}

interface NetworkType {
  name: string;
  driver: string;
  subnet?: string;
  gateway?: string;
  containers: string[];
  internal: boolean;
}

interface TemplateType {
  id: string;
  name: string;
  description: string;
  author: string;
  services: number;
  tags: string[];
  icon: string;
}

const mockContainers: ContainerType[] = [
  {
    id: "abc123def456",
    name: "grafana",
    image: "grafana/grafana:latest",
    status: "running",
    hasWebUI: true,
    webUIPort: 3000,
    webUIPath: "/",
    uptime: "2d 14h 32m",
    cpu: 2.4,
    memory: 256,
    memoryLimit: 512,
    networkRx: 1024000,
    networkTx: 512000,
    ports: [{ internal: 3000, external: 3000, protocol: "tcp" }],
    volumes: [
      { source: "/var/lib/stardeck/volumes/grafana", target: "/var/lib/grafana", mode: "rw" }
    ],
    networks: ["monitoring"],
    envVars: [
      { key: "GF_SECURITY_ADMIN_USER", value: "admin", isSecret: false },
      { key: "GF_SECURITY_ADMIN_PASSWORD", value: "secretpass123", isSecret: true },
    ],
    autoStart: true,
    icon: "grafana",
    labels: { "stardeck.webui": "true", "stardeck.icon": "grafana" },
    createdAt: "2025-01-10T10:30:00Z",
  },
  {
    id: "def456ghi789",
    name: "prometheus",
    image: "prom/prometheus:v2.48.0",
    status: "running",
    hasWebUI: true,
    webUIPort: 9090,
    webUIPath: "/",
    uptime: "2d 14h 32m",
    cpu: 5.8,
    memory: 384,
    memoryLimit: 1024,
    networkRx: 2048000,
    networkTx: 1024000,
    ports: [{ internal: 9090, external: 9090, protocol: "tcp" }],
    volumes: [
      { source: "/var/lib/stardeck/volumes/prometheus", target: "/prometheus", mode: "rw" }
    ],
    networks: ["monitoring"],
    envVars: [],
    autoStart: true,
    icon: "prometheus",
    labels: { "stardeck.webui": "true" },
    createdAt: "2025-01-10T10:30:00Z",
  },
  {
    id: "ghi789jkl012",
    name: "nginx-proxy",
    image: "nginx:alpine",
    status: "running",
    hasWebUI: true,
    webUIPort: 80,
    webUIPath: "/",
    uptime: "5d 2h 15m",
    cpu: 0.5,
    memory: 32,
    memoryLimit: 128,
    networkRx: 5120000,
    networkTx: 10240000,
    ports: [
      { internal: 80, external: 8080, protocol: "tcp" },
      { internal: 443, external: 8443, protocol: "tcp" },
    ],
    volumes: [
      { source: "/var/lib/stardeck/volumes/nginx/conf", target: "/etc/nginx/conf.d", mode: "ro" }
    ],
    networks: ["frontend", "backend"],
    envVars: [],
    autoStart: true,
    icon: "nginx",
    labels: {},
    createdAt: "2025-01-05T08:00:00Z",
  },
  {
    id: "jkl012mno345",
    name: "postgres-db",
    image: "postgres:16-alpine",
    status: "running",
    hasWebUI: false,
    uptime: "5d 2h 15m",
    cpu: 3.2,
    memory: 512,
    memoryLimit: 2048,
    networkRx: 1024000,
    networkTx: 2048000,
    ports: [{ internal: 5432, external: 5432, protocol: "tcp" }],
    volumes: [
      { source: "/var/lib/stardeck/volumes/postgres/data", target: "/var/lib/postgresql/data", mode: "rw" }
    ],
    networks: ["backend"],
    envVars: [
      { key: "POSTGRES_USER", value: "stardeck", isSecret: false },
      { key: "POSTGRES_PASSWORD", value: "supersecret", isSecret: true },
      { key: "POSTGRES_DB", value: "stardeck", isSecret: false },
    ],
    autoStart: true,
    icon: "database",
    labels: {},
    createdAt: "2025-01-05T08:00:00Z",
  },
  {
    id: "mno345pqr678",
    name: "redis-cache",
    image: "redis:7-alpine",
    status: "stopped",
    hasWebUI: false,
    cpu: 0,
    memory: 0,
    memoryLimit: 256,
    networkRx: 0,
    networkTx: 0,
    ports: [{ internal: 6379, external: 6379, protocol: "tcp" }],
    volumes: [
      { source: "/var/lib/stardeck/volumes/redis", target: "/data", mode: "rw" }
    ],
    networks: ["backend"],
    envVars: [],
    autoStart: false,
    icon: "database",
    labels: {},
    createdAt: "2025-01-08T14:00:00Z",
  },
  {
    id: "pqr678stu901",
    name: "portainer",
    image: "portainer/portainer-ce:latest",
    status: "exited",
    hasWebUI: true,
    webUIPort: 9000,
    cpu: 0,
    memory: 0,
    memoryLimit: 512,
    networkRx: 0,
    networkTx: 0,
    ports: [{ internal: 9000, external: 9000, protocol: "tcp" }],
    volumes: [
      { source: "/var/run/podman/podman.sock", target: "/var/run/docker.sock", mode: "ro" }
    ],
    networks: ["management"],
    envVars: [],
    autoStart: false,
    icon: "container",
    labels: { "stardeck.webui": "true" },
    createdAt: "2025-01-12T16:30:00Z",
  },
];

const mockImages: ImageType[] = [
  { id: "sha256:abc123", name: "grafana/grafana", tag: "latest", size: 412000000, created: "2025-01-08" },
  { id: "sha256:def456", name: "prom/prometheus", tag: "v2.48.0", size: 245000000, created: "2025-01-05" },
  { id: "sha256:ghi789", name: "nginx", tag: "alpine", size: 42000000, created: "2025-01-10" },
  { id: "sha256:jkl012", name: "postgres", tag: "16-alpine", size: 238000000, created: "2025-01-06" },
  { id: "sha256:mno345", name: "redis", tag: "7-alpine", size: 32000000, created: "2025-01-07" },
  { id: "sha256:pqr678", name: "portainer/portainer-ce", tag: "latest", size: 298000000, created: "2025-01-11" },
];

const mockVolumes: VolumeType[] = [
  { name: "grafana-data", driver: "local", mountPoint: "/var/lib/stardeck/volumes/grafana", usedBy: ["grafana"], size: 52428800 },
  { name: "prometheus-data", driver: "local", mountPoint: "/var/lib/stardeck/volumes/prometheus", usedBy: ["prometheus"], size: 1073741824 },
  { name: "postgres-data", driver: "local", mountPoint: "/var/lib/stardeck/volumes/postgres/data", usedBy: ["postgres-db"], size: 536870912 },
  { name: "redis-data", driver: "local", mountPoint: "/var/lib/stardeck/volumes/redis", usedBy: ["redis-cache"], size: 10485760 },
  { name: "nginx-config", driver: "local", mountPoint: "/var/lib/stardeck/volumes/nginx/conf", usedBy: ["nginx-proxy"] },
];

const mockNetworks: NetworkType[] = [
  { name: "podman", driver: "bridge", subnet: "10.88.0.0/16", gateway: "10.88.0.1", containers: [], internal: false },
  { name: "monitoring", driver: "bridge", subnet: "172.20.0.0/16", gateway: "172.20.0.1", containers: ["grafana", "prometheus"], internal: false },
  { name: "backend", driver: "bridge", subnet: "172.21.0.0/16", gateway: "172.21.0.1", containers: ["postgres-db", "redis-cache", "nginx-proxy"], internal: true },
  { name: "frontend", driver: "bridge", subnet: "172.22.0.0/16", gateway: "172.22.0.1", containers: ["nginx-proxy"], internal: false },
  { name: "management", driver: "bridge", containers: ["portainer"], internal: false },
];

const mockTemplates: TemplateType[] = [
  { id: "1", name: "Monitoring Stack", description: "Grafana + Prometheus + Loki for full observability", author: "system", services: 3, tags: ["monitoring", "metrics", "logging"], icon: "activity" },
  { id: "2", name: "WordPress + MySQL", description: "Classic WordPress with MySQL database", author: "user", services: 2, tags: ["cms", "blog", "php"], icon: "globe" },
  { id: "3", name: "NGINX Proxy Manager", description: "Easy reverse proxy with Let's Encrypt", author: "system", services: 1, tags: ["proxy", "ssl", "networking"], icon: "network" },
  { id: "4", name: "Nextcloud", description: "Self-hosted cloud storage and collaboration", author: "user", services: 3, tags: ["storage", "cloud", "collaboration"], icon: "cloud" },
];

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function StatusBadge({ status }: { status: ContainerType["status"] }) {
  const config = {
    running: { icon: CheckCircle2, color: "text-primary", bg: "bg-primary/10", label: "Running" },
    stopped: { icon: XCircle, color: "text-muted-foreground", bg: "bg-muted", label: "Stopped" },
    paused: { icon: PauseCircle, color: "text-chart-5", bg: "bg-chart-5/10", label: "Paused" },
    exited: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Exited" },
    created: { icon: Clock, color: "text-accent", bg: "bg-accent/10", label: "Created" },
  };

  const { icon: Icon, color, bg, label } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${color}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function ResourceBar({ value, max, label, color = "bg-accent" }: { value: number; max: number; label: string; color?: string }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{formatBytes(value * 1024 * 1024)} / {formatBytes(max * 1024 * 1024)}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

// =============================================================================
// CONTAINER LIST COMPONENT (Installed Tab)
// =============================================================================

function ContainerList({ containers, onAction }: {
  containers: ContainerType[];
  onAction: (id: string, action: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filtered = containers.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         c.image.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: containers.length,
    running: containers.filter(c => c.status === "running").length,
    stopped: containers.filter(c => c.status === "stopped" || c.status === "exited").length,
    withWebUI: containers.filter(c => c.hasWebUI && c.status === "running").length,
  };

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-border/60 bg-card/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Containers</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Box className="w-8 h-8 text-accent" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Running</p>
                <p className="text-2xl font-bold text-primary">{stats.running}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Stopped</p>
                <p className="text-2xl font-bold">{stats.stopped}</p>
              </div>
              <XCircle className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Web Apps</p>
                <p className="text-2xl font-bold text-accent">{stats.withWebUI}</p>
              </div>
              <Globe className="w-8 h-8 text-accent" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card className="border-border/60 bg-card/70">
        <CardContent className="p-4">
          <div className="flex gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search containers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              {["all", "running", "stopped", "exited"].map((status) => (
                <Button
                  key={status}
                  variant={filterStatus === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus(status)}
                  className={filterStatus === status ? "bg-accent" : ""}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Container List */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Container className="w-5 h-5 text-accent" />
            Containers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filtered.map((container) => (
              <div
                key={container.id}
                className="border border-border/50 rounded-lg bg-background/40 overflow-hidden"
              >
                {/* Main Row */}
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-background/60 transition-colors"
                  onClick={() => setExpandedId(expandedId === container.id ? null : container.id)}
                >
                  <button className="text-muted-foreground">
                    {expandedId === container.id ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>

                  {/* Container Icon */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    container.status === "running" ? "bg-primary/10" : "bg-muted"
                  }`}>
                    <Box className={`w-5 h-5 ${container.status === "running" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>

                  {/* Name and Image */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{container.name}</h3>
                      {container.hasWebUI && container.status === "running" && (
                        <Globe className="w-4 h-4 text-accent" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">{container.image}</p>
                  </div>

                  {/* Status */}
                  <StatusBadge status={container.status} />

                  {/* Resource Usage (only for running) */}
                  {container.status === "running" && (
                    <div className="hidden lg:flex items-center gap-6 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-mono w-12 text-right">{container.cpu.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MemoryStick className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-mono w-20 text-right">{container.memory}MB</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-mono">{container.uptime}</span>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {container.hasWebUI && container.status === "running" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-accent/50 hover:bg-accent/10"
                        onClick={() => onAction(container.id, "open")}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open
                      </Button>
                    )}
                    {container.status === "running" ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onAction(container.id, "stop")}
                        >
                          <Square className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onAction(container.id, "restart")}
                        >
                          <RotateCw className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAction(container.id, "start")}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onAction(container.id, "logs")}
                    >
                      <FileText className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onAction(container.id, "settings")}
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedId === container.id && (
                  <div className="border-t border-border/50 bg-background/20 p-4">
                    <div className="grid grid-cols-3 gap-6">
                      {/* Ports */}
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Network className="w-3.5 h-3.5" />
                          PORTS
                        </h4>
                        <div className="space-y-1">
                          {container.ports.map((port, i) => (
                            <div key={i} className="text-xs font-mono bg-muted/50 rounded px-2 py-1">
                              {port.external}:{port.internal}/{port.protocol}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Volumes */}
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                          <HardDrive className="w-3.5 h-3.5" />
                          VOLUMES
                        </h4>
                        <div className="space-y-1">
                          {container.volumes.map((vol, i) => (
                            <div key={i} className="text-xs font-mono bg-muted/50 rounded px-2 py-1 truncate" title={`${vol.source} → ${vol.target}`}>
                              {vol.target} ({vol.mode})
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Networks */}
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          NETWORKS
                        </h4>
                        <div className="flex flex-wrap gap-1">
                          {container.networks.map((net, i) => (
                            <span key={i} className="text-xs font-mono bg-accent/10 text-accent rounded px-2 py-0.5">
                              {net}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Resource Bars (for running containers) */}
                    {container.status === "running" && (
                      <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-2 gap-4">
                        <ResourceBar value={container.memory} max={container.memoryLimit} label="Memory" color="bg-chart-2" />
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Network I/O</span>
                            <span className="font-mono">↓ {formatBytes(container.networkRx)} / ↑ {formatBytes(container.networkTx)}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-chart-4 w-1/3" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="mt-4 pt-4 border-t border-border/30 flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Terminal className="w-3.5 h-3.5" />
                        Shell
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Copy className="w-3.5 h-3.5" />
                        Duplicate
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Save className="w-3.5 h-3.5" />
                        Save as Template
                      </Button>
                      <div className="flex-1" />
                      <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// DEPLOY TAB COMPONENTS
// =============================================================================

function DeployTab() {
  const [deployMethod, setDeployMethod] = useState<"compose" | "quick" | "template">("compose");

  return (
    <div className="space-y-6">
      {/* Method Selector */}
      <div className="grid grid-cols-3 gap-4">
        <Card
          className={`border-border/60 cursor-pointer transition-all ${
            deployMethod === "compose" ? "bg-accent/10 border-accent" : "bg-card/70 hover:bg-card/90"
          }`}
          onClick={() => setDeployMethod("compose")}
        >
          <CardContent className="p-6 text-center">
            <FileCode className={`w-10 h-10 mx-auto mb-3 ${deployMethod === "compose" ? "text-accent" : "text-muted-foreground"}`} />
            <h3 className="font-semibold">Import Compose</h3>
            <p className="text-xs text-muted-foreground mt-1">Upload or paste a compose file</p>
          </CardContent>
        </Card>
        <Card
          className={`border-border/60 cursor-pointer transition-all ${
            deployMethod === "quick" ? "bg-accent/10 border-accent" : "bg-card/70 hover:bg-card/90"
          }`}
          onClick={() => setDeployMethod("quick")}
        >
          <CardContent className="p-6 text-center">
            <Rocket className={`w-10 h-10 mx-auto mb-3 ${deployMethod === "quick" ? "text-accent" : "text-muted-foreground"}`} />
            <h3 className="font-semibold">Quick Deploy</h3>
            <p className="text-xs text-muted-foreground mt-1">Deploy a single container</p>
          </CardContent>
        </Card>
        <Card
          className={`border-border/60 cursor-pointer transition-all ${
            deployMethod === "template" ? "bg-accent/10 border-accent" : "bg-card/70 hover:bg-card/90"
          }`}
          onClick={() => setDeployMethod("template")}
        >
          <CardContent className="p-6 text-center">
            <LayoutTemplate className={`w-10 h-10 mx-auto mb-3 ${deployMethod === "template" ? "text-accent" : "text-muted-foreground"}`} />
            <h3 className="font-semibold">From Template</h3>
            <p className="text-xs text-muted-foreground mt-1">Use a saved configuration</p>
          </CardContent>
        </Card>
      </div>

      {/* Deploy Method Content */}
      {deployMethod === "compose" && <ComposeImport />}
      {deployMethod === "quick" && <QuickDeploy />}
      {deployMethod === "template" && <TemplateSelector />}
    </div>
  );
}

function ComposeImport() {
  const [composeContent, setComposeContent] = useState(`version: "3.8"

services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    labels:
      stardeck.webui: "true"
      stardeck.icon: "nginx"

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: \${DB_PASSWORD}
      POSTGRES_DB: myapp
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
`);
  const [activeTab, setActiveTab] = useState<"editor" | "visual">("editor");

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left: Editor */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Code2 className="w-4 h-4 text-accent" />
              Compose File
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                Upload
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="w-3.5 h-3.5" />
                Download
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Mock Monaco Editor */}
          <div className="relative">
            <div className="absolute top-2 right-2 flex gap-1 z-10">
              <Button
                variant={activeTab === "editor" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("editor")}
                className={activeTab === "editor" ? "bg-accent h-7" : "h-7"}
              >
                Code
              </Button>
              <Button
                variant={activeTab === "visual" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("visual")}
                className={activeTab === "visual" ? "bg-accent h-7" : "h-7"}
              >
                Visual
              </Button>
            </div>
            <textarea
              value={composeContent}
              onChange={(e) => setComposeContent(e.target.value)}
              className="w-full h-96 bg-background/80 border border-border/50 rounded-lg p-4 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
              spellCheck={false}
            />
            <div className="absolute bottom-2 left-2 text-xs text-muted-foreground">
              YAML • 2 services • 1 volume
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right: Configuration Panel */}
      <div className="space-y-4">
        {/* Parsed Services */}
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              Services
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Service: web */}
            <div className="border border-border/50 rounded-lg p-3 bg-background/40">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-primary" />
                  <span className="font-semibold">web</span>
                  <span className="text-xs text-muted-foreground font-mono">nginx:alpine</span>
                </div>
                <Globe className="w-4 h-4 text-accent" />
              </div>
              <div className="flex gap-2 text-xs">
                <span className="bg-muted rounded px-2 py-0.5">8080:80</span>
                <span className="bg-muted rounded px-2 py-0.5">1 volume</span>
              </div>
            </div>

            {/* Service: db */}
            <div className="border border-border/50 rounded-lg p-3 bg-background/40">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-chart-2" />
                  <span className="font-semibold">db</span>
                  <span className="text-xs text-muted-foreground font-mono">postgres:16-alpine</span>
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="bg-muted rounded px-2 py-0.5">1 env var</span>
                <span className="bg-muted rounded px-2 py-0.5">1 volume</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Environment Variables */}
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Variable className="w-4 h-4 text-accent" />
              Environment Variables
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-chart-5" />
              <Input placeholder="DB_PASSWORD" className="flex-1 font-mono text-sm" defaultValue="DB_PASSWORD" disabled />
              <Input type="password" placeholder="Enter value..." className="flex-1" />
            </div>
            <p className="text-xs text-muted-foreground">
              Variables referenced in compose file that need values
            </p>
          </CardContent>
        </Card>

        {/* Deploy Options */}
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="w-4 h-4 text-accent" />
              Options
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Create Desktop Icons</Label>
                <p className="text-xs text-muted-foreground">For services with web UI</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-start on Boot</Label>
                <p className="text-xs text-muted-foreground">Start containers when Stardeck starts</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Pull Latest Images</Label>
                <p className="text-xs text-muted-foreground">Check for updates before deploy</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        {/* Deploy Button */}
        <Button className="w-full gap-2 bg-accent hover:bg-accent/90 text-accent-foreground">
          <Rocket className="w-4 h-4" />
          Deploy Stack
        </Button>
      </div>
    </div>
  );
}

function QuickDeploy() {
  const [showSecrets, setShowSecrets] = useState<Record<number, boolean>>({});

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left: Basic Config */}
      <div className="space-y-4">
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Box className="w-4 h-4 text-accent" />
              Container Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Container Name</Label>
              <Input placeholder="my-container" />
            </div>
            <div className="space-y-2">
              <Label>Image</Label>
              <div className="flex gap-2">
                <Input placeholder="nginx" className="flex-1" />
                <Input placeholder="latest" className="w-24" defaultValue="latest" />
              </div>
              <p className="text-xs text-muted-foreground">e.g., grafana/grafana:latest</p>
            </div>
            <div className="space-y-2">
              <Label>Restart Policy</Label>
              <Select defaultValue="unless-stopped">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="always">Always</SelectItem>
                  <SelectItem value="on-failure">On Failure</SelectItem>
                  <SelectItem value="unless-stopped">Unless Stopped</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Ports */}
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Network className="w-4 h-4 text-accent" />
                Port Mappings
              </CardTitle>
              <Button variant="ghost" size="sm" className="gap-1">
                <Plus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Input placeholder="Host" className="w-24" defaultValue="8080" />
              <span className="text-muted-foreground">:</span>
              <Input placeholder="Container" className="w-24" defaultValue="80" />
              <Select defaultValue="tcp">
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcp">TCP</SelectItem>
                  <SelectItem value="udp">UDP</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Volumes */}
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-accent" />
                Volumes
              </CardTitle>
              <Button variant="ghost" size="sm" className="gap-1">
                <Plus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-1">
                <Input placeholder="Host path" className="flex-1" defaultValue="/var/lib/stardeck/volumes/data" />
                <Button variant="ghost" size="sm">
                  <FolderOpen className="w-3.5 h-3.5" />
                </Button>
              </div>
              <span className="text-muted-foreground">→</span>
              <Input placeholder="Container path" className="flex-1" defaultValue="/data" />
              <Select defaultValue="rw">
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rw">RW</SelectItem>
                  <SelectItem value="ro">RO</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: Advanced Config */}
      <div className="space-y-4">
        {/* Environment Variables */}
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Variable className="w-4 h-4 text-accent" />
                Environment Variables
              </CardTitle>
              <Button variant="ghost" size="sm" className="gap-1">
                <Plus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { key: "ADMIN_USER", value: "admin", secret: false },
              { key: "ADMIN_PASSWORD", value: "secret123", secret: true },
            ].map((env, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="Key" className="flex-1 font-mono" defaultValue={env.key} />
                <span className="text-muted-foreground">=</span>
                <div className="flex-1 relative">
                  <Input
                    type={env.secret && !showSecrets[i] ? "password" : "text"}
                    placeholder="Value"
                    className="pr-8"
                    defaultValue={env.value}
                  />
                  {env.secret && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      onClick={() => setShowSecrets(s => ({ ...s, [i]: !s[i] }))}
                    >
                      {showSecrets[i] ? (
                        <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className={env.secret ? "text-chart-5" : ""}
                >
                  <Lock className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Resource Limits */}
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4 text-accent" />
              Resource Limits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Memory Limit</Label>
                <span className="font-mono text-muted-foreground">512 MB</span>
              </div>
              <Input type="range" min="128" max="4096" step="128" defaultValue="512" className="w-full" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>CPU Limit</Label>
                <span className="font-mono text-muted-foreground">1.0 cores</span>
              </div>
              <Input type="range" min="0.25" max="4" step="0.25" defaultValue="1" className="w-full" />
            </div>
          </CardContent>
        </Card>

        {/* Network */}
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              Network
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Connect to Network</Label>
              <Select defaultValue="podman">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="podman">podman (default)</SelectItem>
                  <SelectItem value="host">host</SelectItem>
                  <SelectItem value="none">none</SelectItem>
                  <SelectItem value="monitoring">monitoring</SelectItem>
                  <SelectItem value="backend">backend</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Web UI Options */}
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="w-4 h-4 text-accent" />
              Web UI
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Has Web Interface</Label>
                <p className="text-xs text-muted-foreground">Enable desktop icon</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="space-y-2">
              <Label>Web UI Port</Label>
              <Input placeholder="e.g., 80, 3000, 8080" defaultValue="80" />
            </div>
            <div className="space-y-2">
              <Label>Web UI Path</Label>
              <Input placeholder="/" defaultValue="/" />
            </div>
          </CardContent>
        </Card>

        {/* Deploy Button */}
        <Button className="w-full gap-2 bg-accent hover:bg-accent/90 text-accent-foreground">
          <Rocket className="w-4 h-4" />
          Deploy Container
        </Button>
      </div>
    </div>
  );
}

function TemplateSelector() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Template Grid */}
      <div className="grid grid-cols-2 gap-4">
        {mockTemplates.map((template) => (
          <Card
            key={template.id}
            className={`border-border/60 cursor-pointer transition-all ${
              selectedTemplate === template.id ? "bg-accent/10 border-accent" : "bg-card/70 hover:bg-card/90"
            }`}
            onClick={() => setSelectedTemplate(template.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  selectedTemplate === template.id ? "bg-accent/20" : "bg-muted"
                }`}>
                  <Workflow className={`w-6 h-6 ${selectedTemplate === template.id ? "text-accent" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{template.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs bg-muted rounded px-2 py-0.5">{template.services} services</span>
                    <span className="text-xs text-muted-foreground">by {template.author}</span>
                  </div>
                  <div className="flex gap-1 mt-2">
                    {template.tags.map((tag) => (
                      <span key={tag} className="text-xs bg-accent/10 text-accent rounded px-1.5 py-0.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Import/Export */}
      <Card className="border-border/60 bg-card/70">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-accent" />
              <span className="font-medium">Template Management</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                Import Template
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Create New
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deploy from Template */}
      {selectedTemplate && (
        <Card className="border-accent bg-accent/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Deploy "{mockTemplates.find(t => t.id === selectedTemplate)?.name}"</h3>
                <p className="text-xs text-muted-foreground mt-1">Configure and deploy this template</p>
              </div>
              <Button className="gap-2 bg-accent hover:bg-accent/90 text-accent-foreground">
                <Rocket className="w-4 h-4" />
                Configure & Deploy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// IMAGES TAB
// =============================================================================

function ImagesTab() {
  return (
    <div className="space-y-4">
      {/* Pull New Image */}
      <Card className="border-border/60 bg-card/70">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input placeholder="Image name (e.g., nginx:alpine, grafana/grafana:latest)" className="flex-1" />
            <Button className="gap-2 bg-accent hover:bg-accent/90">
              <Download className="w-4 h-4" />
              Pull Image
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Images List */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-accent" />
            Local Images
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mockImages.map((image) => (
              <div
                key={image.id}
                className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/40"
              >
                <div className="flex items-center gap-3">
                  <Box className="w-8 h-8 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{image.name}</span>
                      <span className="text-xs bg-accent/10 text-accent rounded px-1.5 py-0.5">{image.tag}</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{image.id.slice(0, 19)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">{formatBytes(image.size)}</span>
                  <span className="text-xs text-muted-foreground">{image.created}</span>
                  <Button variant="ghost" size="sm">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// VOLUMES TAB
// =============================================================================

function VolumesTab() {
  return (
    <div className="space-y-4">
      {/* Create Volume */}
      <Card className="border-border/60 bg-card/70">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input placeholder="Volume name" className="flex-1" />
            <Button className="gap-2 bg-accent hover:bg-accent/90">
              <Plus className="w-4 h-4" />
              Create Volume
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Volumes List */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-accent" />
            Volumes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mockVolumes.map((volume) => (
              <div
                key={volume.name}
                className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/40"
              >
                <div className="flex items-center gap-3">
                  <HardDrive className="w-8 h-8 text-chart-3" />
                  <div>
                    <div className="font-medium">{volume.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{volume.mountPoint}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {volume.size && (
                    <span className="text-sm text-muted-foreground">{formatBytes(volume.size)}</span>
                  )}
                  <div className="flex gap-1">
                    {volume.usedBy.map((container) => (
                      <span key={container} className="text-xs bg-muted rounded px-2 py-0.5">{container}</span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm">
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" disabled={volume.usedBy.length > 0}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// NETWORKS TAB
// =============================================================================

function NetworksTab() {
  return (
    <div className="space-y-4">
      {/* Create Network */}
      <Card className="border-border/60 bg-card/70">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input placeholder="Network name" className="flex-1" />
            <Select defaultValue="bridge">
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bridge">Bridge</SelectItem>
                <SelectItem value="host">Host</SelectItem>
                <SelectItem value="macvlan">Macvlan</SelectItem>
              </SelectContent>
            </Select>
            <Button className="gap-2 bg-accent hover:bg-accent/90">
              <Plus className="w-4 h-4" />
              Create Network
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Networks List */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-accent" />
            Networks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mockNetworks.map((network) => (
              <div
                key={network.name}
                className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/40"
              >
                <div className="flex items-center gap-3">
                  <Network className={`w-8 h-8 ${network.internal ? "text-chart-5" : "text-chart-4"}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{network.name}</span>
                      <span className="text-xs bg-muted rounded px-1.5 py-0.5">{network.driver}</span>
                      {network.internal && (
                        <span className="text-xs bg-chart-5/10 text-chart-5 rounded px-1.5 py-0.5">Internal</span>
                      )}
                    </div>
                    {network.subnet && (
                      <div className="text-xs text-muted-foreground font-mono">
                        {network.subnet} • GW: {network.gateway}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex gap-1">
                    {network.containers.map((container) => (
                      <span key={container} className="text-xs bg-accent/10 text-accent rounded px-2 py-0.5">{container}</span>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" disabled={network.name === "podman"}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// LOG VIEWER DIALOG (Mock)
// =============================================================================

function LogViewerDialog({ open, onClose, containerName }: { open: boolean; onClose: () => void; containerName: string }) {
  const mockLogs = `2025-01-15 10:32:15 [INFO] Server starting on port 3000
2025-01-15 10:32:15 [INFO] Loading configuration from /etc/grafana/grafana.ini
2025-01-15 10:32:16 [INFO] Database: Opening sqlite3 database file=/var/lib/grafana/grafana.db
2025-01-15 10:32:16 [INFO] Starting plugin manager
2025-01-15 10:32:17 [INFO] Plugin manager loaded successfully
2025-01-15 10:32:17 [INFO] HTTP Server Listen: http://0.0.0.0:3000
2025-01-15 10:32:18 [INFO] Registering endpoint GET /api/health
2025-01-15 10:32:18 [INFO] Registering endpoint GET /api/dashboards
2025-01-15 10:32:19 [WARN] No data sources configured
2025-01-15 10:32:20 [INFO] Server ready to accept connections`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-accent" />
            Logs: {containerName}
          </DialogTitle>
          <DialogDescription>Real-time container logs</DialogDescription>
        </DialogHeader>
        <div className="bg-background border border-border rounded-lg p-4 font-mono text-xs overflow-auto max-h-96">
          <pre className="whitespace-pre-wrap">{mockLogs}</pre>
        </div>
        <DialogFooter>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Download
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function ContainerManagerPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [activeTab, setActiveTab] = useState("installed");
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<string>("");

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

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Activity className="w-12 h-12 text-accent animate-pulse" />
      </div>
    );
  }

  const handleContainerAction = (id: string, action: string) => {
    const container = mockContainers.find(c => c.id === id);
    if (!container) return;

    switch (action) {
      case "logs":
        setSelectedContainer(container.name);
        setLogViewerOpen(true);
        break;
      case "open":
        // In real implementation, this would open a proxied window
        alert(`Opening ${container.name} web UI at port ${container.webUIPort}`);
        break;
      default:
        alert(`${action} container: ${container.name}`);
    }
  };

  return (
    <DashboardLayout title="CONTAINER MANAGER" time={time}>
      <div className="p-6 h-[calc(100vh-3.5rem)] overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <TabsList className="mb-4">
            <TabsTrigger value="installed" className="gap-2">
              <Box className="w-4 h-4" />
              Containers
            </TabsTrigger>
            <TabsTrigger value="deploy" className="gap-2">
              <Rocket className="w-4 h-4" />
              Deploy
            </TabsTrigger>
            <TabsTrigger value="images" className="gap-2">
              <Layers className="w-4 h-4" />
              Images
            </TabsTrigger>
            <TabsTrigger value="volumes" className="gap-2">
              <HardDrive className="w-4 h-4" />
              Volumes
            </TabsTrigger>
            <TabsTrigger value="networks" className="gap-2">
              <Network className="w-4 h-4" />
              Networks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="installed">
            <ContainerList containers={mockContainers} onAction={handleContainerAction} />
          </TabsContent>

          <TabsContent value="deploy">
            <DeployTab />
          </TabsContent>

          <TabsContent value="images">
            <ImagesTab />
          </TabsContent>

          <TabsContent value="volumes">
            <VolumesTab />
          </TabsContent>

          <TabsContent value="networks">
            <NetworksTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Log Viewer Dialog */}
      <LogViewerDialog
        open={logViewerOpen}
        onClose={() => setLogViewerOpen(false)}
        containerName={selectedContainer}
      />
    </DashboardLayout>
  );
}
