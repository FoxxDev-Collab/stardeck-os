"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Network, Plus, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PortMapping {
  hostPort: string;
  containerPort: string;
  protocol: "tcp" | "udp";
}

interface UsedPort {
  port: number;
  protocol: string;
  container_id: string;
  container_name: string;
}

interface PortSelectorProps {
  ports: PortMapping[];
  onPortsChange: (ports: PortMapping[]) => void;
}

const COMMON_PORTS = [
  { port: "80", name: "HTTP", protocol: "tcp" },
  { port: "443", name: "HTTPS", protocol: "tcp" },
  { port: "3000", name: "Dev Server", protocol: "tcp" },
  { port: "8080", name: "Alt HTTP", protocol: "tcp" },
  { port: "5432", name: "PostgreSQL", protocol: "tcp" },
  { port: "3306", name: "MySQL", protocol: "tcp" },
  { port: "6379", name: "Redis", protocol: "tcp" },
  { port: "27017", name: "MongoDB", protocol: "tcp" },
  { port: "9000", name: "SonarQube", protocol: "tcp" },
  { port: "8443", name: "Alt HTTPS", protocol: "tcp" },
];

export function PortSelector({ ports, onPortsChange }: PortSelectorProps) {
  const { token } = useAuth();
  const [usedPorts, setUsedPorts] = useState<UsedPort[]>([]);
  const [newHostPort, setNewHostPort] = useState("");
  const [newContainerPort, setNewContainerPort] = useState("");
  const [newProtocol, setNewProtocol] = useState<"tcp" | "udp">("tcp");

  // Fetch used ports
  useEffect(() => {
    const fetchUsedPorts = async () => {
      if (!token) return;
      try {
        const response = await fetch("/api/ports/used", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setUsedPorts(data || []);
        }
      } catch (err) {
        console.error("Failed to fetch used ports:", err);
      }
    };

    fetchUsedPorts();
  }, [token]);

  const isPortInUse = (port: string, protocol: string = "tcp") => {
    return usedPorts.some(
      (p) => p.port === parseInt(port) && p.protocol === protocol
    );
  };

  const getPortUsage = (port: string, protocol: string = "tcp") => {
    return usedPorts.find(
      (p) => p.port === parseInt(port) && p.protocol === protocol
    );
  };

  const addPort = () => {
    if (newHostPort && newContainerPort) {
      onPortsChange([
        ...ports,
        {
          hostPort: newHostPort,
          containerPort: newContainerPort,
          protocol: newProtocol,
        },
      ]);
      setNewHostPort("");
      setNewContainerPort("");
    }
  };

  const removePort = (index: number) => {
    onPortsChange(ports.filter((_, i) => i !== index));
  };

  const addCommonPort = (port: string, protocol: string) => {
    if (!isPortInUse(port, protocol)) {
      onPortsChange([
        ...ports,
        {
          hostPort: port,
          containerPort: port,
          protocol: protocol as "tcp" | "udp",
        },
      ]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Common ports */}
      <div>
        <Label className="mb-2 block">Common Ports</Label>
        <div className="flex flex-wrap gap-2">
          {COMMON_PORTS.map((cp) => {
            const inUse = isPortInUse(cp.port, cp.protocol);
            const usage = getPortUsage(cp.port, cp.protocol);
            return (
              <div key={`${cp.port}-${cp.protocol}`} className="relative group">
                <Button
                  variant={inUse ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => addCommonPort(cp.port, cp.protocol)}
                  disabled={inUse}
                  className={inUse ? "opacity-50" : ""}
                >
                  {cp.port} ({cp.name})
                </Button>
                {inUse && usage && (
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 w-48">
                    <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs">
                      <p className="font-semibold">In use by:</p>
                      <p className="text-muted-foreground truncate">
                        {usage.container_name || usage.container_id}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add custom port */}
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-4 space-y-2">
          <Label>Host Port</Label>
          <Input
            type="number"
            placeholder="8080"
            value={newHostPort}
            onChange={(e) => setNewHostPort(e.target.value)}
          />
          {newHostPort && isPortInUse(newHostPort, newProtocol) && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Port {newHostPort}/{newProtocol} is already in use by{" "}
                {getPortUsage(newHostPort, newProtocol)?.container_name}
              </AlertDescription>
            </Alert>
          )}
        </div>
        <div className="col-span-4 space-y-2">
          <Label>Container Port</Label>
          <Input
            type="number"
            placeholder="80"
            value={newContainerPort}
            onChange={(e) => setNewContainerPort(e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Protocol</Label>
          <Select
            value={newProtocol}
            onValueChange={(v) => setNewProtocol(v as "tcp" | "udp")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tcp">TCP</SelectItem>
              <SelectItem value="udp">UDP</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-2">
          <Label className="invisible">Add</Label>
          <Button onClick={addPort} className="w-full">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Port list */}
      {ports.length > 0 && (
        <div className="space-y-2">
          <Label>Configured Ports</Label>
          <div className="space-y-2">
            {ports.map((port, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-4">
                  <Network className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-sm">
                    {port.hostPort} → {port.containerPort}
                  </span>
                  <Badge variant="secondary">
                    {port.protocol.toUpperCase()}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removePort(index)}
                >
                  <span className="h-4 w-4">×</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
