"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { StartMenu } from "@/components/start-menu";
import { SystemActionsMenu } from "@/components/system-actions-menu";
import { SystemTray } from "@/components/system-tray";
import { useSettings } from "@/lib/settings-context";
import { Menu, Home, Settings } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  time?: string;
  actions?: React.ReactNode;
  onCustomizeClick?: () => void;
  showCustomize?: boolean;
}

export function DashboardLayout({ children, title, time, actions, onCustomizeClick, showCustomize }: DashboardLayoutProps) {
  const [isStartMenuOpen, setIsStartMenuOpen] = useState(false);
  const { settings } = useSettings();

  const isBottom = settings.taskbarPosition === "bottom";

  // Compute background style based on settings
  const getBackgroundStyle = (): React.CSSProperties => {
    switch (settings.desktop.backgroundType) {
      case "color":
        return { backgroundColor: settings.desktop.backgroundColor };
      case "gradient":
        return { background: settings.desktop.backgroundGradient };
      case "image":
        return settings.desktop.backgroundImage
          ? {
              backgroundImage: `url(${settings.desktop.backgroundImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }
          : {};
      default:
        return {};
    }
  };

  const taskbar = (
    <header
      className={`
        relative z-30 h-14 bg-card/60 backdrop-blur-md flex items-center justify-between px-6 shadow-lg
        ${isBottom
          ? "border-t border-border/50"
          : "border-b border-border/50"
        }
      `}
    >
      <div className="flex items-center gap-4">
        {/* Start button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsStartMenuOpen(!isStartMenuOpen)}
          className={`gap-2 border-accent/50 hover:bg-accent/10 hover:border-accent transition-all duration-200 ${
            isStartMenuOpen ? "bg-accent/20 border-accent" : ""
          }`}
        >
          <Menu className="w-4 h-4" />
          <span className="text-xs tracking-wider font-semibold">START</span>
        </Button>

        {/* Home/Desktop button */}
        <Link href="/dashboard">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-accent/50 hover:bg-accent/10 hover:border-accent transition-all duration-200"
          >
            <Home className="w-4 h-4" />
          </Button>
        </Link>

        {title && (
          <>
            <div className="h-6 w-px bg-border/50" />
            <span className="text-sm text-muted-foreground">
              <span className="text-accent">&gt;</span> {title}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {actions}
        {showCustomize && onCustomizeClick && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onCustomizeClick}
              className="gap-2 border-accent/50 hover:bg-accent/10 hover:border-accent transition-all duration-200"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <div className="h-6 w-px bg-border/50" />
          </>
        )}
        <SystemTray />
        {time && (
          <>
            <div className="h-4 w-px bg-border/50" />
            <span className="text-xs font-mono text-accent px-2">{time}</span>
          </>
        )}
        <div className="h-6 w-px bg-border/50" />
        <ThemeToggle />
        <SystemActionsMenu />
      </div>
    </header>
  );

  const backgroundStyle = getBackgroundStyle();
  const hasCustomBackground = settings.desktop.backgroundType !== "default";

  return (
    <div
      className={`min-h-screen relative overflow-hidden flex flex-col ${isBottom ? "flex-col-reverse" : ""} ${!hasCustomBackground ? "bg-background" : ""}`}
      style={hasCustomBackground ? backgroundStyle : undefined}
    >
      {/* Background grid - only show on default background */}
      {!hasCustomBackground && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--border) / 0.1) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      )}

      {/* Glow effects */}
      <div
        className="absolute top-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[128px] animate-pulse pointer-events-none"
        style={{ animationDuration: "6s" }}
      />

      {/* Start Menu */}
      <StartMenu isOpen={isStartMenuOpen} onClose={() => setIsStartMenuOpen(false)} />

      {/* Taskbar */}
      {taskbar}

      {/* Main content */}
      <main className="relative z-10 flex-1">{children}</main>
    </div>
  );
}
