"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Terminal, RotateCw, Trash2 } from "lucide-react";

interface TerminalTabProps {
  containerId: string;
  containerName?: string;
}

export function TerminalTab({ containerId, containerName }: TerminalTabProps) {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const connect = () => {
    if (!containerId || !token || wsRef.current) return;

    setConnecting(true);
    setError(null);

    // Connect to WebSocket for terminal
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/containers/${containerId}/exec`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnecting(false);
      setConnected(true);
      setError(null);
      // Send auth token
      ws.send(JSON.stringify({ type: "auth", token }));
      // Focus input
      inputRef.current?.focus();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "output") {
          setOutput((prev) => [...prev, data.data]);
        } else if (data.type === "error") {
          setError(data.message);
        } else if (data.type === "auth" && data.success) {
          // Auth acknowledged
          setOutput((prev) => [...prev, "Shell session started. Type commands below.\n"]);
        }
      } catch {
        // Plain text output
        setOutput((prev) => [...prev, event.data]);
      }
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
      setConnecting(false);
      setConnected(false);
    };

    ws.onclose = () => {
      setConnecting(false);
      setConnected(false);
      wsRef.current = null;
    };
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  };

  useEffect(() => {
    // Auto-connect on mount
    connect();

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setOutput((prev) => [...prev, `$ ${input}\n`]);
    setInput("");
  };

  const handleClear = () => {
    setOutput([]);
  };

  const handleReconnect = () => {
    disconnect();
    setOutput([]);
    setTimeout(connect, 100);
  };

  return (
    <div className="h-full flex flex-col bg-black/90 rounded-lg overflow-hidden border border-border/30">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-green-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">Container Shell</span>
            {containerName && (
              <span className="text-sm text-muted-foreground">
                {containerName}
              </span>
            )}
          </div>
          {connecting ? (
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
              Connecting...
            </Badge>
          ) : connected ? (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
              Disconnected
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-8"
            title="Clear output"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReconnect}
            className="h-8"
            title="Reconnect"
          >
            <RotateCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Terminal Output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm text-green-400 space-y-0 min-h-0"
        onClick={() => inputRef.current?.focus()}
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
            {connecting ? "Connecting to container..." : connected ? "Connected. Type a command..." : "Click Reconnect to start a shell session."}
          </div>
        )}

        {output.map((line, index) => (
          <div key={index} className="whitespace-pre-wrap break-all leading-relaxed">
            {line}
          </div>
        ))}
      </div>

      {/* Command Input */}
      <form onSubmit={handleSendCommand} className="border-t border-border/30 p-3 flex items-center gap-2 bg-black/50">
        <span className="text-green-400 font-mono">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={connected ? "Enter command..." : "Not connected"}
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
  );
}
