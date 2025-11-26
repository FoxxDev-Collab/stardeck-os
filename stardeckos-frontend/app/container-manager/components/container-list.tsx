"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Play,
  Square,
  RotateCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  FileText,
  Activity,
  Globe,
  Terminal,
  Settings,
  Copy,
  ExternalLink,
  Pause,
  MoreVertical,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Container,
  ContainerStatus,
  formatBytes,
  getStatusColor,
  getStatusBgColor,
} from "../types";

interface ContainerListProps {
  containers: Container[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onAction: (containerId: string, action: "start" | "stop" | "restart" | "pause" | "remove") => void;
  onViewLogs: (container: Container) => void;
  onViewStats: (container: Container) => void;
  onViewDetails: (container: Container) => void;
  onOpenTerminal: (container: Container) => void;
  onOpenWebUI: (container: Container) => void;
  actionInProgress: string | null;
  isAdmin: boolean;
}

export function ContainerList({
  containers,
  selectedIds,
  onSelectionChange,
  onAction,
  onViewLogs,
  onViewStats,
  onViewDetails,
  onOpenTerminal,
  onOpenWebUI,
  actionInProgress,
  isAdmin,
}: ContainerListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelect = (id: string) => {
    onSelectionChange(
      new Set(
        selectedIds.has(id)
          ? [...selectedIds].filter((i) => i !== id)
          : [...selectedIds, id]
      )
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === containers.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(containers.map((c) => c.container_id)));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getStatusIcon = (status: ContainerStatus) => {
    const baseClass = "w-2 h-2 rounded-full animate-pulse";
    switch (status) {
      case "running":
        return <div className={`${baseClass} bg-emerald-500`} />;
      case "paused":
        return <div className={`${baseClass} bg-yellow-500 animate-none`} />;
      case "restarting":
        return <div className={`${baseClass} bg-blue-500`} />;
      case "exited":
      case "dead":
        return <div className={`${baseClass} bg-red-500 animate-none`} />;
      default:
        return <div className={`${baseClass} bg-gray-500 animate-none`} />;
    }
  };

  if (containers.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <div className="text-4xl mb-4">📦</div>
        <p className="text-lg font-medium">No containers found</p>
        <p className="text-sm mt-2">Create a container to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
        <div className="w-8">
          <Checkbox
            checked={selectedIds.size === containers.length && containers.length > 0}
            onCheckedChange={toggleSelectAll}
          />
        </div>
        <div className="w-8" /> {/* Expand toggle */}
        <div className="flex-1 min-w-[200px]">Container</div>
        <div className="w-32">Status</div>
        <div className="w-48">Image</div>
        <div className="w-32">Ports</div>
        <div className="w-40">Actions</div>
      </div>

      {/* Container rows */}
      {containers.map((container) => {
        const isExpanded = expandedIds.has(container.container_id);
        const isSelected = selectedIds.has(container.container_id);
        const isLoading = actionInProgress === container.container_id;
        const isRunning = container.status === "running";
        const isPaused = container.status === "paused";

        return (
          <div
            key={container.container_id}
            className={`border rounded-lg transition-all duration-200 ${
              isSelected
                ? "border-accent/50 bg-accent/5"
                : "border-border/50 bg-card/50 hover:bg-card/80"
            }`}
          >
            {/* Main row */}
            <div className="flex items-center gap-4 px-4 py-3">
              {/* Checkbox */}
              <div className="w-8">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleSelect(container.container_id)}
                />
              </div>

              {/* Expand toggle */}
              <button
                onClick={() => toggleExpand(container.container_id)}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-accent/10 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>

              {/* Container name and ID */}
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2">
                  {getStatusIcon(container.status)}
                  <span className="font-semibold text-foreground">
                    {container.name}
                  </span>
                  {container.has_web_ui && (
                    <span title="Has Web UI">
                      <Globe className="w-3 h-3 text-accent" />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs text-muted-foreground font-mono">
                    {container.container_id.substring(0, 12)}
                  </code>
                  <button
                    onClick={() => copyToClipboard(container.container_id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-accent transition-opacity"
                    title="Copy ID"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Status */}
              <div className="w-32">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBgColor(
                    container.status
                  )} ${getStatusColor(container.status)}`}
                >
                  {container.status}
                </span>
                {container.uptime && isRunning && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {container.uptime}
                  </div>
                )}
              </div>

              {/* Image */}
              <div className="w-48">
                <div className="text-sm truncate" title={container.image}>
                  {container.image}
                </div>
              </div>

              {/* Ports */}
              <div className="w-32">
                {container.ports && container.ports.length > 0 ? (
                  <div className="space-y-0.5">
                    {container.ports.slice(0, 2).map((port, i) => (
                      <div key={i} className="text-xs font-mono text-muted-foreground">
                        {port.host_port}→{port.container_port}
                      </div>
                    ))}
                    {container.ports.length > 2 && (
                      <div className="text-xs text-muted-foreground">
                        +{container.ports.length - 2} more
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </div>

              {/* Actions */}
              <div className="w-40 flex items-center gap-1">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-accent" />
                ) : (
                  <>
                    {isRunning ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onAction(container.container_id, "stop")}
                          className="h-8 w-8 p-0"
                          title="Stop"
                        >
                          <Square className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onAction(container.container_id, "restart")}
                          className="h-8 w-8 p-0"
                          title="Restart"
                        >
                          <RotateCw className="w-4 h-4" />
                        </Button>
                      </>
                    ) : isPaused ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAction(container.container_id, "start")}
                        className="h-8 w-8 p-0"
                        title="Unpause"
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAction(container.container_id, "start")}
                        className="h-8 w-8 p-0"
                        title="Start"
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                    )}

                    {/* More actions dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => onViewLogs(container)}>
                          <FileText className="w-4 h-4 mr-2" />
                          View Logs
                        </DropdownMenuItem>
                        {isRunning && (
                          <>
                            <DropdownMenuItem onClick={() => onViewStats(container)}>
                              <Activity className="w-4 h-4 mr-2" />
                              View Stats
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onOpenTerminal(container)}>
                              <Terminal className="w-4 h-4 mr-2" />
                              Open Shell
                            </DropdownMenuItem>
                            {container.has_web_ui && (
                              <DropdownMenuItem onClick={() => onOpenWebUI(container)}>
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Open Web UI
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => onAction(container.container_id, "pause")}
                            >
                              <Pause className="w-4 h-4 mr-2" />
                              Pause
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem onClick={() => onViewDetails(container)}>
                          <Settings className="w-4 h-4 mr-2" />
                          Inspect
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => copyToClipboard(container.container_id)}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy ID
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => onAction(container.container_id, "remove")}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div className="px-4 pb-4 pt-2 border-t border-border/30 bg-background/30">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Image
                    </div>
                    <div className="font-mono text-xs break-all">{container.image}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Container ID
                    </div>
                    <div className="font-mono text-xs break-all">
                      {container.container_id}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Created
                    </div>
                    <div className="text-xs">
                      {container.created_at
                        ? new Date(container.created_at).toLocaleString()
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Ports
                    </div>
                    <div className="space-y-0.5">
                      {container.ports && container.ports.length > 0 ? (
                        container.ports.map((port, i) => (
                          <div key={i} className="font-mono text-xs">
                            {port.host_ip || "0.0.0.0"}:{port.host_port} →{" "}
                            {port.container_port}/{port.protocol}
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick action buttons */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-border/30">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewLogs(container)}
                    className="gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Logs
                  </Button>
                  {isRunning && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewStats(container)}
                        className="gap-2"
                      >
                        <Activity className="w-4 h-4" />
                        Stats
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenTerminal(container)}
                        className="gap-2"
                      >
                        <Terminal className="w-4 h-4" />
                        Shell
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewDetails(container)}
                    className="gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Inspect
                  </Button>
                  {container.has_web_ui && isRunning && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenWebUI(container)}
                      className="gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Web UI
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
