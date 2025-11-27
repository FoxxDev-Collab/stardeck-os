"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import {
  Box,
  ExternalLink,
  RefreshCw,
  Maximize2,
  Minimize2,
  X,
  Loader2,
  AlertCircle,
  Play,
  Square,
} from "lucide-react";

interface ContainerInfo {
  id: string;
  container_id: string;
  name: string;
  image: string;
  status: string;
  web_ui_port: number;
  web_ui_path: string;
  icon: string;
}

function ContainerAppContent() {
  const { isAuthenticated, isLoading, token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const containerId = searchParams.get("id");

  const [time, setTime] = useState<string>("");
  const [container, setContainer] = useState<ContainerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Only admins can control containers
  const isAdmin = user?.role === "admin" || user?.is_pam_admin;

  // Fetch container info
  const fetchContainer = useCallback(async () => {
    if (!token || !containerId) return;

    try {
      const response = await fetch(`/api/containers/${containerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Container not found");
      }

      const data = await response.json();
      setContainer(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load container");
    } finally {
      setLoading(false);
    }
  }, [token, containerId]);

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
    if (isAuthenticated && token && containerId) {
      fetchContainer();
      // Poll for status updates
      const interval = setInterval(fetchContainer, 5000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, token, containerId, fetchContainer]);

  const handleRefresh = () => {
    setIframeKey(prev => prev + 1);
  };

  const handleOpenExternal = () => {
    if (container?.web_ui_port) {
      window.open(`http://${window.location.hostname}:${container.web_ui_port}${container.web_ui_path || "/"}`, "_blank");
    }
  };

  const handleContainerAction = async (action: "start" | "stop") => {
    if (!token || !containerId) return;

    setActionInProgress(true);
    try {
      const response = await fetch(`/api/containers/${containerId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to ${action} container`);
      }

      await fetchContainer();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action} container`);
    } finally {
      setActionInProgress(false);
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-accent animate-spin" />
      </div>
    );
  }

  if (!containerId) {
    return (
      <DashboardLayout title="ERROR" time={time}>
        <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Container Specified</h2>
            <p className="text-muted-foreground mb-4">Please select a container from the desktop.</p>
            <Button onClick={() => router.push("/dashboard")}>
              Return to Desktop
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout title="LOADING..." time={time}>
        <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-accent animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !container) {
    return (
      <DashboardLayout title="ERROR" time={time}>
        <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Container Not Found</h2>
            <p className="text-muted-foreground mb-4">{error || "The container could not be found."}</p>
            <Button onClick={() => router.push("/dashboard")}>
              Return to Desktop
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isRunning = container.status === "running";

  // Determine if we should use the proxy or direct access
  // Use proxy when: on HTTPS (mixed content blocked) or non-standard ports (likely behind reverse proxy)
  const useProxy = window.location.protocol === "https:" ||
                   (window.location.port !== "" && window.location.port !== "80" && window.location.port !== "3000");

  // Proxy URL goes through the backend which can access localhost container ports
  const proxyUrl = `/api/containers/${containerId}/proxy${container.web_ui_path || "/"}`;
  // Direct URL for development or when HTTP access works
  const directUrl = `http://${window.location.hostname}:${container.web_ui_port}${container.web_ui_path || "/"}`;

  const iframeUrl = useProxy ? proxyUrl : directUrl;

  // Fullscreen mode
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        {/* Fullscreen toolbar */}
        <div className="absolute top-0 left-0 right-0 h-10 bg-card/90 backdrop-blur-sm border-b border-border/50 flex items-center justify-between px-4 z-10">
          <div className="flex items-center gap-2">
            {container.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={container.icon} alt="" className="w-5 h-5" />
            ) : (
              <Box className="w-5 h-5 text-cyan-400" />
            )}
            <span className="text-sm font-medium">{container.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${isRunning ? "bg-green-500/20 text-green-500" : "bg-gray-500/20 text-gray-500"}`}>
              {container.status}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleRefresh} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleOpenExternal} title="Open in new tab">
              <ExternalLink className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleFullscreen} title="Exit fullscreen">
              <Minimize2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")} title="Close">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Iframe */}
        {isRunning ? (
          <iframe
            key={iframeKey}
            src={iframeUrl}
            className="w-full h-[calc(100%-2.5rem)] mt-10 border-0"
            title={container.name}
          />
        ) : (
          <div className="w-full h-[calc(100%-2.5rem)] mt-10 flex items-center justify-center">
            <div className="text-center">
              <Box className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Container is not running</h3>
              <p className="text-muted-foreground mb-4">Start the container to access its web interface.</p>
              {isAdmin && (
                <Button onClick={() => handleContainerAction("start")} disabled={actionInProgress}>
                  {actionInProgress ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Start Container
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <DashboardLayout title={container.name.toUpperCase()} time={time}>
      <div className="h-[calc(100vh-3.5rem)] flex flex-col">
        {/* App toolbar */}
        <div className="h-12 bg-card/70 backdrop-blur-sm border-b border-border/50 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            {container.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={container.icon} alt="" className="w-6 h-6" />
            ) : (
              <Box className="w-6 h-6 text-cyan-400" />
            )}
            <div>
              <span className="font-medium">{container.name}</span>
              <span className="text-xs text-muted-foreground ml-2">{container.image}</span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded ml-2 ${isRunning ? "bg-green-500/20 text-green-500" : "bg-gray-500/20 text-gray-500"}`}>
              {container.status}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <>
                {isRunning ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleContainerAction("stop")}
                    disabled={actionInProgress}
                    title="Stop container"
                  >
                    {actionInProgress ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleContainerAction("start")}
                    disabled={actionInProgress}
                    title="Start container"
                  >
                    {actionInProgress ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                )}
                <div className="w-px h-6 bg-border/50 mx-1" />
              </>
            )}
            <Button variant="ghost" size="sm" onClick={handleRefresh} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleOpenExternal} title="Open in new tab">
              <ExternalLink className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleFullscreen} title="Fullscreen">
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 relative">
          {isRunning ? (
            <iframe
              key={iframeKey}
              src={iframeUrl}
              className="absolute inset-0 w-full h-full border-0"
              title={container.name}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50">
              <div className="text-center">
                <Box className="w-20 h-20 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Container is not running</h3>
                <p className="text-muted-foreground mb-6">
                  {isAdmin ? "Start the container to access its web interface." : "Contact an administrator to start this container."}
                </p>
                {isAdmin && (
                  <Button size="lg" onClick={() => handleContainerAction("start")} disabled={actionInProgress}>
                    {actionInProgress ? (
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-5 h-5 mr-2" />
                    )}
                    Start Container
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function ContainerAppPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-accent animate-spin" />
      </div>
    }>
      <ContainerAppContent />
    </Suspense>
  );
}
