"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSettings } from "@/lib/settings-context";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Monitor,
  Palette,
  Layout,
  RotateCcw,
  PanelTop,
  PanelBottom,
  Cpu,
  Database,
  HardDrive,
  Wifi,
  Sparkles,
  ScanLine,
  Zap,
  Grid3X3,
  Tag,
  Maximize2,
  Paintbrush,
  Shield,
  Laptop,
  Smartphone,
  Globe,
  Trash2,
  RefreshCw,
  Upload,
  Check,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  ImagePlus,
} from "lucide-react";
import { BackgroundType } from "@/lib/settings-context";
import { ThemeImportDialog } from "@/components/theme-import-dialog";
import { exportThemeToCSS } from "@/lib/theme-parser";

interface Session {
  id: number;
  user_id: number;
  created_at: string;
  expires_at: string;
  ip_address: string;
  user_agent: string;
}

export default function SettingsPage() {
  const { isAuthenticated, isLoading, token, user } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [uploadedBackgrounds, setUploadedBackgrounds] = useState<string[]>([]);
  const {
    settings,
    updateSettings,
    updateTraySettings,
    updateThemeSettings,
    updateDesktopSettings,
    resetSettings,
    customThemes,
    removeCustomTheme,
    applyCustomTheme,
  } = useSettings();

  // Get the correct home directory path for a user
  const getUserHomePath = (username: string) => {
    return username === "root" ? "/root" : `/home/${username}`;
  };

  const fetchUploadedBackgrounds = async () => {
    if (!token || !user) return;
    try {
      const backgroundsPath = `${getUserHomePath(user.username)}/backgrounds`;
      const response = await fetch(`/api/files?path=${encodeURIComponent(backgroundsPath)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const imageFiles = (data.files || [])
          .filter((f: { name: string; is_dir: boolean }) =>
            !f.is_dir && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f.name)
          )
          .map((f: { name: string }) =>
            `/api/files/download?path=${encodeURIComponent(`${backgroundsPath}/${f.name}`)}&token=${encodeURIComponent(token)}`
          );
        setUploadedBackgrounds(imageFiles);
      }
    } catch {
      // Directory might not exist yet, that's okay
    }
  };

  const fetchSessions = async () => {
    if (!token) return;
    setIsLoadingSessions(true);
    try {
      const response = await fetch("/api/auth/sessions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSessions(data || []);
        // Try to identify current session (most recent one from same IP might be current)
        const meResponse = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meResponse.ok) {
          const meData = await meResponse.json();
          setCurrentSessionId(meData.session?.id || null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const revokeSession = async (sessionId: number) => {
    if (!token || !confirm("Are you sure you want to revoke this session?")) return;
    try {
      const response = await fetch(`/api/auth/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      } else {
        alert("Failed to revoke session");
      }
    } catch {
      alert("Failed to revoke session");
    }
  };

  const parseUserAgent = (ua: string) => {
    if (!ua) return { device: "Unknown", browser: "Unknown" };
    const isMobile = /mobile|android|iphone|ipad/i.test(ua);
    const browser = ua.match(/(chrome|firefox|safari|edge|opera)/i)?.[1] || "Unknown";
    return {
      device: isMobile ? "Mobile" : "Desktop",
      browser: browser.charAt(0).toUpperCase() + browser.slice(1).toLowerCase(),
    };
  };

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
      fetchSessions();
      fetchUploadedBackgrounds();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token, user]);

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

  const accentColors = [
    { id: "cyan", label: "Cyan", class: "bg-cyan-500" },
    { id: "amber", label: "Amber", class: "bg-amber-500" },
    { id: "green", label: "Green", class: "bg-green-500" },
    { id: "purple", label: "Purple", class: "bg-purple-500" },
    { id: "red", label: "Red", class: "bg-red-500" },
  ] as const;

  return (
    <DashboardLayout title="SETTINGS" time={time}>
      <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Desktop Settings</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Customize your Stardeck OS experience
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={resetSettings}
              className="gap-2 border-border/60 hover:border-destructive/50 hover:text-destructive"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </Button>
          </div>

          <Tabs defaultValue="taskbar" className="w-full">
            <TabsList className="grid w-full grid-cols-5 bg-card/70 border border-border/50">
              <TabsTrigger value="taskbar" className="gap-2 data-[state=active]:bg-accent/20">
                <Monitor className="w-4 h-4" />
                <span className="hidden sm:inline">Taskbar</span>
              </TabsTrigger>
              <TabsTrigger value="tray" className="gap-2 data-[state=active]:bg-accent/20">
                <Activity className="w-4 h-4" />
                <span className="hidden sm:inline">Tray</span>
              </TabsTrigger>
              <TabsTrigger value="theme" className="gap-2 data-[state=active]:bg-accent/20">
                <Palette className="w-4 h-4" />
                <span className="hidden sm:inline">Theme</span>
              </TabsTrigger>
              <TabsTrigger value="desktop" className="gap-2 data-[state=active]:bg-accent/20">
                <Layout className="w-4 h-4" />
                <span className="hidden sm:inline">Desktop</span>
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2 data-[state=active]:bg-accent/20">
                <Shield className="w-4 h-4" />
                <span className="hidden sm:inline">Security</span>
              </TabsTrigger>
            </TabsList>

            {/* Taskbar Settings */}
            <TabsContent value="taskbar" className="mt-6">
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="w-5 h-5 text-accent" />
                    Taskbar Position
                  </CardTitle>
                  <CardDescription>
                    Choose where the taskbar appears on your desktop
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => updateSettings({ taskbarPosition: "top" })}
                      className={`
                        relative p-4 rounded-lg border-2 transition-all duration-200
                        ${settings.taskbarPosition === "top"
                          ? "border-accent bg-accent/10 shadow-[0_0_15px_rgba(112,187,179,0.2)]"
                          : "border-border/60 hover:border-accent/50 hover:bg-accent/5"
                        }
                      `}
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-full h-20 bg-background/50 rounded border border-border/50 relative overflow-hidden">
                          <div className="absolute top-0 left-0 right-0 h-3 bg-accent/30 border-b border-accent/50" />
                          <div className="absolute bottom-2 left-2 right-2 flex gap-1">
                            <div className="w-4 h-4 rounded bg-muted/50" />
                            <div className="w-4 h-4 rounded bg-muted/50" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <PanelTop className="w-4 h-4" />
                          <span className="font-medium">Top</span>
                        </div>
                      </div>
                      {settings.taskbarPosition === "top" && (
                        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent" />
                      )}
                    </button>

                    <button
                      onClick={() => updateSettings({ taskbarPosition: "bottom" })}
                      className={`
                        relative p-4 rounded-lg border-2 transition-all duration-200
                        ${settings.taskbarPosition === "bottom"
                          ? "border-accent bg-accent/10 shadow-[0_0_15px_rgba(112,187,179,0.2)]"
                          : "border-border/60 hover:border-accent/50 hover:bg-accent/5"
                        }
                      `}
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-full h-20 bg-background/50 rounded border border-border/50 relative overflow-hidden">
                          <div className="absolute top-2 left-2 right-2 flex gap-1">
                            <div className="w-4 h-4 rounded bg-muted/50" />
                            <div className="w-4 h-4 rounded bg-muted/50" />
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 h-3 bg-accent/30 border-t border-accent/50" />
                        </div>
                        <div className="flex items-center gap-2">
                          <PanelBottom className="w-4 h-4" />
                          <span className="font-medium">Bottom</span>
                        </div>
                      </div>
                      {settings.taskbarPosition === "bottom" && (
                        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent" />
                      )}
                    </button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* System Tray Settings */}
            <TabsContent value="tray" className="mt-6 space-y-4">
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-accent" />
                    System Tray Indicators
                  </CardTitle>
                  <CardDescription>
                    Choose which system metrics to display in the taskbar
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Cpu className="w-5 h-5 text-chart-3" />
                      <div>
                        <Label htmlFor="show-cpu" className="font-medium">CPU Usage</Label>
                        <p className="text-xs text-muted-foreground">Show processor utilization</p>
                      </div>
                    </div>
                    <Switch
                      id="show-cpu"
                      checked={settings.tray.showCpu}
                      onCheckedChange={(checked) => updateTraySettings({ showCpu: checked })}
                    />
                  </div>

                  <Separator className="bg-border/50" />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Database className="w-5 h-5 text-chart-4" />
                      <div>
                        <Label htmlFor="show-memory" className="font-medium">Memory Usage</Label>
                        <p className="text-xs text-muted-foreground">Show RAM utilization</p>
                      </div>
                    </div>
                    <Switch
                      id="show-memory"
                      checked={settings.tray.showMemory}
                      onCheckedChange={(checked) => updateTraySettings({ showMemory: checked })}
                    />
                  </div>

                  <Separator className="bg-border/50" />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <HardDrive className="w-5 h-5 text-chart-5" />
                      <div>
                        <Label htmlFor="show-disk" className="font-medium">Disk Usage</Label>
                        <p className="text-xs text-muted-foreground">Show storage utilization</p>
                      </div>
                    </div>
                    <Switch
                      id="show-disk"
                      checked={settings.tray.showDisk}
                      onCheckedChange={(checked) => updateTraySettings({ showDisk: checked })}
                    />
                  </div>

                  <Separator className="bg-border/50" />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Wifi className="w-5 h-5 text-primary" />
                      <div>
                        <Label htmlFor="show-network" className="font-medium">Network Status</Label>
                        <p className="text-xs text-muted-foreground">Show connection indicator</p>
                      </div>
                    </div>
                    <Switch
                      id="show-network"
                      checked={settings.tray.showNetwork}
                      onCheckedChange={(checked) => updateTraySettings({ showNetwork: checked })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-accent" />
                    Refresh Rate
                  </CardTitle>
                  <CardDescription>
                    How often to update system metrics (in seconds)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Update every</span>
                      <span className="font-mono text-accent">{settings.tray.refreshInterval}s</span>
                    </div>
                    <Slider
                      value={[settings.tray.refreshInterval]}
                      onValueChange={([value]) => updateTraySettings({ refreshInterval: value })}
                      min={1}
                      max={10}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>1s (Fast)</span>
                      <span>10s (Slow)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Theme Settings */}
            <TabsContent value="theme" className="mt-6 space-y-4">
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="w-5 h-5 text-accent" />
                    Accent Color
                  </CardTitle>
                  <CardDescription>
                    Choose the primary accent color for the interface (coming soon)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {accentColors.map((color) => (
                      <button
                        key={color.id}
                        onClick={() => updateThemeSettings({ accentColor: color.id })}
                        className={`
                          relative w-12 h-12 rounded-lg transition-all duration-200
                          ${settings.theme.accentColor === color.id
                            ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110"
                            : "hover:scale-105"
                          }
                        `}
                        title={color.label}
                      >
                        <div className={`w-full h-full rounded-lg ${color.class}`} />
                        {settings.theme.accentColor === color.id && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-white shadow" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Select an accent color to customize the interface theme
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-accent" />
                    Visual Effects
                  </CardTitle>
                  <CardDescription>
                    Toggle visual effects and animations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ScanLine className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <Label htmlFor="scanlines" className="font-medium">CRT Scanlines</Label>
                        <p className="text-xs text-muted-foreground">Retro scanline overlay effect</p>
                      </div>
                    </div>
                    <Switch
                      id="scanlines"
                      checked={settings.theme.enableScanlines}
                      onCheckedChange={(checked) => updateThemeSettings({ enableScanlines: checked })}
                    />
                  </div>

                  <Separator className="bg-border/50" />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <Label htmlFor="glow" className="font-medium">Glow Effects</Label>
                        <p className="text-xs text-muted-foreground">Neon glow on active elements</p>
                      </div>
                    </div>
                    <Switch
                      id="glow"
                      checked={settings.theme.enableGlow}
                      onCheckedChange={(checked) => updateThemeSettings({ enableGlow: checked })}
                    />
                  </div>

                  <Separator className="bg-border/50" />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Zap className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <Label htmlFor="animations" className="font-medium">Animations</Label>
                        <p className="text-xs text-muted-foreground">Enable UI animations and transitions</p>
                      </div>
                    </div>
                    <Switch
                      id="animations"
                      checked={settings.theme.enableAnimations}
                      onCheckedChange={(checked) => updateThemeSettings({ enableAnimations: checked })}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Custom Themes Card */}
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Upload className="w-5 h-5 text-accent" />
                        Custom Themes
                      </CardTitle>
                      <CardDescription>
                        Import themes from{" "}
                        <a
                          href="https://tweakcn.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline inline-flex items-center gap-1"
                        >
                          tweakcn.com
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </CardDescription>
                    </div>
                    <ThemeImportDialog>
                      <Button variant="outline" size="sm" className="gap-2 border-border/60">
                        <Upload className="w-4 h-4" />
                        Import
                      </Button>
                    </ThemeImportDialog>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Default Theme Option */}
                  <button
                    onClick={() => applyCustomTheme(null)}
                    className={`
                      w-full p-4 rounded-lg border-2 transition-all duration-200 text-left
                      ${!settings.theme.activeCustomThemeId
                        ? "border-accent bg-accent/10 shadow-[0_0_15px_rgba(112,187,179,0.2)]"
                        : "border-border/60 hover:border-accent/50 hover:bg-accent/5"
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                          <Palette className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="font-medium">Default Theme</p>
                          <p className="text-xs text-muted-foreground">
                            Stardeck OS built-in theme
                          </p>
                        </div>
                      </div>
                      {!settings.theme.activeCustomThemeId && (
                        <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                          <Check className="w-4 h-4 text-accent-foreground" />
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Custom Themes List */}
                  {customThemes.map((theme) => {
                    const isActive = settings.theme.activeCustomThemeId === theme.id;
                    const previewBg = theme.lightVariables.background || theme.darkVariables.background;
                    const previewPrimary = theme.lightVariables.primary || theme.darkVariables.primary;
                    const previewAccent = theme.lightVariables.accent || theme.darkVariables.accent;

                    return (
                      <div
                        key={theme.id}
                        className={`
                          p-4 rounded-lg border-2 transition-all duration-200
                          ${isActive
                            ? "border-accent bg-accent/10 shadow-[0_0_15px_rgba(112,187,179,0.2)]"
                            : "border-border/60 hover:border-accent/50"
                          }
                        `}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <button
                            onClick={() => applyCustomTheme(theme.id)}
                            className="flex items-center gap-3 flex-1 text-left"
                          >
                            {/* Theme Preview Swatches */}
                            <div className="flex -space-x-1">
                              <div
                                className="w-6 h-6 rounded-full border-2 border-card"
                                style={{ backgroundColor: previewBg || "#1a1a2e" }}
                              />
                              <div
                                className="w-6 h-6 rounded-full border-2 border-card"
                                style={{ backgroundColor: previewPrimary || "#4f46e5" }}
                              />
                              <div
                                className="w-6 h-6 rounded-full border-2 border-card"
                                style={{ backgroundColor: previewAccent || "#06b6d4" }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{theme.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(theme.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            {isActive && (
                              <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shrink-0">
                                <Check className="w-4 h-4 text-accent-foreground" />
                              </div>
                            )}
                          </button>

                          {/* Theme Actions */}
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const css = exportThemeToCSS(theme);
                                navigator.clipboard.writeText(css);
                              }}
                              title="Copy CSS"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Delete "${theme.name}"?`)) {
                                  removeCustomTheme(theme.id);
                                }
                              }}
                              title="Delete theme"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {customThemes.length === 0 && (
                    <div className="text-center py-6 text-muted-foreground">
                      <Palette className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No custom themes yet</p>
                      <p className="text-xs mt-1">
                        Import a theme from tweakcn.com to get started
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Desktop Settings */}
            <TabsContent value="desktop" className="mt-6 space-y-4">
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Maximize2 className="w-5 h-5 text-accent" />
                    Icon Size
                  </CardTitle>
                  <CardDescription>
                    Adjust the size of desktop icons
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    {(["small", "medium", "large"] as const).map((size) => (
                      <button
                        key={size}
                        onClick={() => updateDesktopSettings({ iconSize: size })}
                        className={`
                          p-4 rounded-lg border-2 transition-all duration-200
                          ${settings.desktop.iconSize === size
                            ? "border-accent bg-accent/10"
                            : "border-border/60 hover:border-accent/50"
                          }
                        `}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <div
                            className={`
                              rounded bg-muted/50 border border-border/50
                              ${size === "small" ? "w-6 h-6" : size === "medium" ? "w-8 h-8" : "w-10 h-10"}
                            `}
                          />
                          <span className="text-sm capitalize">{size}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Grid3X3 className="w-5 h-5 text-accent" />
                    Grid Spacing
                  </CardTitle>
                  <CardDescription>
                    Adjust spacing between desktop icons
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    {(["compact", "normal", "relaxed"] as const).map((spacing) => (
                      <button
                        key={spacing}
                        onClick={() => updateDesktopSettings({ gridSpacing: spacing })}
                        className={`
                          p-4 rounded-lg border-2 transition-all duration-200
                          ${settings.desktop.gridSpacing === spacing
                            ? "border-accent bg-accent/10"
                            : "border-border/60 hover:border-accent/50"
                          }
                        `}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex gap-1">
                            <div
                              className={`
                                w-3 h-3 rounded-sm bg-muted/50
                                ${spacing === "compact" ? "mr-0" : spacing === "normal" ? "mr-1" : "mr-2"}
                              `}
                            />
                            <div className="w-3 h-3 rounded-sm bg-muted/50" />
                          </div>
                          <span className="text-sm capitalize">{spacing}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="w-5 h-5 text-accent" />
                    Icon Labels
                  </CardTitle>
                  <CardDescription>
                    Show or hide text labels under icons
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Tag className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <Label htmlFor="show-labels" className="font-medium">Show Labels</Label>
                        <p className="text-xs text-muted-foreground">Display icon names below icons</p>
                      </div>
                    </div>
                    <Switch
                      id="show-labels"
                      checked={settings.desktop.showLabels}
                      onCheckedChange={(checked) => updateDesktopSettings({ showLabels: checked })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Paintbrush className="w-5 h-5 text-accent" />
                    Colored Icons
                  </CardTitle>
                  <CardDescription>
                    Display icons with unique colors for each application
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-1">
                        <div className="w-4 h-4 rounded-full bg-accent border-2 border-card" />
                        <div className="w-4 h-4 rounded-full bg-chart-3 border-2 border-card" />
                        <div className="w-4 h-4 rounded-full bg-chart-5 border-2 border-card" />
                      </div>
                      <div>
                        <Label htmlFor="colored-icons" className="font-medium">Enable Colored Icons</Label>
                        <p className="text-xs text-muted-foreground">Each app icon gets a unique color</p>
                      </div>
                    </div>
                    <Switch
                      id="colored-icons"
                      checked={settings.desktop.coloredIcons}
                      onCheckedChange={(checked) => updateDesktopSettings({ coloredIcons: checked })}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Background Settings Card */}
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-accent" />
                    Desktop Background
                  </CardTitle>
                  <CardDescription>
                    Customize your desktop background with colors, gradients, or images
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Background Type Selector */}
                  <div className="grid grid-cols-4 gap-2">
                    {(["default", "color", "gradient", "image"] as BackgroundType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => updateDesktopSettings({ backgroundType: type })}
                        className={`
                          p-3 rounded-lg border-2 transition-all duration-200 text-center
                          ${settings.desktop.backgroundType === type
                            ? "border-accent bg-accent/10"
                            : "border-border/60 hover:border-accent/50"
                          }
                        `}
                      >
                        <span className="text-xs capitalize">{type}</span>
                      </button>
                    ))}
                  </div>

                  {/* Color Picker - shown when type is "color" */}
                  {settings.desktop.backgroundType === "color" && (
                    <div className="space-y-3">
                      <Label>Background Color</Label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={settings.desktop.backgroundColor}
                          onChange={(e) => updateDesktopSettings({ backgroundColor: e.target.value })}
                          className="w-12 h-12 rounded-lg border border-border cursor-pointer"
                        />
                        <input
                          type="text"
                          value={settings.desktop.backgroundColor}
                          onChange={(e) => updateDesktopSettings({ backgroundColor: e.target.value })}
                          placeholder="#1a1a2e"
                          className="flex-1 px-3 py-2 rounded-lg border border-border/60 bg-background/50 text-sm font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {/* Gradient Presets - shown when type is "gradient" */}
                  {settings.desktop.backgroundType === "gradient" && (
                    <div className="space-y-3">
                      <Label>Gradient Presets</Label>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { name: "Deep Space", value: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" },
                          { name: "Midnight", value: "linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #2d2d44 100%)" },
                          { name: "Ocean", value: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)" },
                          { name: "Sunset", value: "linear-gradient(135deg, #1a1a2e 0%, #2d1f3d 50%, #4a1942 100%)" },
                          { name: "Forest", value: "linear-gradient(135deg, #0d1f0d 0%, #1a2f1a 50%, #2d4a2d 100%)" },
                          { name: "Crimson", value: "linear-gradient(135deg, #1a0a0a 0%, #2d1515 50%, #4a1f1f 100%)" },
                          { name: "Aurora", value: "linear-gradient(135deg, #0f0f23 0%, #1a1a3e 25%, #0f3d3d 75%, #1a2f1a 100%)" },
                          { name: "Nebula", value: "linear-gradient(135deg, #1a0a2e 0%, #2d1f4a 50%, #0f2d4a 100%)" },
                        ].map((preset) => (
                          <button
                            key={preset.name}
                            onClick={() => updateDesktopSettings({ backgroundGradient: preset.value })}
                            className={`
                              h-16 rounded-lg border-2 transition-all duration-200 relative overflow-hidden
                              ${settings.desktop.backgroundGradient === preset.value
                                ? "border-accent ring-2 ring-accent/50"
                                : "border-border/60 hover:border-accent/50"
                              }
                            `}
                            style={{ background: preset.value }}
                            title={preset.name}
                          >
                            <span className="absolute bottom-1 left-1 right-1 text-[10px] text-white/70 truncate">
                              {preset.name}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Or enter custom CSS gradient</Label>
                        <input
                          type="text"
                          value={settings.desktop.backgroundGradient}
                          onChange={(e) => updateDesktopSettings({ backgroundGradient: e.target.value })}
                          placeholder="linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)"
                          className="w-full px-3 py-2 rounded-lg border border-border/60 bg-background/50 text-sm font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {/* Image URL/Upload - shown when type is "image" */}
                  {settings.desktop.backgroundType === "image" && (
                    <div className="space-y-3">
                      <Label>Background Image</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={settings.desktop.backgroundImage}
                          onChange={(e) => updateDesktopSettings({ backgroundImage: e.target.value })}
                          placeholder="Enter image URL or path (e.g., /api/files/backgrounds/image.jpg)"
                          className="flex-1 px-3 py-2 rounded-lg border border-border/60 bg-background/50 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          id="bg-upload"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !token || !user) return;

                            setIsUploadingBg(true);
                            const userHome = getUserHomePath(user.username);
                            const backgroundsPath = `${userHome}/backgrounds`;

                            try {
                              // First, ensure the backgrounds directory exists
                              await fetch("/api/files/mkdir", {
                                method: "POST",
                                headers: {
                                  Authorization: `Bearer ${token}`,
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  path: userHome,
                                  name: "backgrounds",
                                }),
                              });

                              // Upload with path as form data (not query param)
                              const formData = new FormData();
                              formData.append("file", file);
                              formData.append("path", backgroundsPath);

                              const response = await fetch("/api/files/upload", {
                                method: "POST",
                                headers: { Authorization: `Bearer ${token}` },
                                body: formData,
                              });

                              if (response.ok) {
                                const imagePath = `/api/files/download?path=${encodeURIComponent(`${backgroundsPath}/${file.name}`)}`;
                                updateDesktopSettings({ backgroundImage: imagePath });
                                // Refresh the gallery
                                fetchUploadedBackgrounds();
                              } else {
                                const err = await response.json().catch(() => ({}));
                                alert(err.error || "Failed to upload image");
                              }
                            } catch {
                              alert("Failed to upload image");
                            } finally {
                              setIsUploadingBg(false);
                            }
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => document.getElementById("bg-upload")?.click()}
                          disabled={isUploadingBg}
                          className="gap-2 border-border/60"
                        >
                          {isUploadingBg ? (
                            <Activity className="w-4 h-4 animate-spin" />
                          ) : (
                            <ImagePlus className="w-4 h-4" />
                          )}
                          {isUploadingBg ? "Uploading..." : "Upload Image"}
                        </Button>
                        {settings.desktop.backgroundImage && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateDesktopSettings({ backgroundImage: "" })}
                            className="gap-2 border-border/60 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                            Clear
                          </Button>
                        )}
                      </div>

                      {/* Gallery of uploaded backgrounds */}
                      {uploadedBackgrounds.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Your Uploaded Backgrounds</Label>
                          <div className="grid grid-cols-4 gap-2">
                            {uploadedBackgrounds.map((imgUrl) => {
                              // Strip token from URL for storage comparison
                              const pathWithoutToken = imgUrl.replace(/&token=[^&]+$/, "");
                              const isSelected = settings.desktop.backgroundImage === pathWithoutToken;
                              return (
                                <button
                                  key={imgUrl}
                                  onClick={() => updateDesktopSettings({ backgroundImage: pathWithoutToken })}
                                  className={`
                                    relative h-16 rounded-lg border-2 overflow-hidden transition-all duration-200
                                    ${isSelected
                                      ? "border-accent ring-2 ring-accent/50"
                                      : "border-border/60 hover:border-accent/50"
                                    }
                                  `}
                                  style={{
                                    backgroundImage: `url(${imgUrl})`,
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                  }}
                                >
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                                      <Check className="w-5 h-5 text-accent" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {settings.desktop.backgroundImage && (
                        <div className="mt-2">
                          <Label className="text-xs text-muted-foreground mb-2 block">Current Background Preview</Label>
                          <div
                            className="h-32 rounded-lg border border-border/60 overflow-hidden"
                            style={{
                              backgroundImage: `url(${settings.desktop.backgroundImage})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview for default */}
                  {settings.desktop.backgroundType === "default" && (
                    <p className="text-sm text-muted-foreground">
                      Using the default Stardeck OS background with grid pattern.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Settings */}
            <TabsContent value="security" className="mt-6 space-y-4">
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-accent" />
                        Active Sessions
                      </CardTitle>
                      <CardDescription>
                        Manage your active login sessions across devices
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchSessions}
                      disabled={isLoadingSessions}
                      className="gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingSessions ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isLoadingSessions ? (
                    <div className="flex items-center justify-center py-8">
                      <Activity className="w-6 h-6 text-accent animate-pulse" />
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Shield className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p>No active sessions found</p>
                    </div>
                  ) : (
                    sessions.map((session) => {
                      const { device, browser } = parseUserAgent(session.user_agent);
                      const isCurrentSession = session.id === currentSessionId;
                      const expiresAt = new Date(session.expires_at);
                      const createdAt = new Date(session.created_at);

                      return (
                        <div
                          key={session.id}
                          className={`
                            p-4 rounded-lg border transition-colors
                            ${isCurrentSession
                              ? "border-accent/50 bg-accent/5"
                              : "border-border/50 bg-background/40 hover:bg-background/60"
                            }
                          `}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <div className={`
                                p-2 rounded-lg
                                ${isCurrentSession ? "bg-accent/20 text-accent" : "bg-muted/50 text-muted-foreground"}
                              `}>
                                {device === "Mobile" ? (
                                  <Smartphone className="w-5 h-5" />
                                ) : (
                                  <Laptop className="w-5 h-5" />
                                )}
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{browser} on {device}</span>
                                  {isCurrentSession && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">
                                      Current
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Globe className="w-3 h-3" />
                                    {session.ip_address || "Unknown IP"}
                                  </span>
                                  <span>•</span>
                                  <span>Created {createdAt.toLocaleDateString()}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Expires: {expiresAt.toLocaleString()}
                                </p>
                              </div>
                            </div>
                            {!isCurrentSession && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => revokeSession(session.id)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-accent" />
                    Session Security
                  </CardTitle>
                  <CardDescription>
                    Information about your session security settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 text-sm">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-background/40 border border-border/30">
                      <span className="text-muted-foreground">Session timeout</span>
                      <span className="font-mono text-accent">24 hours</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-background/40 border border-border/30">
                      <span className="text-muted-foreground">Token rotation</span>
                      <span className="text-green-500">Enabled</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-background/40 border border-border/30">
                      <span className="text-muted-foreground">IP binding</span>
                      <span className="text-yellow-500">Recommended</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sessions automatically expire after 24 hours of inactivity.
                    You can revoke sessions from other devices at any time.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
