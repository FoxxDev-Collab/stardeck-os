export interface Server {
  id: string;
  hostname: string;
  ip: string;
  status: "online" | "offline" | "warning";
  os: string;
  uptime: number;
  cpu: number;
  memory: {
    used: number;
    total: number;
  };
  disk: {
    used: number;
    total: number;
  };
  services: Service[];
}

export interface Service {
  id: string;
  name: string;
  status: "running" | "stopped" | "failed";
  port?: number;
  autoStart: boolean;
}

export interface SystemMetric {
  timestamp: number;
  cpu: number;
  memory: number;
  network: number;
}

// Mock servers
export const mockServers: Server[] = [
  {
    id: "srv-001",
    hostname: "web-01.stardeck.local",
    ip: "192.168.1.10",
    status: "online",
    os: "Rocky Linux 10.0",
    uptime: 864000, // 10 days in seconds
    cpu: 45.2,
    memory: {
      used: 12.8,
      total: 32,
    },
    disk: {
      used: 245,
      total: 500,
    },
    services: [
      { id: "1", name: "nginx", status: "running", port: 80, autoStart: true },
      { id: "2", name: "postgresql", status: "running", port: 5432, autoStart: true },
      { id: "3", name: "redis", status: "running", port: 6379, autoStart: true },
    ],
  },
  {
    id: "srv-002",
    hostname: "db-01.stardeck.local",
    ip: "192.168.1.11",
    status: "online",
    os: "Rocky Linux 10.0",
    uptime: 1296000, // 15 days
    cpu: 62.7,
    memory: {
      used: 28.4,
      total: 64,
    },
    disk: {
      used: 820,
      total: 2000,
    },
    services: [
      { id: "4", name: "mariadb", status: "running", port: 3306, autoStart: true },
      { id: "5", name: "mongodb", status: "running", port: 27017, autoStart: true },
    ],
  },
  {
    id: "srv-003",
    hostname: "app-01.stardeck.local",
    ip: "192.168.1.12",
    status: "warning",
    os: "Rocky Linux 10.0",
    uptime: 172800, // 2 days
    cpu: 88.5,
    memory: {
      used: 14.2,
      total: 16,
    },
    disk: {
      used: 180,
      total: 250,
    },
    services: [
      { id: "6", name: "nodejs", status: "running", port: 3000, autoStart: true },
      { id: "7", name: "docker", status: "running", autoStart: true },
      { id: "8", name: "fail2ban", status: "failed", autoStart: true },
    ],
  },
  {
    id: "srv-004",
    hostname: "cache-01.stardeck.local",
    ip: "192.168.1.13",
    status: "offline",
    os: "Rocky Linux 10.0",
    uptime: 0,
    cpu: 0,
    memory: {
      used: 0,
      total: 8,
    },
    disk: {
      used: 45,
      total: 100,
    },
    services: [
      { id: "9", name: "memcached", status: "stopped", port: 11211, autoStart: true },
      { id: "10", name: "varnish", status: "stopped", port: 6081, autoStart: true },
    ],
  },
];

// Generate mock metrics for the last 24 hours
export function generateMockMetrics(hours: number = 24): SystemMetric[] {
  const metrics: SystemMetric[] = [];
  const now = Date.now();
  const interval = 300000; // 5 minutes

  for (let i = hours * 12; i >= 0; i--) {
    const timestamp = now - i * interval;
    metrics.push({
      timestamp,
      cpu: 20 + Math.random() * 60 + Math.sin(i / 10) * 15,
      memory: 40 + Math.random() * 30 + Math.sin(i / 8) * 10,
      network: 10 + Math.random() * 40 + Math.sin(i / 6) * 20,
    });
  }

  return metrics;
}

export const mockMetrics = generateMockMetrics();

// Helper functions
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 GB";
  if (bytes < 1024) return `${bytes.toFixed(1)} GB`;
  return `${(bytes / 1024).toFixed(1)} TB`;
}

export function getStatusColor(status: Server["status"]): string {
  switch (status) {
    case "online":
      return "text-primary";
    case "warning":
      return "text-chart-2";
    case "offline":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

export function getServiceStatusColor(status: Service["status"]): string {
  switch (status) {
    case "running":
      return "text-primary";
    case "stopped":
      return "text-muted-foreground";
    case "failed":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}
