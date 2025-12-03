"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Database,
  Plus,
  Search,
  Play,
  Square,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Eye,
  Copy,
  Globe,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

interface ManagedDatabase {
  id: string;
  name: string;
  type: "postgresql" | "mariadb" | "mysql" | "redis" | "mongodb";
  version: string;
  status: "running" | "stopped" | "starting" | "stopping" | "error" | "unknown";
  internal_host: string;
  internal_port: number;
  external_port: number;
  is_shared: boolean;
  connection_count: number;
  created_at: string;
}

interface DatabasesTabProps {
  token: string;
  isAdmin: boolean;
}

export function DatabasesTab({ token, isAdmin }: DatabasesTabProps) {
  const [databases, setDatabases] = useState<ManagedDatabase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDatabase, setSelectedDatabase] = useState<ManagedDatabase | null>(null);

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  // Form state
  const [newDbName, setNewDbName] = useState("");
  const [newDbType, setNewDbType] = useState<string>("postgresql");
  const [newDbVersion, setNewDbVersion] = useState("");
  const [newDbExternalPort, setNewDbExternalPort] = useState("");
  const [newDbIsShared, setNewDbIsShared] = useState(false);

  const fetchDatabases = useCallback(async () => {
    try {
      const response = await fetch("/api/databases", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setDatabases(data || []);
      }
    } catch (error) {
      console.error("Failed to fetch databases:", error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDatabases();
    const interval = setInterval(fetchDatabases, 5000);
    return () => clearInterval(interval);
  }, [fetchDatabases]);

  const createDatabase = async () => {
    try {
      const response = await fetch("/api/databases", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newDbName,
          type: newDbType,
          version: newDbVersion || undefined,
          external_port: newDbExternalPort ? parseInt(newDbExternalPort, 10) : undefined,
          is_shared: newDbIsShared,
        }),
      });

      if (response.ok) {
        toast.success("Database created", {
          description: `Database "${newDbName}" created successfully`,
        });
        setShowCreateDialog(false);
        resetForm();
        fetchDatabases();
      } else {
        const error = await response.json();
        toast.error("Failed to create database", {
          description: error.error || "Unknown error",
        });
      }
    } catch (error) {
      toast.error("Failed to create database", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const deleteDatabase = async () => {
    if (!selectedDatabase) return;

    try {
      const response = await fetch(`/api/databases/${selectedDatabase.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        toast.success("Database deleted", {
          description: `Database "${selectedDatabase.name}" deleted successfully`,
        });
        setShowDeleteDialog(false);
        setSelectedDatabase(null);
        fetchDatabases();
      } else {
        const error = await response.json();
        toast.error("Failed to delete database", {
          description: error.error || "Unknown error",
        });
      }
    } catch (error) {
      toast.error("Failed to delete database", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const databaseAction = async (
    database: ManagedDatabase,
    action: "start" | "stop"
  ) => {
    try {
      const response = await fetch(`/api/databases/${database.id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        toast.success(`Database ${action}ed`, {
          description: `Database "${database.name}" ${action}ed successfully`,
        });
        fetchDatabases();
      } else {
        const error = await response.json();
        toast.error(`Failed to ${action} database`, {
          description: error.error || "Unknown error",
        });
      }
    } catch (error) {
      toast.error(`Failed to ${action} database`, {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const resetForm = () => {
    setNewDbName("");
    setNewDbType("postgresql");
    setNewDbVersion("");
    setNewDbExternalPort("");
    setNewDbIsShared(false);
  };

  const openDetailsDialog = (database: ManagedDatabase) => {
    setSelectedDatabase(database);
    setShowDetailsDialog(true);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard", {
      description: `${label} copied`,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "text-accent";
      case "stopped":
        return "text-muted-foreground";
      case "starting":
      case "stopping":
        return "text-primary";
      case "error":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <CheckCircle2 className="w-4 h-4 text-accent" />;
      case "stopped":
        return <XCircle className="w-4 h-4 text-muted-foreground" />;
      case "starting":
      case "stopping":
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case "error":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getDatabaseIcon = (_type: string) => {
    return <Database className="w-5 h-5 text-accent" />;
  };

  const getDefaultVersion = (type: string) => {
    const versions: { [key: string]: string } = {
      postgresql: "17",
      mariadb: "11",
      mysql: "9",
      redis: "7",
      mongodb: "8",
    };
    return versions[type] || "";
  };

  const filteredDatabases = databases.filter(
    (db) =>
      db.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      db.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search databases..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-card/70 border-border/50"
          />
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Database
          </Button>
        )}
      </div>

      {/* Databases Grid */}
      {loading ? (
        <Card className="bg-card/70 border-border/50">
          <CardContent className="py-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-accent" />
            <p className="text-muted-foreground">Loading databases...</p>
          </CardContent>
        </Card>
      ) : filteredDatabases.length === 0 ? (
        <Card className="bg-card/70 border-border/50">
          <CardContent className="py-12 text-center">
            <Database className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">No Databases Found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm
                ? "No databases match your search"
                : "Create your first managed database to get started"}
            </p>
            {isAdmin && !searchTerm && (
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="w-4 h-4" /> New Database
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDatabases.map((db) => (
            <Card
              key={db.id}
              className="bg-card/70 border-border/50 hover:border-accent/50 transition-colors"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getDatabaseIcon(db.type)}
                    <CardTitle className="text-base">{db.name}</CardTitle>
                  </div>
                  {getStatusIcon(db.status)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {db.type.charAt(0).toUpperCase() + db.type.slice(1)} {db.version}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant="outline"
                    className={`${getStatusColor(db.status)} border-current`}
                  >
                    {db.status.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Connections</span>
                  <span className={getStatusColor(db.status)}>
                    {db.connection_count}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Access</span>
                  <div className="flex items-center gap-1">
                    {db.is_shared ? (
                      <Globe className="w-3 h-3 text-primary" />
                    ) : (
                      <Lock className="w-3 h-3 text-muted-foreground" />
                    )}
                    <span className="text-xs">
                      {db.is_shared ? "Shared" : "Private"}
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openDetailsDialog(db)}
                    className="gap-1 flex-1"
                  >
                    <Eye className="w-3 h-3" /> View
                  </Button>
                  {isAdmin && (
                    <>
                      {db.status === "stopped" || db.status === "error" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => databaseAction(db, "start")}
                          className="gap-1 flex-1 text-accent hover:text-accent"
                        >
                          <Play className="w-3 h-3" /> Start
                        </Button>
                      ) : db.status === "running" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => databaseAction(db, "stop")}
                          className="gap-1 flex-1 text-destructive hover:text-destructive"
                        >
                          <Square className="w-3 h-3" /> Stop
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled
                          className="gap-1 flex-1"
                        >
                          <Loader2 className="w-3 h-3 animate-spin" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedDatabase(db);
                          setShowDeleteDialog(true);
                        }}
                        className="gap-1 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Database Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Create New Database
            </DialogTitle>
            <DialogDescription>
              Create a new managed database instance
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Database Name</Label>
              <Input
                id="name"
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value)}
                placeholder="my-database"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Database Type</Label>
              <Select
                value={newDbType}
                onValueChange={(value) => {
                  setNewDbType(value);
                  setNewDbVersion(getDefaultVersion(value));
                }}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postgresql">PostgreSQL</SelectItem>
                  <SelectItem value="mariadb">MariaDB</SelectItem>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="redis">Redis</SelectItem>
                  <SelectItem value="mongodb">MongoDB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="version">Version (optional)</Label>
              <Input
                id="version"
                value={newDbVersion}
                onChange={(e) => setNewDbVersion(e.target.value)}
                placeholder={`Default: ${getDefaultVersion(newDbType)}`}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="external-port">External Port (optional)</Label>
              <Input
                id="external-port"
                type="number"
                value={newDbExternalPort}
                onChange={(e) => setNewDbExternalPort(e.target.value)}
                placeholder="Auto-assign"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-shared"
                checked={newDbIsShared}
                onChange={(e) => setNewDbIsShared(e.target.checked)}
                className="w-4 h-4 rounded border-border"
              />
              <Label htmlFor="is-shared" className="cursor-pointer">
                Shared database (accessible by all containers)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={createDatabase} disabled={!newDbName || !newDbType}>
              Create Database
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Database Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Database
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedDatabase?.name}&quot;? This will
              permanently remove the database and all its data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteDatabase}>
              Delete Database
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Database Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Database Details: {selectedDatabase?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedDatabase && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <p className="font-medium">
                    {selectedDatabase.type.charAt(0).toUpperCase() +
                      selectedDatabase.type.slice(1)}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Version</Label>
                  <p className="font-medium">{selectedDatabase.version}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedDatabase.status)}
                    <span className="font-medium">
                      {selectedDatabase.status.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Access</Label>
                  <p className="font-medium">
                    {selectedDatabase.is_shared ? "Shared" : "Private"}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div>
                  <Label className="text-muted-foreground">Internal Host</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 px-3 py-2 bg-muted/50 rounded text-sm font-mono">
                      {selectedDatabase.internal_host}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        copyToClipboard(
                          selectedDatabase.internal_host,
                          "Internal host"
                        )
                      }
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Internal Port</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 px-3 py-2 bg-muted/50 rounded text-sm font-mono">
                      {selectedDatabase.internal_port}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        copyToClipboard(
                          selectedDatabase.internal_port.toString(),
                          "Internal port"
                        )
                      }
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">External Port</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 px-3 py-2 bg-muted/50 rounded text-sm font-mono">
                      {selectedDatabase.external_port}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        copyToClipboard(
                          selectedDatabase.external_port.toString(),
                          "External port"
                        )
                      }
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Connection String</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 px-3 py-2 bg-muted/50 rounded text-sm font-mono break-all">
                      {selectedDatabase.type === "redis"
                        ? `redis://${selectedDatabase.internal_host}:${selectedDatabase.internal_port}`
                        : selectedDatabase.type === "mongodb"
                        ? `mongodb://${selectedDatabase.internal_host}:${selectedDatabase.internal_port}`
                        : `${selectedDatabase.type}://user:password@${selectedDatabase.internal_host}:${selectedDatabase.internal_port}/database`}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        copyToClipboard(
                          selectedDatabase.type === "redis"
                            ? `redis://${selectedDatabase.internal_host}:${selectedDatabase.internal_port}`
                            : selectedDatabase.type === "mongodb"
                            ? `mongodb://${selectedDatabase.internal_host}:${selectedDatabase.internal_port}`
                            : `${selectedDatabase.type}://user:password@${selectedDatabase.internal_host}:${selectedDatabase.internal_port}/database`,
                          "Connection string"
                        )
                      }
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Active Connections</Label>
                  <p className="font-medium">{selectedDatabase.connection_count}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p className="font-medium">
                    {new Date(selectedDatabase.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
