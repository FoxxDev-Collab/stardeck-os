"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Terminal, X, Maximize2, Minimize2, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ContainerTerminalProps {
  containerId: string | null;
  containerName?: string;
  onClose: () => void;
}

export function ContainerTerminal({ containerId, containerName, onClose }: ContainerTerminalProps) {
  const { token } = useAuth();
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [output, setOutput] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerId || !token) return;

    // Connect to WebSocket for terminal
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/containers/${containerId}/exec`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      // Send auth token
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "output") {
          setOutput((prev) => [...prev, data.data]);
        } else if (data.type === "error") {
          setError(data.message);
        }
      } catch {
        // Plain text output
        setOutput((prev) => [...prev, event.data]);
      }
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [containerId, token]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({ type: "input", data: input + "\n" }));
    setOutput((prev) => [...prev, `$ ${input}`]);
    setInput("");
  };

  const handleClear = () => {
    setOutput([]);
  };

  const handleReconnect = () => {
    setError(null);
    setOutput([]);
    if (wsRef.current) {
      wsRef.current.close();
    }
    // Component will reconnect via useEffect
  };

  return (
    <Dialog open={!!containerId} onOpenChange={onClose}>
      <DialogContent 
        className={`${fullscreen ? "max-w-full h-screen" : "max-w-4xl h-[600px]"} p-0 gap-0 flex flex-col`}
      >
        <DialogHeader className="px-4 py-3 border-b border-border/50 flex-row items-center justify-between space-y-0">
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-green-400" />
            </div>
            <div className="flex items-center gap-2">
              <span>Container Shell</span>
              {containerName && (
                <span className="text-sm text-muted-foreground font-normal">
                  {containerName}
                </span>
              )}
              {connected ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
                  Disconnected
                </Badge>
              )}
            </div>
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              className="h-8 w-8"
            >
              <RotateCw className="w-4 h-4" />
            </Button>
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

        <div className="flex-1 flex flex-col bg-black/90 min-h-0">
          {/* Terminal Output */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 font-mono text-sm text-green-400 space-y-1"
          >
            {error && (
              <div className="text-red-500 mb-4 p-2 bg-red-500/10 rounded border border-red-500/30">
                <div className="flex items-center justify-between">
                  <span>{error}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReconnect}
                    className="h-6 text-xs"
                  >
                    Reconnect
                  </Button>
                </div>
              </div>
            )}
            
            {output.length === 0 && !error && (
              <div className="text-muted-foreground">
                {connected ? "Connected. Type a command..." : "Connecting..."}
              </div>
            )}
            
            {output.map((line, index) => (
              <div key={index} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))}
          </div>

          {/* Command Input */}
          <form onSubmit={handleSendCommand} className="border-t border-border/30 p-3 flex items-center gap-2">
            <span className="text-green-400 font-mono">$</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter command..."
              disabled={!connected}
              className="flex-1 bg-transparent border-none outline-none text-green-400 font-mono placeholder:text-green-400/30 disabled:opacity-50"
              autoFocus
            />
            <Button
              type="submit"
              size="sm"
              disabled={!connected || !input.trim()}
              className="bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30"
            >
              Send
            </Button>
          </form>
        </div>

        <div className="px-4 py-2 border-t border-border/50 bg-muted/30 text-xs text-muted-foreground">
          <span>Tip: This terminal connects to the container&apos;s shell. Type &apos;exit&apos; to disconnect.</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
