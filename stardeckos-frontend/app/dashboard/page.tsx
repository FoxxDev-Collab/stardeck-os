"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardLayout } from "@/components/dashboard-layout";
import { DesktopIcon } from "@/components/desktop-icon";
import { ContainerAppIcon } from "@/components/container-app-icon";
import {
  Activity,
  ListChecks,
  Settings,
  Package,
  HardDrive,
  Users,
  Cog,
  FolderOpen,
  UserCog,
  Globe,
  Terminal,
  FileText,
  Network,
  Box,
} from "lucide-react";

// Container app from API
interface ContainerApp {
  id: string;
  container_id: string;
  name: string;
  icon: string;
  status: string;
  web_ui_port: number;
  web_ui_path: string;
}

interface DesktopApp {
  id: string;
  icon: React.ReactNode;
  label: string;
  href: string;
  description: string;
  color: string;
  adminOnly?: boolean;      // Only visible to admin users
  operatorOrAdmin?: boolean; // Visible to operator and admin users (server management)
}

const desktopApps: DesktopApp[] = [
  {
    id: "system-monitor",
    icon: <Activity className="w-8 h-8" />,
    label: "System Monitor",
    href: "/system-monitor",
    description: "View real-time system metrics and performance data",
    color: "text-accent",
    operatorOrAdmin: true,
  },
  {
    id: "process-manager",
    icon: <ListChecks className="w-8 h-8" />,
    label: "Process Manager",
    href: "/process-manager",
    description: "Monitor and manage running processes",
    color: "text-primary",
    operatorOrAdmin: true,
  },
  {
    id: "service-manager",
    icon: <Settings className="w-8 h-8" />,
    label: "Service Manager",
    href: "/service-manager",
    description: "Control systemd services",
    color: "text-chart-5",
    operatorOrAdmin: true,
  },
  {
    id: "network-manager",
    icon: <Network className="w-8 h-8" />,
    label: "Network Manager",
    href: "/network-manager",
    description: "Manage network interfaces, firewall, and routes",
    color: "text-blue-400",
    operatorOrAdmin: true,
  },
  {
    id: "container-manager",
    icon: <Box className="w-8 h-8" />,
    label: "Container Manager",
    href: "/container-manager",
    description: "Manage Podman containers, images, and volumes",
    color: "text-cyan-400",
    operatorOrAdmin: true,
  },
  {
    id: "rpm-manager",
    icon: <Package className="w-8 h-8" />,
    label: "RPM Manager",
    href: "/rpm-manager",
    description: "Manage packages, updates, and repositories",
    color: "text-chart-1",
    operatorOrAdmin: true,
  },
  {
    id: "storage-viewer",
    icon: <HardDrive className="w-8 h-8" />,
    label: "Storage Viewer",
    href: "/storage-viewer",
    description: "View disk usage and storage information",
    color: "text-chart-3",
    operatorOrAdmin: true,
  },
  {
    id: "file-browser",
    icon: <FolderOpen className="w-8 h-8" />,
    label: "File Browser",
    href: "/file-browser",
    description: "Browse, upload, and manage files",
    color: "text-chart-2",
    operatorOrAdmin: true,
  },
  {
    id: "terminal",
    icon: <Terminal className="w-8 h-8" />,
    label: "Terminal",
    href: "/terminal",
    description: "Interactive shell terminal",
    color: "text-green-500",
    operatorOrAdmin: true,
  },
  {
    id: "user-manager",
    icon: <Users className="w-8 h-8" />,
    label: "User Manager",
    href: "/user-manager",
    description: "Manage system users and permissions",
    color: "text-chart-2",
    adminOnly: true,
  },
  {
    id: "group-manager",
    icon: <UserCog className="w-8 h-8" />,
    label: "Group Manager",
    href: "/group-manager",
    description: "Manage user groups and permissions",
    color: "text-chart-1",
    adminOnly: true,
  },
  {
    id: "realm-manager",
    icon: <Globe className="w-8 h-8" />,
    label: "Realm Manager",
    href: "/realm-manager",
    description: "Manage authentication realms and domains",
    color: "text-accent",
    adminOnly: true,
  },
  {
    id: "audit-log",
    icon: <FileText className="w-8 h-8" />,
    label: "Audit Log",
    href: "/audit-log",
    description: "View system audit logs and security events",
    color: "text-orange-400",
    adminOnly: true,
  },
  {
    id: "settings",
    icon: <Cog className="w-8 h-8" />,
    label: "Settings",
    href: "/settings",
    description: "Configure desktop and system preferences",
    color: "text-chart-4",
  },
];

export default function DashboardPage() {
  const { isAuthenticated, isLoading, user, token } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [hiddenApps, setHiddenApps] = useState<Set<string>>(new Set());
  const [containerApps, setContainerApps] = useState<ContainerApp[]>([]);

  // Fetch container apps with web UIs
  const fetchContainerApps = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/desktop-apps", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setContainerApps(data || []);
      }
    } catch {
      // Ignore errors - container apps are optional
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

  // Fetch container apps on load and periodically
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchContainerApps();
      const interval = setInterval(fetchContainerApps, 10000); // Refresh every 10s
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, token, fetchContainerApps]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-12 h-12 mx-auto mb-4 text-accent animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === "admin" || user?.is_pam_admin;
  const isOperatorOrAdmin = user?.role === "admin" || user?.role === "operator" || user?.is_pam_admin;

  const filteredApps = desktopApps.filter((app) => {
    // Admin-only apps require admin role
    if (app.adminOnly && !isAdmin) return false;
    // Operator+ apps require operator or admin role
    if (app.operatorOrAdmin && !isOperatorOrAdmin) return false;
    return true;
  });

  const visibleApps = filteredApps.filter(app => !hiddenApps.has(app.id));

  const toggleAppVisibility = (appId: string) => {
    setHiddenApps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(appId)) {
        newSet.delete(appId);
      } else {
        newSet.add(appId);
      }
      return newSet;
    });
  };

  return (
    <DashboardLayout 
      time={time} 
      showCustomize={true}
      onCustomizeClick={() => setIsCustomizing(!isCustomizing)}
    >
      {/* Desktop area - full height minus header */}
      <div className="h-[calc(100vh-3.5rem)] relative overflow-hidden">
        {/* Customize panel */}
        {isCustomizing && (
          <div className="absolute top-6 right-6 z-20 w-80 bg-card/95 backdrop-blur-md border border-border/50 rounded-lg shadow-2xl">
            <div className="p-4 border-b border-border/50">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Cog className="w-4 h-4" />
                Customize Desktop
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Show or hide desktop icons
              </p>
            </div>
            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
              {filteredApps.map((app) => (
                <label
                  key={app.id}
                  className="flex items-center gap-3 p-2 rounded hover:bg-accent/10 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={!hiddenApps.has(app.id)}
                    onChange={() => toggleAppVisibility(app.id)}
                    className="w-4 h-4 rounded border-accent/50 text-accent focus:ring-accent"
                  />
                  <div className="flex items-center gap-2 flex-1">
                    <div className={app.color}>{app.icon}</div>
                    <span className="text-sm">{app.label}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Desktop icons grid */}
        <div className="absolute inset-0 p-6">
          <div className="flex flex-wrap content-start gap-2">
            {/* System Apps */}
            {visibleApps.map((app) => (
              <DesktopIcon
                key={app.id}
                icon={app.icon}
                label={app.label}
                href={app.href}
                description={app.description}
                color={app.color}
              />
            ))}

            {/* Container Apps Separator */}
            {containerApps.length > 0 && (
              <div className="w-full my-4 flex items-center gap-4">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
                <span className="text-xs text-cyan-500/70 font-medium tracking-wider">CONTAINER APPS</span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
              </div>
            )}

            {/* Container Apps */}
            {containerApps.map((app) => (
              <ContainerAppIcon
                key={app.id}
                containerId={app.container_id}
                name={app.name}
                icon={app.icon}
                status={app.status}
              />
            ))}
          </div>
        </div>

        {/* Welcome message overlay - bottom right */}
        <div className="absolute bottom-6 right-6 text-right pointer-events-none">
          <div className="inline-block bg-card/60 backdrop-blur-md border border-border/50 rounded-lg p-4 shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative w-5 h-5">
                <div className="absolute inset-0 border-2 border-accent rounded rotate-45 flex items-center justify-center">
                  <span className="text-[8px] font-bold text-accent -rotate-45">SD</span>
                </div>
              </div>
              <span className="text-sm font-bold tracking-widest text-foreground">STARDECK OS</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Welcome, <span className="text-accent">{user?.username}</span>
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Double-click an icon to open
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
