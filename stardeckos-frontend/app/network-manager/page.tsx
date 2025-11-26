"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  Activity,
  Network,
  Shield,
  Route,
  Cable,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  X,
  ArrowUpDown,
  Globe,
  Server,
  Wifi,
  AlertTriangle,
} from "lucide-react";

// Types
interface NetworkInterface {
  name: string;
  state: string;
  mac: string;
  mtu: number;
  speed: number;
  type: string;
  ipv4: string[];
  ipv6: string[];
  driver: string;
  is_physical: boolean;
}

interface InterfaceStats {
  name: string;
  rx_bytes: number;
  tx_bytes: number;
  rx_packets: number;
  tx_packets: number;
  rx_errors: number;
  tx_errors: number;
  rx_dropped: number;
  tx_dropped: number;
}

interface FirewallZone {
  name: string;
  description: string;
  target: string;
  interfaces: string[];
  sources: string[];
  services: string[];
  ports: string[];
  protocols: string[];
  masquerade: boolean;
  forward_ports: string[];
  rich_rules: string[];
  icmp_blocks: string[];
  is_default: boolean;
  is_active: boolean;
}

interface FirewallStatus {
  running: boolean;
  default_zone: string;
  version: string;
}

interface RouteEntry {
  destination: string;
  gateway: string;
  genmask: string;
  flags: string;
  metric: number;
  interface: string;
  protocol: string;
  scope: string;
}

interface DNSConfig {
  hostname: string;
  fqdn: string;
  nameservers: string[];
  search: string[];
  resolv_conf: string;
}

interface Connection {
  protocol: string;
  local_addr: string;
  local_port: number;
  remote_addr: string;
  remote_port: number;
  state: string;
  pid: number;
  process: string;
}

export default function NetworkManagerPage() {
  const { isAuthenticated, isLoading, token, user } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [activeTab, setActiveTab] = useState("interfaces");

  // Data states
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [interfaceStats, setInterfaceStats] = useState<Record<string, InterfaceStats>>({});
  const [firewallStatus, setFirewallStatus] = useState<FirewallStatus | null>(null);
  const [zones, setZones] = useState<FirewallZone[]>([]);
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [routes, setRoutes] = useState<RouteEntry[]>([]);
  const [dns, setDns] = useState<DNSConfig | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dialog states
  const [addServiceDialog, setAddServiceDialog] = useState(false);
  const [addPortDialog, setAddPortDialog] = useState(false);
  const [addRouteDialog, setAddRouteDialog] = useState(false);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(false);
  const [resultDialog, setResultDialog] = useState(false);
  const [resultMessage, setResultMessage] = useState({ success: false, message: "" });

  // Form states
  const [selectedZone, setSelectedZone] = useState<FirewallZone | null>(null);
  const [selectedService, setSelectedService] = useState("");
  const [newPort, setNewPort] = useState({ port: "", protocol: "tcp" });
  const [newRoute, setNewRoute] = useState({ destination: "", gateway: "", interface: "", metric: 0 });
  const [deleteTarget, setDeleteTarget] = useState({ type: "", zone: "", value: "" });
  const [connectionFilter, setConnectionFilter] = useState({ protocol: "", state: "" });

  // Check if user can manage network (admin only)
  const canManageNetwork = user?.role === "admin";

  // Fetch functions
  const fetchInterfaces = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/network/interfaces", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInterfaces(data || []);

        // Fetch stats for each interface
        const statsPromises = (data || []).map(async (iface: NetworkInterface) => {
          const statsRes = await fetch(`/api/network/interfaces/${iface.name}/stats`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (statsRes.ok) {
            return { name: iface.name, stats: await statsRes.json() };
          }
          return null;
        });

        const statsResults = await Promise.all(statsPromises);
        const statsMap: Record<string, InterfaceStats> = {};
        statsResults.forEach((result) => {
          if (result) {
            statsMap[result.name] = result.stats;
          }
        });
        setInterfaceStats(statsMap);
      }
    } catch (err) {
      console.error("Failed to fetch interfaces:", err);
    }
  }, [token]);

  const fetchFirewall = useCallback(async () => {
    if (!token) return;
    try {
      const [statusRes, zonesRes, servicesRes] = await Promise.all([
        fetch("/api/network/firewall/status", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/network/firewall/zones", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/network/firewall/services", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (statusRes.ok) setFirewallStatus(await statusRes.json());
      if (zonesRes.ok) setZones(await zonesRes.json());
      if (servicesRes.ok) setAvailableServices(await servicesRes.json());
    } catch (err) {
      console.error("Failed to fetch firewall data:", err);
    }
  }, [token]);

  const fetchRoutes = useCallback(async () => {
    if (!token) return;
    try {
      const [routesRes, dnsRes] = await Promise.all([
        fetch("/api/network/routes", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/network/dns", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (routesRes.ok) setRoutes(await routesRes.json());
      if (dnsRes.ok) setDns(await dnsRes.json());
    } catch (err) {
      console.error("Failed to fetch routes:", err);
    }
  }, [token]);

  const fetchConnections = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      if (connectionFilter.protocol) params.append("protocol", connectionFilter.protocol);
      if (connectionFilter.state) params.append("state", connectionFilter.state);

      const res = await fetch(`/api/network/connections?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setConnections(await res.json());
    } catch (err) {
      console.error("Failed to fetch connections:", err);
    }
  }, [token, connectionFilter]);

  const fetchAllData = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await Promise.all([fetchInterfaces(), fetchFirewall(), fetchRoutes(), fetchConnections()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch network data");
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchInterfaces, fetchFirewall, fetchRoutes, fetchConnections]);

  // Auth check
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Time update
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initial data fetch
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchAllData();
      const interval = setInterval(fetchAllData, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, token, fetchAllData]);

  // Refetch connections when filter changes
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchConnections();
    }
  }, [connectionFilter, isAuthenticated, token, fetchConnections]);

  // Utility functions
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getInterfaceIcon = (type: string) => {
    switch (type) {
      case "loopback":
        return <Server className="w-4 h-4" />;
      case "wireless":
        return <Wifi className="w-4 h-4" />;
      case "bridge":
      case "virtual":
        return <Network className="w-4 h-4" />;
      default:
        return <Cable className="w-4 h-4" />;
    }
  };

  // API actions
  const addService = async () => {
    if (!selectedZone || !selectedService || !token) return;

    try {
      const res = await fetch(`/api/network/firewall/zones/${selectedZone.name}/services`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ service: selectedService, permanent: true }),
      });

      const result = await res.json();
      setResultMessage({
        success: res.ok,
        message: res.ok ? "Service added successfully" : result.error || "Failed to add service",
      });
      setResultDialog(true);
      setAddServiceDialog(false);
      if (res.ok) fetchFirewall();
    } catch (err) {
      setResultMessage({ success: false, message: "Failed to add service" });
      setResultDialog(true);
    }
  };

  const addPort = async () => {
    if (!selectedZone || !newPort.port || !token) return;

    try {
      const res = await fetch(`/api/network/firewall/zones/${selectedZone.name}/ports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          port: parseInt(newPort.port),
          protocol: newPort.protocol,
          permanent: true,
        }),
      });

      const result = await res.json();
      setResultMessage({
        success: res.ok,
        message: res.ok ? "Port added successfully" : result.error || "Failed to add port",
      });
      setResultDialog(true);
      setAddPortDialog(false);
      if (res.ok) fetchFirewall();
    } catch (err) {
      setResultMessage({ success: false, message: "Failed to add port" });
      setResultDialog(true);
    }
  };

  const addRouteHandler = async () => {
    if (!newRoute.destination || !token) return;

    try {
      const res = await fetch("/api/network/routes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newRoute),
      });

      const result = await res.json();
      setResultMessage({
        success: res.ok,
        message: res.ok ? "Route added successfully" : result.error || "Failed to add route",
      });
      setResultDialog(true);
      setAddRouteDialog(false);
      if (res.ok) fetchRoutes();
    } catch (err) {
      setResultMessage({ success: false, message: "Failed to add route" });
      setResultDialog(true);
    }
  };

  const deleteItem = async () => {
    if (!token) return;

    try {
      let res;
      if (deleteTarget.type === "service") {
        res = await fetch(
          `/api/network/firewall/zones/${deleteTarget.zone}/services/${deleteTarget.value}?permanent=true`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      } else if (deleteTarget.type === "port") {
        res = await fetch(
          `/api/network/firewall/zones/${deleteTarget.zone}/ports/${deleteTarget.value}?permanent=true`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      } else if (deleteTarget.type === "route") {
        res = await fetch(`/api/network/routes/${encodeURIComponent(deleteTarget.value)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      if (res) {
        const result = await res.json();
        setResultMessage({
          success: res.ok,
          message: res.ok ? "Deleted successfully" : result.error || "Failed to delete",
        });
        setResultDialog(true);
        setDeleteConfirmDialog(false);
        if (res.ok) {
          if (deleteTarget.type === "route") {
            fetchRoutes();
          } else {
            fetchFirewall();
          }
        }
      }
    } catch (err) {
      setResultMessage({ success: false, message: "Failed to delete" });
      setResultDialog(true);
    }
  };

  const reloadFirewall = async () => {
    if (!token) return;

    try {
      const res = await fetch("/api/network/firewall/reload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await res.json();
      setResultMessage({
        success: res.ok,
        message: res.ok ? "Firewall reloaded" : result.error || "Failed to reload",
      });
      setResultDialog(true);
      if (res.ok) fetchFirewall();
    } catch (err) {
      setResultMessage({ success: false, message: "Failed to reload firewall" });
      setResultDialog(true);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Activity className="w-12 h-12 text-accent animate-pulse" />
      </div>
    );
  }

  return (
    <DashboardLayout title="NETWORK MANAGER" time={time}>
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Interfaces</CardTitle>
              <Network className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{interfaces.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {interfaces.filter((i) => i.state === "up").length} active
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Firewall</CardTitle>
              <Shield className="w-4 h-4 text-chart-3" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold flex items-center gap-2">
                {firewallStatus?.running ? (
                  <Check className="w-6 h-6 text-green-500" />
                ) : (
                  <X className="w-6 h-6 text-destructive" />
                )}
                {firewallStatus?.running ? "Active" : "Inactive"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Default: {firewallStatus?.default_zone || "N/A"}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Routes</CardTitle>
              <Route className="w-4 h-4 text-chart-4" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{routes.length}</div>
              <p className="text-xs text-muted-foreground mt-1">routing entries</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Connections</CardTitle>
              <ArrowUpDown className="w-4 h-4 text-chart-5" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{connections.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {connections.filter((c) => c.state === "ESTAB").length} established
              </p>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
            {error}
          </div>
        )}

        {/* Main Content with Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="interfaces" className="gap-2">
                <Network className="w-4 h-4" />
                Interfaces
              </TabsTrigger>
              <TabsTrigger value="firewall" className="gap-2">
                <Shield className="w-4 h-4" />
                Firewall
              </TabsTrigger>
              <TabsTrigger value="routes" className="gap-2">
                <Route className="w-4 h-4" />
                Routes
              </TabsTrigger>
              <TabsTrigger value="connections" className="gap-2">
                <ArrowUpDown className="w-4 h-4" />
                Connections
              </TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="sm" onClick={fetchAllData} disabled={isRefreshing}>
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Interfaces Tab */}
          <TabsContent value="interfaces">
            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="w-5 h-5 text-accent" />
                  Network Interfaces
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {interfaces.map((iface) => (
                    <div
                      key={iface.name}
                      className="p-4 rounded-lg border border-border/50 bg-background/40"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {getInterfaceIcon(iface.type)}
                            <h3 className="font-semibold font-mono">{iface.name}</h3>
                            <Badge variant={iface.state === "up" ? "default" : "secondary"}>
                              {iface.state}
                            </Badge>
                            <Badge variant="outline">{iface.type}</Badge>
                            {iface.is_physical && <Badge variant="outline">Physical</Badge>}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">MAC:</span>
                              <span className="ml-2 font-mono">{iface.mac || "N/A"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">MTU:</span>
                              <span className="ml-2">{iface.mtu}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Speed:</span>
                              <span className="ml-2">
                                {iface.speed > 0 ? `${iface.speed} Mbps` : "N/A"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Driver:</span>
                              <span className="ml-2">{iface.driver || "N/A"}</span>
                            </div>
                          </div>
                          {(iface.ipv4.length > 0 || iface.ipv6.length > 0) && (
                            <div className="mt-3 space-y-1">
                              {iface.ipv4.map((ip, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-sm">
                                  <Globe className="w-3 h-3 text-muted-foreground" />
                                  <span className="font-mono text-accent">{ip}</span>
                                  <Badge variant="outline" className="text-xs">
                                    IPv4
                                  </Badge>
                                </div>
                              ))}
                              {iface.ipv6.map((ip, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-sm">
                                  <Globe className="w-3 h-3 text-muted-foreground" />
                                  <span className="font-mono text-xs">{ip}</span>
                                  <Badge variant="outline" className="text-xs">
                                    IPv6
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                          {interfaceStats[iface.name] && (
                            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                              <div>
                                RX: {formatBytes(interfaceStats[iface.name].rx_bytes)}
                              </div>
                              <div>
                                TX: {formatBytes(interfaceStats[iface.name].tx_bytes)}
                              </div>
                              <div>Packets RX: {interfaceStats[iface.name].rx_packets}</div>
                              <div>Packets TX: {interfaceStats[iface.name].tx_packets}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Firewall Tab */}
          <TabsContent value="firewall">
            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-chart-3" />
                  Firewall Zones
                </CardTitle>
                {canManageNetwork && (
                  <Button variant="outline" size="sm" onClick={reloadFirewall}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reload Firewall
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {zones.map((zone) => (
                    <div
                      key={zone.name}
                      className="p-4 rounded-lg border border-border/50 bg-background/40"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{zone.name}</h3>
                          {zone.is_default && <Badge>Default</Badge>}
                          {zone.is_active && (
                            <Badge variant="outline" className="text-green-500 border-green-500">
                              Active
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Target: {zone.target || "default"}
                          </span>
                        </div>
                        {canManageNetwork && (
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedZone(zone);
                                setSelectedService("");
                                setAddServiceDialog(true);
                              }}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Service
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedZone(zone);
                                setNewPort({ port: "", protocol: "tcp" });
                                setAddPortDialog(true);
                              }}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Port
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        {zone.interfaces.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-muted-foreground">Interfaces:</span>
                            {zone.interfaces.map((iface) => (
                              <Badge key={iface} variant="secondary">
                                {iface}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {zone.services.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-muted-foreground">Services:</span>
                            {zone.services.map((service) => (
                              <Badge
                                key={service}
                                variant="outline"
                                className="gap-1 cursor-pointer hover:bg-destructive/10"
                                onClick={() => {
                                  if (canManageNetwork) {
                                    setDeleteTarget({
                                      type: "service",
                                      zone: zone.name,
                                      value: service,
                                    });
                                    setDeleteConfirmDialog(true);
                                  }
                                }}
                              >
                                {service}
                                {canManageNetwork && <X className="w-3 h-3" />}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {zone.ports.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-muted-foreground">Ports:</span>
                            {zone.ports.map((port) => (
                              <Badge
                                key={port}
                                variant="outline"
                                className="gap-1 cursor-pointer hover:bg-destructive/10"
                                onClick={() => {
                                  if (canManageNetwork) {
                                    setDeleteTarget({
                                      type: "port",
                                      zone: zone.name,
                                      value: port,
                                    });
                                    setDeleteConfirmDialog(true);
                                  }
                                }}
                              >
                                {port}
                                {canManageNetwork && <X className="w-3 h-3" />}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {zone.masquerade && (
                          <div className="text-sm text-muted-foreground">
                            <Check className="w-4 h-4 inline mr-1 text-green-500" />
                            Masquerading enabled
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Routes Tab */}
          <TabsContent value="routes">
            <div className="space-y-6">
              {/* DNS Info */}
              {dns && (
                <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="w-5 h-5 text-chart-4" />
                      DNS Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Hostname</Label>
                        <p className="font-mono">{dns.hostname}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">FQDN</Label>
                        <p className="font-mono">{dns.fqdn || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Nameservers</Label>
                        <div className="space-y-1">
                          {dns.nameservers.map((ns, idx) => (
                            <p key={idx} className="font-mono text-sm">
                              {ns}
                            </p>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Search Domains</Label>
                        <div className="space-y-1">
                          {dns.search.map((s, idx) => (
                            <p key={idx} className="font-mono text-sm">
                              {s}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Routes Table */}
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Route className="w-5 h-5 text-chart-4" />
                    Routing Table
                  </CardTitle>
                  {canManageNetwork && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setNewRoute({ destination: "", gateway: "", interface: "", metric: 0 });
                        setAddRouteDialog(true);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Route
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left p-2 text-muted-foreground">Destination</th>
                          <th className="text-left p-2 text-muted-foreground">Gateway</th>
                          <th className="text-left p-2 text-muted-foreground">Interface</th>
                          <th className="text-left p-2 text-muted-foreground">Metric</th>
                          <th className="text-left p-2 text-muted-foreground">Protocol</th>
                          {canManageNetwork && (
                            <th className="text-right p-2 text-muted-foreground">Actions</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {routes.map((route, idx) => (
                          <tr key={idx} className="border-b border-border/30 hover:bg-muted/20">
                            <td className="p-2 font-mono">{route.destination}</td>
                            <td className="p-2 font-mono">{route.gateway || "-"}</td>
                            <td className="p-2">{route.interface}</td>
                            <td className="p-2">{route.metric}</td>
                            <td className="p-2">{route.protocol}</td>
                            {canManageNetwork && (
                              <td className="p-2 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setDeleteTarget({
                                      type: "route",
                                      zone: "",
                                      value: route.destination,
                                    });
                                    setDeleteConfirmDialog(true);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Connections Tab */}
          <TabsContent value="connections">
            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpDown className="w-5 h-5 text-chart-5" />
                  Active Connections
                </CardTitle>
                <div className="flex gap-2">
                  <Select
                    value={connectionFilter.protocol}
                    onValueChange={(v) =>
                      setConnectionFilter((prev) => ({ ...prev, protocol: v }))
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Protocol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="udp">UDP</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={connectionFilter.state}
                    onValueChange={(v) => setConnectionFilter((prev) => ({ ...prev, state: v }))}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      <SelectItem value="ESTABLISHED">Established</SelectItem>
                      <SelectItem value="LISTEN">Listening</SelectItem>
                      <SelectItem value="TIME-WAIT">Time Wait</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left p-2 text-muted-foreground">Protocol</th>
                        <th className="text-left p-2 text-muted-foreground">Local Address</th>
                        <th className="text-left p-2 text-muted-foreground">Remote Address</th>
                        <th className="text-left p-2 text-muted-foreground">State</th>
                        <th className="text-left p-2 text-muted-foreground">Process</th>
                      </tr>
                    </thead>
                    <tbody>
                      {connections.slice(0, 100).map((conn, idx) => (
                        <tr key={idx} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="p-2">
                            <Badge variant="outline">{conn.protocol.toUpperCase()}</Badge>
                          </td>
                          <td className="p-2 font-mono text-xs">
                            {conn.local_addr}:{conn.local_port}
                          </td>
                          <td className="p-2 font-mono text-xs">
                            {conn.remote_addr}:{conn.remote_port}
                          </td>
                          <td className="p-2">
                            <Badge
                              variant={conn.state === "ESTAB" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {conn.state}
                            </Badge>
                          </td>
                          <td className="p-2 text-xs">
                            {conn.process ? `${conn.process} (${conn.pid})` : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {connections.length > 100 && (
                    <p className="text-sm text-muted-foreground mt-2 text-center">
                      Showing 100 of {connections.length} connections
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Service Dialog */}
      <Dialog open={addServiceDialog} onOpenChange={setAddServiceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Service to {selectedZone?.name}</DialogTitle>
            <DialogDescription>
              Allow a service through the firewall in this zone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Service</Label>
            <Select value={selectedService} onValueChange={setSelectedService}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select a service" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {availableServices
                  .filter((s) => !selectedZone?.services.includes(s))
                  .map((service) => (
                    <SelectItem key={service} value={service}>
                      {service}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddServiceDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addService} disabled={!selectedService}>
              Add Service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Port Dialog */}
      <Dialog open={addPortDialog} onOpenChange={setAddPortDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Port to {selectedZone?.name}</DialogTitle>
            <DialogDescription>Open a port in this firewall zone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Port Number</Label>
              <Input
                type="number"
                min={1}
                max={65535}
                placeholder="e.g., 8080"
                value={newPort.port}
                onChange={(e) => setNewPort((prev) => ({ ...prev, port: e.target.value }))}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Protocol</Label>
              <Select
                value={newPort.protocol}
                onValueChange={(v) => setNewPort((prev) => ({ ...prev, protocol: v }))}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcp">TCP</SelectItem>
                  <SelectItem value="udp">UDP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPortDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addPort} disabled={!newPort.port}>
              Add Port
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Route Dialog */}
      <Dialog open={addRouteDialog} onOpenChange={setAddRouteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Static Route</DialogTitle>
            <DialogDescription>Add a new route to the routing table.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Destination (CIDR)</Label>
              <Input
                placeholder="e.g., 10.0.0.0/8"
                value={newRoute.destination}
                onChange={(e) =>
                  setNewRoute((prev) => ({ ...prev, destination: e.target.value }))
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label>Gateway (optional)</Label>
              <Input
                placeholder="e.g., 192.168.1.1"
                value={newRoute.gateway}
                onChange={(e) => setNewRoute((prev) => ({ ...prev, gateway: e.target.value }))}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Interface (optional)</Label>
              <Select
                value={newRoute.interface}
                onValueChange={(v) => setNewRoute((prev) => ({ ...prev, interface: v }))}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select interface" />
                </SelectTrigger>
                <SelectContent>
                  {interfaces.map((iface) => (
                    <SelectItem key={iface.name} value={iface.name}>
                      {iface.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metric (optional)</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={newRoute.metric || ""}
                onChange={(e) =>
                  setNewRoute((prev) => ({ ...prev, metric: parseInt(e.target.value) || 0 }))
                }
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRouteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addRouteHandler} disabled={!newRoute.destination}>
              Add Route
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmDialog} onOpenChange={setDeleteConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Confirm Deletion
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {deleteTarget.type}? This action may affect
              network connectivity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteItem}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Result Dialog */}
      <Dialog open={resultDialog} onOpenChange={setResultDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={resultMessage.success ? "text-green-500" : "text-destructive"}>
              {resultMessage.success ? "Success" : "Error"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>{resultMessage.message}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setResultDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
