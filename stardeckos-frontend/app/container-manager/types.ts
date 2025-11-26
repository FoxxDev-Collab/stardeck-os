// Container Manager Type Definitions

export interface Container {
  id: string;
  container_id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  has_web_ui: boolean;
  web_ui_port?: number;
  web_ui_path?: string;
  icon: string;
  created_at: string;
  uptime: string;
  ports: PortMapping[];
  auto_start?: boolean;
}

export type ContainerStatus =
  | "created"
  | "running"
  | "paused"
  | "restarting"
  | "removing"
  | "exited"
  | "dead"
  | "unknown";

export interface PortMapping {
  host_ip: string;
  host_port: number;
  container_port: number;
  protocol: string;
}

export interface VolumeMount {
  source: string;
  target: string;
  type: string;
  read_only: boolean;
}

export interface ContainerDetails {
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

export interface ContainerImage {
  id: string;
  repository: string;
  tag: string;
  size: number;
  created: string;
  containers: number;
}

export interface Volume {
  name: string;
  driver: string;
  mount_point: string;
  created_at: string;
  labels?: Record<string, string>;
  scope?: string;
}

export interface PodmanNetwork {
  id: string;
  name: string;
  driver: string;
  subnet: string;
  gateway: string;
  internal: boolean;
  ipv6?: boolean;
}

export interface ContainerStats {
  container_id: string;
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

export interface ContainerLog {
  timestamp: string;
  stream: "stdout" | "stderr";
  message: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  compose_content: string;
  env_defaults: string;
  volume_hints: string;
  tags: string;
  created_at: string;
  updated_at: string;
  usage_count: number;
}

export interface CreateContainerRequest {
  name: string;
  image: string;
  ports: PortMapping[];
  volumes: VolumeMount[];
  environment: Record<string, string>;
  labels?: Record<string, string>;
  restart_policy: string;
  has_web_ui: boolean;
  web_ui_port?: number;
  web_ui_path?: string;
  icon?: string;
  auto_start: boolean;
  cpu_limit?: number;
  memory_limit?: number;
  network_mode?: string;
  hostname?: string;
  user?: string;
  workdir?: string;
  entrypoint?: string[];
  command?: string[];
}

export interface ComposeService {
  image: string;
  container_name?: string;
  ports?: string[];
  volumes?: string[];
  environment?: Record<string, string> | string[];
  depends_on?: string[];
  restart?: string;
  networks?: string[];
  labels?: Record<string, string>;
  healthcheck?: {
    test: string[];
    interval?: string;
    timeout?: string;
    retries?: number;
  };
  deploy?: {
    resources?: {
      limits?: {
        cpus?: string;
        memory?: string;
      };
    };
  };
}

export interface ComposeFile {
  version?: string;
  services: Record<string, ComposeService>;
  volumes?: Record<string, object>;
  networks?: Record<string, object>;
}

// Utility functions
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatUptime(startedAt: string): string {
  if (!startedAt || startedAt === "0001-01-01T00:00:00Z") return "-";
  const start = new Date(startedAt);
  const now = new Date();
  const diff = now.getTime() - start.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function getStatusColor(status: ContainerStatus): string {
  switch (status) {
    case "running":
      return "text-emerald-500";
    case "paused":
      return "text-yellow-500";
    case "restarting":
      return "text-blue-500";
    case "exited":
    case "dead":
      return "text-red-500";
    case "created":
      return "text-gray-500";
    default:
      return "text-muted-foreground";
  }
}

export function getStatusBgColor(status: ContainerStatus): string {
  switch (status) {
    case "running":
      return "bg-emerald-500/20 border-emerald-500/40";
    case "paused":
      return "bg-yellow-500/20 border-yellow-500/40";
    case "restarting":
      return "bg-blue-500/20 border-blue-500/40";
    case "exited":
    case "dead":
      return "bg-red-500/20 border-red-500/40";
    case "created":
      return "bg-gray-500/20 border-gray-500/40";
    default:
      return "bg-muted/20 border-muted/40";
  }
}
