"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Terminal as TerminalIcon, Maximize2, Minimize2 } from "lucide-react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";

export default function TerminalPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTerminalReady, setIsTerminalReady] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!terminalRef.current || !user) return;

    let term: Terminal | null = null;
    let ws: WebSocket | null = null;
    let fitAddon: FitAddon | null = null;

    const initTerminal = async () => {
      // Dynamically import xterm and addons (browser-only)
      const [
        { Terminal },
        { FitAddon },
        { WebLinksAddon },
      ] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
      ]);

      // Initialize xterm.js
      term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: "#1e1e1e",
          foreground: "#d4d4d4",
          cursor: "#d4d4d4",
          black: "#000000",
          red: "#cd3131",
          green: "#0dbc79",
          yellow: "#e5e510",
          blue: "#2472c8",
          magenta: "#bc3fbc",
          cyan: "#11a8cd",
          white: "#e5e5e5",
          brightBlack: "#666666",
          brightRed: "#f14c4c",
          brightGreen: "#23d18b",
          brightYellow: "#f5f543",
          brightBlue: "#3b8eea",
          brightMagenta: "#d670d6",
          brightCyan: "#29b8db",
          brightWhite: "#ffffff",
        },
        allowProposedApi: true,
      });

      // Add addons
      fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);

      fitAddonRef.current = fitAddon;
      xtermRef.current = term;

      // Open terminal
      if (terminalRef.current) {
        term.open(terminalRef.current);
      }

      setIsTerminalReady(true);

      // Small delay to ensure terminal is fully rendered before fitting
      setTimeout(() => {
        try {
          fitAddon?.fit();
        } catch (err) {
          console.error("Error fitting terminal:", err);
        }
      }, 10);

      // Get auth token from localStorage
      const token = localStorage.getItem("stardeck-token");
      if (!token) {
        term.writeln("\r\n\x1b[1;31mNo authentication token found\x1b[0m\r\n");
        return;
      }

      // Connect to WebSocket with auth token
      // In development, Next.js runs on :3000 but backend is on :8080 (HTTP)
      // In production, everything is served from the same port (HTTPS)
      const isDevMode = window.location.port === "3000";
      const wsProtocol = isDevMode ? "ws:" : (window.location.protocol === "https:" ? "wss:" : "ws:");
      const wsHost = isDevMode ? `${window.location.hostname}:8080` : window.location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/api/terminal/ws?token=${encodeURIComponent(token)}`;

      console.log("Connecting to WebSocket:", wsUrl.replace(token, "***"));
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);

        // Send initial size
        if (term) {
          ws?.send(JSON.stringify({
            type: "resize",
            rows: term.rows,
            cols: term.cols,
          }));
        }
      };

      ws.onmessage = (event) => {
        term?.write(event.data);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        term?.writeln("\r\n\x1b[1;31mWebSocket connection error\x1b[0m\r\n");
        setIsConnected(false);
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        term?.writeln("\r\n\x1b[1;33mConnection closed\x1b[0m\r\n");
        setIsConnected(false);
      };

      // Send terminal input to WebSocket
      term.onData((data) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "input",
            data: data,
          }));
        }
      });

      // Handle terminal resize
      term.onResize(({ rows, cols }) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "resize",
            rows: rows,
            cols: cols,
          }));
        }
      });
    };

    initTerminal();

    // Handle window resize
    const handleResize = () => {
      try {
        fitAddonRef.current?.fit();
      } catch (err) {
        console.error("Error fitting terminal on resize:", err);
      }
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      ws?.close();
      term?.dispose();
    };
  }, [user]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    // Wait for CSS transition, then fit terminal
    setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
      } catch (err) {
        console.error("Error fitting terminal in fullscreen:", err);
      }
    }, 100);
  };

  const reconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    // Trigger re-render by forcing a state update
    window.location.reload();
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <p>Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className={`flex flex-col ${isFullscreen ? "h-screen" : "h-full"} p-4 gap-4`}>
        <Card className={isFullscreen ? "flex-1 flex flex-col" : ""}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TerminalIcon className="w-5 h-5" />
                Terminal
              </CardTitle>
              <CardDescription>
                Interactive shell terminal
                {isConnected && (
                  <span className="ml-2 text-green-600">● Connected</span>
                )}
                {!isConnected && (
                  <span className="ml-2 text-red-600">● Disconnected</span>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {!isConnected && isTerminalReady && (
                <Button onClick={reconnect} variant="outline" size="sm">
                  Reconnect
                </Button>
              )}
              <Button
                onClick={toggleFullscreen}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-4 h-4" />
                    Exit Fullscreen
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-4 h-4" />
                    Fullscreen
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className={isFullscreen ? "flex-1 p-0" : "p-0"}>
            <div
              ref={terminalRef}
              className={`w-full ${
                isFullscreen ? "h-full" : "h-[600px]"
              } bg-[#1e1e1e] rounded-b-lg overflow-hidden`}
              style={{ padding: "8px" }}
            />
          </CardContent>
        </Card>

        {!isFullscreen && (
          <Card>
            <CardHeader>
              <CardTitle>Terminal Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• This is a fully interactive shell terminal running on the server</p>
              <p>• Supports colors, cursor movement, and all standard terminal features</p>
              <p>• Use Ctrl+C to interrupt running processes</p>
              <p>• Your default shell environment is loaded automatically</p>
              <p>• Terminal sessions are isolated per connection</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
