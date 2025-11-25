"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Power,
  RotateCw,
  Lock,
  Moon,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";

export function SystemActionsMenu() {
  const { logout, user } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    router.push("/login");
  };

  const handleSystemAction = async (action: "poweroff" | "reboot" | "suspend") => {
    const actionNames = {
      poweroff: "Power Off",
      reboot: "Reboot",
      suspend: "Suspend",
    };

    if (
      !confirm(
        `Are you sure you want to ${actionNames[action].toLowerCase()} the system?`
      )
    ) {
      return;
    }

    setIsOpen(false);
    setIsExecuting(true);

    try {
      const response = await fetch(`/api/system/${action}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("stardeck-token")}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to ${action} system`);
      }

      // Show notification or redirect
      if (action === "poweroff") {
        alert("System is shutting down...");
      } else if (action === "reboot") {
        alert("System is rebooting...");
      }
    } catch (error) {
      console.error(`Failed to ${action}:`, error);
      alert(`Failed to ${actionNames[action].toLowerCase()} the system`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleLockSession = () => {
    setIsOpen(false);
    router.push("/login");
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={`gap-2 border-border/50 hover:border-accent/50 hover:bg-accent/10 transition-all duration-200 ${
          isOpen ? "bg-accent/10 border-accent/50" : ""
        }`}
        disabled={isExecuting}
      >
        <div className="w-7 h-7 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center">
          <span className="text-accent font-bold text-xs">
            {user?.username[0].toUpperCase()}
          </span>
        </div>
        <span className="text-xs font-medium max-w-[100px] truncate">
          {user?.username}
        </span>
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </Button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 top-full mt-2 w-56 bg-card/95 backdrop-blur-md border border-border/50 rounded-lg shadow-2xl shadow-accent/10 z-50 overflow-hidden">
            {/* User Info Header */}
            <div className="px-4 py-3 border-b border-border/50 bg-background/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center">
                  <span className="text-accent font-bold text-lg">
                    {user?.username[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground truncate text-sm">
                    {user?.username}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {user?.role}
                  </div>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-2">
              {/* Lock Session */}
              <button
                onClick={handleLockSession}
                className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent/10 transition-colors text-left group"
              >
                <Lock className="w-4 h-4 text-muted-foreground group-hover:text-accent" />
                <span className="text-sm text-foreground group-hover:text-accent">
                  Lock Session
                </span>
              </button>

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent/10 transition-colors text-left group"
              >
                <LogOut className="w-4 h-4 text-muted-foreground group-hover:text-accent" />
                <span className="text-sm text-foreground group-hover:text-accent">
                  Logout
                </span>
              </button>

              {/* Divider */}
              {user?.role === "admin" && (
                <>
                  <div className="my-2 h-px bg-border/50" />
                  <div className="px-4 py-1">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      System Actions
                    </div>
                  </div>

                  {/* Suspend */}
                  <button
                    onClick={() => handleSystemAction("suspend")}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-chart-2/10 transition-colors text-left group"
                    disabled={isExecuting}
                  >
                    <Moon className="w-4 h-4 text-muted-foreground group-hover:text-chart-2" />
                    <span className="text-sm text-foreground group-hover:text-chart-2">
                      Suspend
                    </span>
                  </button>

                  {/* Reboot */}
                  <button
                    onClick={() => handleSystemAction("reboot")}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-chart-2/10 transition-colors text-left group"
                    disabled={isExecuting}
                  >
                    <RotateCw className="w-4 h-4 text-muted-foreground group-hover:text-chart-2" />
                    <span className="text-sm text-foreground group-hover:text-chart-2">
                      Reboot
                    </span>
                  </button>

                  {/* Power Off */}
                  <button
                    onClick={() => handleSystemAction("poweroff")}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-destructive/10 transition-colors text-left group"
                    disabled={isExecuting}
                  >
                    <Power className="w-4 h-4 text-muted-foreground group-hover:text-destructive" />
                    <span className="text-sm text-foreground group-hover:text-destructive">
                      Power Off
                    </span>
                  </button>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-border/50 bg-background/20">
              <div className="text-xs text-muted-foreground font-mono">
                <span className="text-accent">&gt;</span> Session active
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
