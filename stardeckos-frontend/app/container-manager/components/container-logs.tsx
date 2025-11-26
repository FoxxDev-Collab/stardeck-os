"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  X,
  Download,
  Search,
  RotateCw,
  Pause,
  Play,
  Maximize2,
  Minimize2,
  Copy,
  Check,
} from "lucide-react";

interface ContainerLogsProps {
  containerId: string | null;
  containerName?: string;
  onClose: () => void;
}

export function ContainerLogs({ containerId, containerName, onClose }: ContainerLogsProps) {
  const { token } = useAuth();
  const [logs, setLogs] = useState<string[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [following, setFollowing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [tailLines, setTailLines] = useState("100");
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!token || !containerId) return;

    try {
      const params = new URLSearchParams({
        tail: tailLines,
        timestamps: showTimestamps.toString(),
      });
      
      const response = await fetch(
        `/api/containers/${containerId}/logs?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!response.ok) throw new Error("Failed to fetch logs");
      
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    }
  }, [token, containerId, tailLines, showTimestamps]);

  const startFollowing = useCallback(() => {
    if (!containerId || !token) return;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/containers/${containerId}/logs/stream`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token }));
      setFollowing(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "log") {
          setLogs((prev) => [...prev, data.line]);
        }
      } catch {
        setLogs((prev) => [...prev, event.data]);
      }
    };

    ws.onerror = () => {
      setFollowing(false);
    };

    ws.onclose = () => {
      setFollowing(false);
    };
  }, [containerId, token]);

  const stopFollowing = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setFollowing(false);
  }, []);

  useEffect(() => {
    if (containerId) {
      fetchLogs();
    }
    return () => {
      stopFollowing();
    };
  }, [containerId, fetchLogs, stopFollowing]);

  // Filter logs based on search term
  useEffect(() => {
    if (searchTerm.trim()) {
      const filtered = logs.filter((log) =>
        log.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredLogs(filtered);
    } else {
      setFilteredLogs(logs);
    }
  }, [logs, searchTerm]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  const handleDownload = () => {
    const blob = new Blob([logs.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${containerName || containerId}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyAll = () => {
    navigator.clipboard.writeText(filteredLogs.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = () => {
    stopFollowing();
    fetchLogs();
  };

  const toggleFollow = () => {
    if (following) {
      stopFollowing();
    } else {
      startFollowing();
    }
  };

  return (
    <Dialog open={!!containerId} onOpenChange={onClose}>
      <DialogContent 
        className={`${fullscreen ? "max-w-full h-screen" : "max-w-5xl h-[700px]"} p-0 gap-0 flex flex-col`}
      >
        <DialogHeader className="px-4 py-3 border-b border-border/50 flex-row items-center justify-between space-y-0">
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-center gap-2">
              <span>Container Logs</span>
              {containerName && (
                <span className="text-sm text-muted-foreground font-normal">
                  {containerName}
                </span>
              )}
              <Badge variant="outline" className="font-mono">
                {filteredLogs.length} lines
              </Badge>
            </div>
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFullscreen(!fullscreen)}
              className="h-8 w-8"
            >
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Controls */}
        <div className="px-4 py-3 border-b border-border/50 bg-muted/30 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={tailLines} onValueChange={setTailLines}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">Last 50 lines</SelectItem>
                <SelectItem value="100">Last 100 lines</SelectItem>
                <SelectItem value="500">Last 500 lines</SelectItem>
                <SelectItem value="1000">Last 1000 lines</SelectItem>
                <SelectItem value="all">All lines</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={toggleFollow}
              className={following ? "bg-green-500/20 border-green-500/30 text-green-500" : ""}
            >
              {following ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              {following ? "Following" : "Follow"}
            </Button>

            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RotateCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>

            <Button variant="outline" size="sm" onClick={handleCopyAll}>
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? "Copied!" : "Copy"}
            </Button>

            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="auto-scroll"
                checked={autoScroll}
                onCheckedChange={setAutoScroll}
              />
              <Label htmlFor="auto-scroll" className="text-sm cursor-pointer">
                Auto-scroll
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="timestamps"
                checked={showTimestamps}
                onCheckedChange={(checked) => {
                  setShowTimestamps(checked);
                  handleRefresh();
                }}
              />
              <Label htmlFor="timestamps" className="text-sm cursor-pointer">
                Show timestamps
              </Label>
            </div>
          </div>
        </div>

        {/* Logs Display */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 bg-black/90 font-mono text-xs text-gray-300 space-y-1 min-h-0"
        >
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchTerm ? "No logs match your search" : "No logs available"}
            </div>
          ) : (
            filteredLogs.map((log, index) => {
              // Detect log level for coloring
              const isError = /error|failed|fatal/i.test(log);
              const isWarning = /warn|warning/i.test(log);
              const isInfo = /info/i.test(log);
              const isDebug = /debug/i.test(log);

              let colorClass = "text-gray-300";
              if (isError) colorClass = "text-red-400";
              else if (isWarning) colorClass = "text-yellow-400";
              else if (isInfo) colorClass = "text-blue-400";
              else if (isDebug) colorClass = "text-purple-400";

              // Highlight search term
              const parts = searchTerm
                ? log.split(new RegExp(`(${searchTerm})`, "gi"))
                : [log];

              return (
                <div key={index} className={`${colorClass} whitespace-pre-wrap break-all hover:bg-white/5 px-2 py-0.5 rounded transition-colors`}>
                  <span className="text-muted-foreground select-none mr-2">{index + 1}</span>
                  {searchTerm ? (
                    parts.map((part, i) =>
                      part.toLowerCase() === searchTerm.toLowerCase() ? (
                        <span key={i} className="bg-yellow-500/30 text-yellow-300">
                          {part}
                        </span>
                      ) : (
                        <span key={i}>{part}</span>
                      )
                    )
                  ) : (
                    log
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-border/50 bg-muted/30 text-xs text-muted-foreground">
          <span>Tip: Use the Follow button to stream logs in real-time.</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
