"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  Activity,
  ListChecks,
  Settings,
  Package,
  HardDrive,
  Users,
  Cog,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  X,
  Shield,
  UserCog,
  Globe,
  Server,
  Terminal,
  FileText,
  Network,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  systemUserOnly?: boolean;  // Requires PAM auth (system user)
}

interface NavSection {
  name: string;
  icon: React.ElementType;
  items: NavItem[];
  adminOnly?: boolean;
  systemUserOnly?: boolean;  // Requires PAM auth (system user)
}

const navItems: NavItem[] = [
  { name: "Desktop", href: "/dashboard", icon: LayoutDashboard },
  { name: "Settings", href: "/settings", icon: Cog },
];

const navSections: NavSection[] = [
  {
    name: "Server Management",
    icon: Server,
    systemUserOnly: true,  // Only system users (PAM auth) can access server management
    items: [
      { name: "System Monitor", href: "/system-monitor", icon: Activity },
      { name: "Process Manager", href: "/process-manager", icon: ListChecks },
      { name: "Service Manager", href: "/service-manager", icon: Settings },
      { name: "Network Manager", href: "/network-manager", icon: Network },
      { name: "RPM Manager", href: "/rpm-manager", icon: Package },
      { name: "Storage Viewer", href: "/storage-viewer", icon: HardDrive },
      { name: "File Browser", href: "/file-browser", icon: FolderOpen },
      { name: "Terminal", href: "/terminal", icon: Terminal },
    ],
  },
  {
    name: "Administration",
    icon: Shield,
    adminOnly: true,
    systemUserOnly: true,  // Only system users (PAM auth) can access
    items: [
      { name: "User Manager", href: "/user-manager", icon: Users },
      { name: "Group Manager", href: "/group-manager", icon: UserCog },
      { name: "Realm Manager", href: "/realm-manager", icon: Globe },
      { name: "Audit Log", href: "/audit-log", icon: FileText },
    ],
  },
];

interface StartMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StartMenu({ isOpen, onClose }: StartMenuProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["Server Management", "Administration"])
  );

  // Check if user is a system user (PAM auth)
  const isSystemUser = user?.auth_type === "pam";
  const isAdmin = user?.role === "admin";

  const filteredNavItems = navItems.filter((item) => {
    if (item.systemUserOnly && !isSystemUser) return false;
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });

  const filteredNavSections = navSections.filter((section) => {
    if (section.systemUserOnly && !isSystemUser) return false;
    if (section.adminOnly && !isAdmin) return false;
    return true;
  });

  const toggleSection = (sectionName: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionName)) {
        newSet.delete(sectionName);
      } else {
        newSet.add(sectionName);
      }
      return newSet;
    });
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full w-80 bg-card/95 backdrop-blur-md border-r border-border/50 shadow-2xl z-50 transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="h-14 border-b border-border/50 flex items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="relative w-6 h-6">
              <div className="absolute inset-0 border-2 border-accent rounded rotate-45 flex items-center justify-center shadow-[0_0_10px_rgba(112,187,179,0.5)]">
                <span className="text-[10px] font-bold text-accent -rotate-45 tracking-tighter">
                  SD
                </span>
              </div>
              <div className="absolute inset-0 border-2 border-accent/30 rounded rotate-45 blur-sm" />
            </div>
            <span className="text-sm font-bold tracking-widest text-foreground">
              STARDECK
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 hover:bg-accent/10"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* User info */}
        <div className="px-6 py-4 border-b border-border/50 bg-background/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center">
              <span className="text-accent font-bold text-lg">
                {user?.username[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-foreground truncate">
                {user?.username}
              </div>
              <div className="text-xs text-muted-foreground capitalize">
                {user?.role}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="p-4 space-y-1 overflow-y-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
          {/* Navigation sections (collapsible) */}
          {filteredNavSections.map((section) => {
            const SectionIcon = section.icon;
            const isExpanded = expandedSections.has(section.name);
            const hasActiveItem = section.items.some((item) => pathname === item.href);

            return (
              <div key={section.name} className="space-y-1">
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section.name)}
                  className={`w-full group flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    hasActiveItem
                      ? "bg-accent/10 border border-accent/30"
                      : "hover:bg-accent/10 border border-transparent hover:border-accent/20"
                  }`}
                >
                  <SectionIcon
                    className={`w-5 h-5 transition-colors ${
                      hasActiveItem ? "text-accent" : "text-muted-foreground group-hover:text-accent"
                    }`}
                  />
                  <span
                    className={`flex-1 text-left font-medium transition-colors ${
                      hasActiveItem ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {section.name}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      isExpanded ? "rotate-0" : "-rotate-90"
                    } ${hasActiveItem ? "text-accent" : "text-muted-foreground"}`}
                  />
                </button>

                {/* Section items */}
                {isExpanded && (
                  <div className="ml-6 space-y-1 border-l border-border/30 pl-2">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = pathname === item.href;

                      return (
                        <Link key={item.href} href={item.href} onClick={onClose}>
                          <div
                            className={`group flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-200 ${
                              isActive
                                ? "bg-accent/20 border border-accent/40 shadow-[0_0_15px_rgba(112,187,179,0.2)]"
                                : "hover:bg-accent/10 border border-transparent hover:border-accent/20"
                            }`}
                          >
                            <Icon
                              className={`w-4 h-4 transition-colors ${
                                isActive ? "text-accent" : "text-muted-foreground group-hover:text-accent"
                              }`}
                            />
                            <span
                              className={`flex-1 text-sm font-medium transition-colors ${
                                isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                              }`}
                            >
                              {item.name}
                            </span>
                            {isActive && (
                              <ChevronRight className="w-3 h-3 text-accent" />
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Standalone navigation items */}
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link key={item.href} href={item.href} onClick={onClose}>
                <div
                  className={`group flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? "bg-accent/20 border border-accent/40 shadow-[0_0_15px_rgba(112,187,179,0.2)]"
                      : "hover:bg-accent/10 border border-transparent hover:border-accent/20"
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 transition-colors ${
                      isActive ? "text-accent" : "text-muted-foreground group-hover:text-accent"
                    }`}
                  />
                  <span
                    className={`flex-1 font-medium transition-colors ${
                      isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {item.name}
                  </span>
                  {isActive && (
                    <ChevronRight className="w-4 h-4 text-accent" />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer - App Info */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border/50 bg-background/40">
          <div className="text-center">
            <p className="text-xs text-muted-foreground/60 tracking-wider">
              STARDECK OS v1.0.0
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              <span className="text-accent">&gt;</span> PHASE 1
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
