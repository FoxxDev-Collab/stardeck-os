"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  Package,
  Download,
  CheckCircle2,
  RefreshCw,
  Search,
  Plus,
  Trash2,
  Edit,
  Server,
  AlertCircle,
  X,
  Clock,
  Shield,
  ArrowRight,
  Check,
  Loader2,
  XCircle,
  History,
  Info,
  ExternalLink,
  FileText,
  HardDrive,
  Scale,
  Globe,
  Box,
} from "lucide-react";

interface Update {
  name: string;
  current_version: string;
  new_version: string;
  repository: string;
  size: string;
  security_update: boolean;
}

interface UpdateHistory {
  id: number;
  date: string;
  action: string;
  package_count: number;
}

interface Repository {
  id: string;
  name: string;
  baseurl?: string;
  mirrorlist?: string;
  metalink?: string;
  enabled: boolean;
  gpgcheck: boolean;
  gpgkey?: string;
}

interface PackageSearchResult {
  name: string;
  arch: string;
  version?: string;
  repository?: string;
  summary: string;
  description?: string;
  size?: number;
  install_size?: number;
  license?: string;
  url?: string;
}

interface PackageDetails extends PackageSearchResult {
  installed?: boolean;
}

interface OperationMessage {
  type: string;
  message: string;
  phase?: string;
  progress?: number;
  package?: string;
  total_pkgs?: number;
  current_pkg?: number;
  packages?: string[];
  success?: boolean;
}

type OperationType = "update" | "install" | "remove" | "refresh" | null;

export default function RPMManagerPage() {
  const { isAuthenticated, isLoading, token } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");

  // Updates tab state
  const [updates, setUpdates] = useState<Update[]>([]);
  const [history, setHistory] = useState<UpdateHistory[]>([]);
  const [selectedUpdates, setSelectedUpdates] = useState<Set<string>>(new Set());

  // Packages tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PackageSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());

  // Repositories tab state
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [isEditingRepo, setIsEditingRepo] = useState(false);
  const [editingRepoId, setEditingRepoId] = useState<string | null>(null);
  const [repoForm, setRepoForm] = useState<Repository>({
    id: "",
    name: "",
    baseurl: "",
    enabled: true,
    gpgcheck: true,
  });

  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("updates");

  // Operation modal state
  const [showOperationModal, setShowOperationModal] = useState(false);
  const [operationType, setOperationType] = useState<OperationType>(null);
  const [operationPhase, setOperationPhase] = useState("");
  const [operationProgress, setOperationProgress] = useState(0);
  const [operationOutput, setOperationOutput] = useState<string[]>([]);
  const [operationComplete, setOperationComplete] = useState(false);
  const [operationSuccess, setOperationSuccess] = useState(false);
  const [operationMessage, setOperationMessage] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Package details modal state
  const [showPackageDetails, setShowPackageDetails] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PackageDetails | null>(null);
  const [isLoadingPackageDetails, setIsLoadingPackageDetails] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isAuthenticated && token) {
      if (activeTab === "updates") {
        fetchUpdates();
        fetchHistory();
      } else if (activeTab === "repositories") {
        fetchRepositories();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token, activeTab]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [operationOutput]);

  // ===== WebSocket Operation =====
  const startOperation = (operation: OperationType, packages: string[] = []) => {
    if (!token || !operation) return;

    setShowOperationModal(true);
    setOperationType(operation);
    setOperationPhase("starting");
    setOperationProgress(0);
    setOperationOutput([]);
    setOperationComplete(false);
    setOperationSuccess(false);
    setOperationMessage("");

    // Connect to WebSocket
    const isDevMode = typeof window !== "undefined" && window.location.port === "3000";
    const wsProtocol = isDevMode ? "ws:" : window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = isDevMode ? `${window.location.hostname}:8080` : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/api/packages/ws?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send the operation request
      ws.send(JSON.stringify({
        operation,
        packages,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: OperationMessage = JSON.parse(event.data);

        if (msg.phase) {
          setOperationPhase(msg.phase);
        }
        if (msg.progress !== undefined) {
          setOperationProgress(msg.progress);
        }

        if (msg.type === "output" || msg.type === "status") {
          setOperationOutput((prev) => [...prev, msg.message]);
        } else if (msg.type === "complete") {
          setOperationComplete(true);
          setOperationSuccess(msg.success || false);
          setOperationMessage(msg.message);
          setOperationProgress(100);
        } else if (msg.type === "error") {
          setOperationOutput((prev) => [...prev, `ERROR: ${msg.message}`]);
          setOperationComplete(true);
          setOperationSuccess(false);
          setOperationMessage(msg.message);
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setOperationOutput((prev) => [...prev, "WebSocket connection error"]);
      setOperationComplete(true);
      setOperationSuccess(false);
      setOperationMessage("Connection error");
    };

    ws.onclose = () => {
      wsRef.current = null;
    };
  };

  const closeOperationModal = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setShowOperationModal(false);
    setOperationType(null);
    setOperationOutput([]);

    // Refresh data after operation
    if (operationComplete && operationSuccess) {
      fetchUpdates();
      fetchHistory();
      setSelectedUpdates(new Set());
      setSelectedPackages(new Set());
    }
  };

  // ===== Updates Tab Functions =====
  const fetchUpdates = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/updates/available", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to fetch updates");
      const data = await response.json();
      setUpdates(data || []);
    } catch (err) {
      setError("Failed to fetch updates");
      console.error(err);
    }
  }, [token]);

  const fetchHistory = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/updates/history", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to fetch history");
      const data = await response.json();
      setHistory(data || []);
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  const applyUpdates = () => {
    const packages = selectedUpdates.size > 0 ? Array.from(selectedUpdates) : [];
    startOperation("update", packages);
  };

  const toggleUpdateSelection = (name: string) => {
    const newSelection = new Set(selectedUpdates);
    if (newSelection.has(name)) {
      newSelection.delete(name);
    } else {
      newSelection.add(name);
    }
    setSelectedUpdates(newSelection);
  };

  const selectAllUpdates = () => {
    if (selectedUpdates.size === updates.length) {
      setSelectedUpdates(new Set());
    } else {
      setSelectedUpdates(new Set(updates.map((u) => u.name)));
    }
  };

  // ===== Packages Tab Functions =====
  const searchPackages = async () => {
    if (!token || !searchQuery.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch(`/api/packages/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to search packages");
      const data = await response.json();
      setSearchResults(data || []);
    } catch (err) {
      setError("Failed to search packages");
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const installPackages = () => {
    if (selectedPackages.size === 0) return;
    startOperation("install", Array.from(selectedPackages));
  };

  const togglePackageSelection = (name: string) => {
    const newSelection = new Set(selectedPackages);
    if (newSelection.has(name)) {
      newSelection.delete(name);
    } else {
      newSelection.add(name);
    }
    setSelectedPackages(newSelection);
  };

  const refreshMetadata = () => {
    startOperation("refresh");
  };

  // ===== Package Details =====
  const fetchPackageDetails = async (packageName: string) => {
    if (!token) return;

    setIsLoadingPackageDetails(true);
    setShowPackageDetails(true);
    setSelectedPackage(null);

    try {
      const response = await fetch(`/api/packages/${encodeURIComponent(packageName)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to fetch package details");
      const data = await response.json();
      setSelectedPackage(data);
    } catch (err) {
      console.error(err);
      setSelectedPackage({
        name: packageName,
        arch: "",
        summary: "Failed to load package details",
      });
    } finally {
      setIsLoadingPackageDetails(false);
    }
  };

  const formatBytes = (bytes: number | undefined): string => {
    if (!bytes || bytes === 0) return "N/A";
    const units = ["B", "KB", "MB", "GB"];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  // ===== Repositories Tab Functions =====
  const fetchRepositories = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/repositories", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to fetch repositories");
      const data = await response.json();
      setRepositories(data || []);
    } catch (err) {
      setError("Failed to fetch repositories");
      console.error(err);
    }
  }, [token]);

  const saveRepository = async () => {
    if (!token) return;

    setError(null);

    try {
      const url = editingRepoId
        ? `/api/repositories/${editingRepoId}`
        : "/api/repositories";

      const response = await fetch(url, {
        method: editingRepoId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(repoForm),
      });

      if (!response.ok) throw new Error("Failed to save repository");

      setIsEditingRepo(false);
      setEditingRepoId(null);
      setRepoForm({
        id: "",
        name: "",
        baseurl: "",
        enabled: true,
        gpgcheck: true,
      });
      fetchRepositories();
    } catch (err) {
      setError("Failed to save repository");
      console.error(err);
    }
  };

  const deleteRepository = async (repoId: string) => {
    if (!token || !confirm(`Delete repository ${repoId}?`)) return;

    try {
      const response = await fetch(`/api/repositories/${repoId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to delete repository");
      fetchRepositories();
    } catch (err) {
      setError("Failed to delete repository");
      console.error(err);
    }
  };

  const startEditRepo = (repo: Repository) => {
    setRepoForm(repo);
    setEditingRepoId(repo.id);
    setIsEditingRepo(true);
  };

  if (isLoading) {
    return (
      <DashboardLayout title="RPM Manager" time={time}>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const securityUpdates = updates.filter((u) => u.security_update).length;
  const totalUpdates = updates.length;

  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case "starting":
        return "Starting...";
      case "checking":
        return "Checking dependencies...";
      case "downloading":
        return "Downloading packages...";
      case "installing":
        return "Installing packages...";
      case "verifying":
        return "Verifying...";
      case "complete":
        return "Complete";
      case "cleaning":
        return "Cleaning metadata...";
      case "caching":
        return "Building cache...";
      case "error":
        return "Error";
      default:
        return phase;
    }
  };

  const getPhaseIcon = (phase: string) => {
    switch (phase) {
      case "starting":
      case "checking":
        return <Loader2 className="w-5 h-5 animate-spin" />;
      case "downloading":
        return <Download className="w-5 h-5 animate-pulse" />;
      case "installing":
        return <Package className="w-5 h-5 animate-pulse" />;
      case "verifying":
        return <Shield className="w-5 h-5 animate-pulse" />;
      case "complete":
        return operationSuccess ? (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        ) : (
          <XCircle className="w-5 h-5 text-destructive" />
        );
      case "cleaning":
      case "caching":
        return <RefreshCw className="w-5 h-5 animate-spin" />;
      case "error":
        return <XCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Loader2 className="w-5 h-5 animate-spin" />;
    }
  };

  return (
    <DashboardLayout title="RPM MANAGER" time={time}>
      <div className="p-6 space-y-6">
        {/* Error message */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 w-6 p-0"
              onClick={() => setError(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="updates" className="gap-2">
              <Download className="w-4 h-4" />
              Updates
              {totalUpdates > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-accent/20 text-accent rounded-full">
                  {totalUpdates}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="packages" className="gap-2">
              <Package className="w-4 h-4" />
              Packages
            </TabsTrigger>
            <TabsTrigger value="repositories" className="gap-2">
              <Server className="w-4 h-4" />
              Repositories
            </TabsTrigger>
          </TabsList>

          {/* Updates Tab */}
          <TabsContent value="updates" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Package className="w-4 h-4 text-accent" />
                    <span className="text-2xl font-bold">{totalUpdates}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Available Updates</p>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Shield className="w-4 h-4 text-orange-500" />
                    <span className="text-2xl font-bold text-orange-500">{securityUpdates}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Security Patches</p>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span className="text-2xl font-bold">{selectedUpdates.size}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Selected</p>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <History className="w-4 h-4 text-chart-4" />
                    <span className="text-2xl font-bold">{history.length}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Transactions</p>
                </CardContent>
              </Card>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={applyUpdates}
                disabled={totalUpdates === 0}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                {selectedUpdates.size > 0
                  ? `Update Selected (${selectedUpdates.size})`
                  : "Update All"}
              </Button>
              <Button onClick={refreshMetadata} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Refresh Metadata
              </Button>
              {updates.length > 0 && (
                <Button onClick={selectAllUpdates} variant="ghost" className="gap-2">
                  <Check className="w-4 h-4" />
                  {selectedUpdates.size === updates.length ? "Deselect All" : "Select All"}
                </Button>
              )}
            </div>

            {/* Available Updates */}
            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-accent" />
                  Available Updates
                </CardTitle>
              </CardHeader>
              <CardContent>
                {totalUpdates === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500/50" />
                    <p className="text-lg font-medium">System is up to date</p>
                    <p className="text-sm mt-1">No updates available</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {updates.map((update) => (
                      <div
                        key={update.name}
                        className={`p-4 border rounded-lg transition-all ${
                          selectedUpdates.has(update.name)
                            ? "border-accent bg-accent/10"
                            : "border-border/40 hover:border-accent/50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedUpdates.has(update.name)}
                            onChange={() => toggleUpdateSelection(update.name)}
                            className="w-4 h-4 accent-accent mt-1 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="font-medium hover:text-accent cursor-pointer"
                                onClick={() => fetchPackageDetails(update.name)}
                              >
                                {update.name}
                              </span>
                              {update.security_update && (
                                <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded flex items-center gap-1">
                                  <Shield className="w-3 h-3" />
                                  SECURITY
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{update.current_version}</span>
                              <ArrowRight className="w-3 h-3 text-accent" />
                              <span className="font-mono text-xs bg-accent/20 text-accent px-2 py-1 rounded">{update.new_version}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Server className="w-3 h-3" />
                                {update.repository}
                              </span>
                              {update.size && (
                                <span className="flex items-center gap-1">
                                  <HardDrive className="w-3 h-3" />
                                  {update.size}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchPackageDetails(update.name);
                              }}
                              className="h-8 w-8 p-0"
                              title="View details"
                            >
                              <Info className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                startOperation("update", [update.name]);
                              }}
                              className="h-8 w-8 p-0 text-accent hover:text-accent"
                              title="Update this package"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Update History */}
            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5 text-accent" />
                  Update History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No update history</p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {history.slice(0, 20).map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-3 border border-border/40 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="font-medium">{entry.action}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(entry.date).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm">
                          <span className="font-mono">{entry.package_count}</span>
                          <span className="text-muted-foreground ml-1">packages</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Packages Tab */}
          <TabsContent value="packages" className="space-y-6">
            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-accent" />
                  Search Packages
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search for packages (e.g., nginx, vim, docker)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchPackages()}
                      className="pl-10"
                    />
                  </div>
                  <Button
                    onClick={searchPackages}
                    disabled={isSearching || !searchQuery.trim()}
                    className="gap-2"
                  >
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    Search
                  </Button>
                </div>

                {selectedPackages.size > 0 && (
                  <Button onClick={installPackages} className="w-full gap-2">
                    <Download className="w-4 h-4" />
                    Install Selected ({selectedPackages.size})
                  </Button>
                )}

                {searchResults.length > 0 && (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {searchResults.map((pkg) => (
                      <div
                        key={`${pkg.name}-${pkg.arch}`}
                        className={`p-4 border rounded-lg transition-all ${
                          selectedPackages.has(pkg.name)
                            ? "border-accent bg-accent/10"
                            : "border-border/40 hover:border-accent/50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedPackages.has(pkg.name)}
                            onChange={() => togglePackageSelection(pkg.name)}
                            className="w-4 h-4 accent-accent mt-1 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="font-medium hover:text-accent cursor-pointer"
                                onClick={() => fetchPackageDetails(pkg.name)}
                              >
                                {pkg.name}
                              </span>
                              {pkg.arch && (
                                <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{pkg.arch}</span>
                              )}
                              {pkg.version && (
                                <span className="text-xs font-mono text-muted-foreground">{pkg.version}</span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{pkg.summary}</p>
                            {pkg.repository && (
                              <div className="flex items-center gap-4 mt-2">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Server className="w-3 h-3" />
                                  {pkg.repository}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchPackageDetails(pkg.name);
                              }}
                              className="h-8 w-8 p-0"
                              title="View details"
                            >
                              <Info className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                startOperation("install", [pkg.name]);
                              }}
                              className="h-8 w-8 p-0 text-green-500 hover:text-green-400"
                              title="Install package"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {searchResults.length === 0 && searchQuery && !isSearching && (
                  <div className="text-center text-muted-foreground py-12">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No packages found matching &quot;{searchQuery}&quot;</p>
                  </div>
                )}

                {!searchQuery && (
                  <div className="text-center text-muted-foreground py-12">
                    <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Enter a package name to search</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Repositories Tab */}
          <TabsContent value="repositories" className="space-y-6">
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setIsEditingRepo(true);
                  setEditingRepoId(null);
                  setRepoForm({
                    id: "",
                    name: "",
                    baseurl: "",
                    enabled: true,
                    gpgcheck: true,
                  });
                }}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Repository
              </Button>
            </div>

            {isEditingRepo && (
              <Card className="border-accent/50 bg-card/70 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle>
                    {editingRepoId ? "Edit Repository" : "Add Repository"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Repository ID</Label>
                      <Input
                        value={repoForm.id}
                        onChange={(e) => setRepoForm({ ...repoForm, id: e.target.value })}
                        placeholder="my-repo"
                        disabled={!!editingRepoId}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={repoForm.name}
                        onChange={(e) => setRepoForm({ ...repoForm, name: e.target.value })}
                        placeholder="My Repository"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Base URL</Label>
                      <Input
                        value={repoForm.baseurl || ""}
                        onChange={(e) => setRepoForm({ ...repoForm, baseurl: e.target.value })}
                        placeholder="https://example.com/repo/$releasever/$basearch"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mirror List (optional)</Label>
                      <Input
                        value={repoForm.mirrorlist || ""}
                        onChange={(e) => setRepoForm({ ...repoForm, mirrorlist: e.target.value })}
                        placeholder="https://example.com/mirrorlist"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>GPG Key (optional)</Label>
                      <Input
                        value={repoForm.gpgkey || ""}
                        onChange={(e) => setRepoForm({ ...repoForm, gpgkey: e.target.value })}
                        placeholder="https://example.com/RPM-GPG-KEY"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={repoForm.enabled}
                        onChange={(e) => setRepoForm({ ...repoForm, enabled: e.target.checked })}
                        className="w-4 h-4 accent-accent"
                      />
                      <span>Enabled</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={repoForm.gpgcheck}
                        onChange={(e) => setRepoForm({ ...repoForm, gpgcheck: e.target.checked })}
                        className="w-4 h-4 accent-accent"
                      />
                      <span>GPG Check</span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={saveRepository} className="gap-2">
                      <Check className="w-4 h-4" />
                      Save Repository
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditingRepo(false);
                        setEditingRepoId(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-accent" />
                  Configured Repositories
                </CardTitle>
              </CardHeader>
              <CardContent>
                {repositories.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">
                    <Server className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No repositories configured</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {repositories.map((repo) => (
                      <div
                        key={repo.id}
                        className="flex items-center justify-between p-4 border border-border/40 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{repo.name || repo.id}</span>
                            {repo.enabled ? (
                              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
                                ENABLED
                              </span>
                            ) : (
                              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                DISABLED
                              </span>
                            )}
                            {repo.gpgcheck && (
                              <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded flex items-center gap-1">
                                <Shield className="w-3 h-3" />
                                GPG
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">{repo.id}</div>
                          {(repo.baseurl || repo.mirrorlist || repo.metalink) && (
                            <div className="text-xs text-muted-foreground mt-1 truncate max-w-md">
                              {repo.baseurl || repo.mirrorlist || repo.metalink}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEditRepo(repo)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteRepository(repo.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Operation Modal */}
      {showOperationModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                {getPhaseIcon(operationPhase)}
                <div>
                  <h3 className="font-semibold">
                    {operationType === "update" && "Updating Packages"}
                    {operationType === "install" && "Installing Packages"}
                    {operationType === "remove" && "Removing Packages"}
                    {operationType === "refresh" && "Refreshing Metadata"}
                  </h3>
                  <p className="text-sm text-muted-foreground">{getPhaseLabel(operationPhase)}</p>
                </div>
              </div>
              {operationComplete && (
                <Button variant="ghost" size="sm" onClick={closeOperationModal}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Progress Bar */}
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Progress</span>
                <span className="text-sm font-mono">{operationProgress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    operationComplete
                      ? operationSuccess
                        ? "bg-green-500"
                        : "bg-destructive"
                      : "bg-accent"
                  }`}
                  style={{ width: `${operationProgress}%` }}
                />
              </div>
            </div>

            {/* Output Console */}
            <div
              ref={outputRef}
              className="flex-1 overflow-y-auto p-4 font-mono text-xs bg-black/30 min-h-[200px] max-h-[400px]"
            >
              {operationOutput.map((line, i) => (
                <div
                  key={i}
                  className={`py-0.5 ${
                    line.includes("ERROR") || line.includes("error")
                      ? "text-destructive"
                      : line.includes("Complete!") || line.includes("successfully")
                      ? "text-green-500"
                      : line.includes("Downloading") || line.includes("Installing")
                      ? "text-accent"
                      : "text-muted-foreground"
                  }`}
                >
                  {line}
                </div>
              ))}
              {!operationComplete && (
                <div className="py-0.5 text-muted-foreground animate-pulse">▌</div>
              )}
            </div>

            {/* Footer */}
            {operationComplete && (
              <div className="p-4 border-t border-border">
                <div
                  className={`flex items-center gap-2 mb-3 ${
                    operationSuccess ? "text-green-500" : "text-destructive"
                  }`}
                >
                  {operationSuccess ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                  <span className="font-medium">{operationMessage}</span>
                </div>
                <Button onClick={closeOperationModal} className="w-full">
                  Close
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Package Details Modal */}
      {showPackageDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-lg">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                  <Package className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold">
                    {isLoadingPackageDetails ? "Loading..." : selectedPackage?.name || "Package Details"}
                  </h3>
                  {selectedPackage?.arch && (
                    <p className="text-sm text-muted-foreground">{selectedPackage.arch}</p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPackageDetails(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {isLoadingPackageDetails ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-accent" />
                </div>
              ) : selectedPackage ? (
                <>
                  {/* Summary */}
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Summary</p>
                    <p className="text-sm">{selectedPackage.summary || "No summary available"}</p>
                  </div>

                  {/* Description */}
                  {selectedPackage.description && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Description</p>
                      <p className="text-sm whitespace-pre-wrap">{selectedPackage.description}</p>
                    </div>
                  )}

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {selectedPackage.version && (
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Box className="w-4 h-4 text-accent" />
                          <span className="text-xs text-muted-foreground">Version</span>
                        </div>
                        <p className="text-sm font-mono">{selectedPackage.version}</p>
                      </div>
                    )}

                    {selectedPackage.repository && (
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Server className="w-4 h-4 text-chart-4" />
                          <span className="text-xs text-muted-foreground">Repository</span>
                        </div>
                        <p className="text-sm">{selectedPackage.repository}</p>
                      </div>
                    )}

                    {(selectedPackage.size !== undefined && selectedPackage.size > 0) && (
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <HardDrive className="w-4 h-4 text-chart-2" />
                          <span className="text-xs text-muted-foreground">Download Size</span>
                        </div>
                        <p className="text-sm font-mono">{formatBytes(selectedPackage.size)}</p>
                      </div>
                    )}

                    {(selectedPackage.install_size !== undefined && selectedPackage.install_size > 0) && (
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="w-4 h-4 text-chart-3" />
                          <span className="text-xs text-muted-foreground">Installed Size</span>
                        </div>
                        <p className="text-sm font-mono">{formatBytes(selectedPackage.install_size)}</p>
                      </div>
                    )}

                    {selectedPackage.license && (
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Scale className="w-4 h-4 text-chart-5" />
                          <span className="text-xs text-muted-foreground">License</span>
                        </div>
                        <p className="text-sm">{selectedPackage.license}</p>
                      </div>
                    )}

                    {selectedPackage.url && (
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Globe className="w-4 h-4 text-primary" />
                          <span className="text-xs text-muted-foreground">Website</span>
                        </div>
                        <a
                          href={selectedPackage.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline flex items-center gap-1"
                        >
                          Visit <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-center text-muted-foreground py-8">No package selected</p>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border flex gap-2">
              {selectedPackage && !isLoadingPackageDetails && (
                <Button
                  onClick={() => {
                    setShowPackageDetails(false);
                    startOperation("install", [selectedPackage.name]);
                  }}
                  className="flex-1 gap-2"
                >
                  <Download className="w-4 h-4" />
                  Install Package
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setShowPackageDetails(false)}
                className={selectedPackage && !isLoadingPackageDetails ? "" : "w-full"}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
