"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Activity, Settings, Search, Play, Square, RotateCw, CheckCircle2, XCircle, AlertCircle, Power } from "lucide-react";

interface Service {
  name: string;
  description: string;
  load_state: string;
  active_state: string;
  sub_state: string;
  enabled: boolean;
  running: boolean;
}

export default function ServiceManagerPage() {
  const { isAuthenticated, isLoading, token } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [services, setServices] = useState<Service[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "running" | "stopped" | "failed">("all");
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/services", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch services");
      }

      const data = await response.json();
      setServices(data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load services");
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

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchServices();
      const interval = setInterval(fetchServices, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, token, fetchServices]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Activity className="w-12 h-12 text-accent animate-pulse" />
      </div>
    );
  }

  const filteredServices = services
    .filter((s) => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
      const status = s.active_state === "active" ? "running" : 
                    s.active_state === "failed" ? "failed" : "stopped";
      const matchesFilter = filterStatus === "all" || status === filterStatus;
      return matchesSearch && matchesFilter;
    });

  const runningCount = services.filter((s) => s.active_state === "active").length;
  const stoppedCount = services.filter((s) => s.active_state === "inactive").length;
  const failedCount = services.filter((s) => s.active_state === "failed").length;

  const handleServiceAction = async (serviceName: string, action: "start" | "stop" | "restart") => {
    if (!token) return;
    
    setActionInProgress(serviceName);
    try {
      const response = await fetch(`/api/services/${serviceName}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${action} service`);
      }

      // Refresh services list
      await fetchServices();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action} service`);
    } finally {
      setActionInProgress(null);
    }
  };

  const getStatus = (service: Service) => {
    if (service.active_state === "active") return "running";
    if (service.active_state === "failed") return "failed";
    return "stopped";
  };

  const getStatusIcon = (service: Service) => {
    const status = getStatus(service);
    switch (status) {
      case "running":
        return <CheckCircle2 className="w-4 h-4 text-primary" />;
      case "stopped":
        return <XCircle className="w-4 h-4 text-muted-foreground" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-destructive" />;
    }
  };

  return (
    <DashboardLayout title="SERVICE MANAGER" time={time}>
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Services
              </CardTitle>
              <Settings className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{services.length}</div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Running
              </CardTitle>
              <CheckCircle2 className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{runningCount}</div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Stopped
              </CardTitle>
              <XCircle className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stoppedCount}</div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Failed
              </CardTitle>
              <AlertCircle className="w-4 h-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{failedCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Services List */}
        <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
          <CardHeader>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-accent" />
                System Services
              </CardTitle>
              <div className="flex gap-2 w-full md:w-auto flex-wrap">
                <div className="flex gap-2">
                  <Button
                    variant={filterStatus === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus("all")}
                    className={filterStatus === "all" ? "bg-accent hover:bg-accent/90" : ""}
                  >
                    All
                  </Button>
                  <Button
                    variant={filterStatus === "running" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus("running")}
                    className={filterStatus === "running" ? "bg-primary hover:bg-primary/90" : ""}
                  >
                    Running
                  </Button>
                  <Button
                    variant={filterStatus === "stopped" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus("stopped")}
                  >
                    Stopped
                  </Button>
                  <Button
                    variant={filterStatus === "failed" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus("failed")}
                    className={filterStatus === "failed" ? "bg-destructive hover:bg-destructive/90" : ""}
                  >
                    Failed
                  </Button>
                </div>
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search services..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-input/80 border-border/60"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="p-4 mb-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              {filteredServices.map((service, index) => {
                const status = getStatus(service);
                return (
                <div
                  key={`${service.name}-${index}`}
                  className="p-4 rounded-lg border border-border/50 bg-background/40 hover:bg-background/60 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      {getStatusIcon(service)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{service.name}</h3>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className={
                            status === "running" ? "text-primary" :
                            status === "failed" ? "text-destructive" :
                            "text-muted-foreground"
                          }>
                            {status.toUpperCase()}
                          </span>
                          {service.description && (
                            <span className="truncate max-w-md">{service.description}</span>
                          )}
                          {service.enabled && (
                            <span className="flex items-center gap-1">
                              <Power className="w-3 h-3" />
                              Auto-start
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleServiceAction(service.name, "start")}
                        disabled={status === "running" || actionInProgress === service.name}
                        className="gap-2"
                      >
                        <Play className="w-3 h-3" />
                        Start
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleServiceAction(service.name, "stop")}
                        disabled={status === "stopped" || actionInProgress === service.name}
                        className="gap-2"
                      >
                        <Square className="w-3 h-3" />
                        Stop
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleServiceAction(service.name, "restart")}
                        disabled={status === "stopped" || actionInProgress === service.name}
                        className="gap-2"
                      >
                        <RotateCw className="w-3 h-3" />
                        Restart
                      </Button>
                    </div>
                  </div>
                </div>
              );})}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
