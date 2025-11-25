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
} from "lucide-react";

export default function SettingsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const {
    settings,
    updateSettings,
    updateTraySettings,
    updateThemeSettings,
    updateDesktopSettings,
    resetSettings,
  } = useSettings();

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
            <TabsList className="grid w-full grid-cols-4 bg-card/70 border border-border/50">
              <TabsTrigger value="taskbar" className="gap-2 data-[state=active]:bg-accent/20">
                <Monitor className="w-4 h-4" />
                <span className="hidden sm:inline">Taskbar</span>
              </TabsTrigger>
              <TabsTrigger value="tray" className="gap-2 data-[state=active]:bg-accent/20">
                <Activity className="w-4 h-4" />
                <span className="hidden sm:inline">System Tray</span>
              </TabsTrigger>
              <TabsTrigger value="theme" className="gap-2 data-[state=active]:bg-accent/20">
                <Palette className="w-4 h-4" />
                <span className="hidden sm:inline">Theme</span>
              </TabsTrigger>
              <TabsTrigger value="desktop" className="gap-2 data-[state=active]:bg-accent/20">
                <Layout className="w-4 h-4" />
                <span className="hidden sm:inline">Desktop</span>
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
                  <p className="text-xs text-muted-foreground/60 mt-3">
                    Theme color customization will be available in a future update
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
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
