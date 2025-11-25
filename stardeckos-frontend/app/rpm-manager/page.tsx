"use client";

import { useEffect, useState, useCallback } from "react";
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
  AlertTriangle,
  RefreshCw,
  Search,
  Plus,
  Trash2,
  Edit,
  Server,
  AlertCircle
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
}

export default function RPMManagerPage() {
  const { isAuthenticated, isLoading, token } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  
  // Updates tab state
  const [updates, setUpdates] = useState<Update[]>([]);
  const [history, setHistory] = useState<UpdateHistory[]>([]);
  const [selectedUpdates, setSelectedUpdates] = useState<Set<string>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false);
  
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

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
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

  const applyUpdates = async () => {
    if (!token) return;
    setIsUpdating(true);
    setError(null);

    try {
      const packagesToUpdate = selectedUpdates.size > 0 
        ? Array.from(selectedUpdates)
        : [];

      const response = await fetch("/api/updates/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ packages: packagesToUpdate }),
      });

      if (!response.ok) throw new Error("Failed to apply updates");
      
      const result = await response.json();
      alert(result.message || "Updates applied successfully");
      setSelectedUpdates(new Set());
      fetchUpdates();
      fetchHistory();
    } catch (err) {
      setError("Failed to apply updates");
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
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

  const installPackages = async () => {
    if (!token || selectedPackages.size === 0) return;

    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch("/api/packages/install", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ packages: Array.from(selectedPackages) }),
      });

      if (!response.ok) throw new Error("Failed to install packages");
      
      const result = await response.json();
      alert(result.message || "Packages installed successfully");
      setSelectedPackages(new Set());
      setSearchResults([]);
      setSearchQuery("");
    } catch (err) {
      setError("Failed to install packages");
      console.error(err);
    } finally {
      setIsSearching(false);
    }
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

  const refreshMetadata = async () => {
    if (!token) return;

    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch("/api/metadata/refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to refresh metadata");
      
      alert("Repository metadata refreshed successfully");
      fetchUpdates();
    } catch (err) {
      setError("Failed to refresh metadata");
      console.error(err);
    } finally {
      setIsSearching(false);
    }
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
      
      alert(`Repository ${editingRepoId ? "updated" : "created"} successfully`);
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
      
      alert("Repository deleted successfully");
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
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const securityUpdates = updates.filter(u => u.security_update).length;
  const totalUpdates = updates.length;

  return (
    <DashboardLayout title="RPM MANAGER" time={time}>
      <div className="p-6 space-y-6">
        {/* Error message */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="updates">
              <Download className="w-4 h-4 mr-2" />
              Updates
            </TabsTrigger>
            <TabsTrigger value="packages">
              <Package className="w-4 h-4 mr-2" />
              Packages
            </TabsTrigger>
            <TabsTrigger value="repositories">
              <Server className="w-4 h-4 mr-2" />
              Repositories
            </TabsTrigger>
          </TabsList>

          {/* Updates Tab */}
          <TabsContent value="updates" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Available Updates
                  </CardTitle>
                  <Package className="w-4 h-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{totalUpdates}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {securityUpdates} security
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Security Updates
                  </CardTitle>
                  <AlertTriangle className="w-4 h-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{securityUpdates}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Critical patches
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Selected
                  </CardTitle>
                  <CheckCircle2 className="w-4 h-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{selectedUpdates.size}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ready to install
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={applyUpdates} 
                disabled={isUpdating || totalUpdates === 0}
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {selectedUpdates.size > 0 
                  ? `Apply Selected (${selectedUpdates.size})` 
                  : "Apply All Updates"
                }
              </Button>
              <Button 
                onClick={refreshMetadata} 
                variant="outline"
                disabled={isUpdating}
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh Metadata
              </Button>
            </div>

            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Available Updates</CardTitle>
              </CardHeader>
              <CardContent>
                {totalUpdates === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-400" />
                    <p>System is up to date</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {updates.map((update) => (
                      <div
                        key={update.name}
                        className="flex items-center justify-between p-3 border border-border/40 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={() => toggleUpdateSelection(update.name)}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <input
                            type="checkbox"
                            checked={selectedUpdates.has(update.name)}
                            onChange={() => {}}
                            className="w-4 h-4"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{update.name}</span>
                              {update.security_update && (
                                <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">
                                  SECURITY
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {update.current_version} → {update.new_version}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {update.repository}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Update History</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No update history</p>
                ) : (
                  <div className="space-y-2">
                    {history.slice(0, 10).map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-3 border border-border/40 rounded-lg"
                      >
                        <div>
                          <div className="font-medium">{entry.action}</div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(entry.date).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {entry.package_count} packages
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
              <CardHeader>
                <CardTitle>Search Packages</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search for packages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && searchPackages()}
                    className="flex-1"
                  />
                  <Button 
                    onClick={searchPackages} 
                    disabled={isSearching || !searchQuery.trim()}
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </Button>
                </div>

                {selectedPackages.size > 0 && (
                  <Button 
                    onClick={installPackages} 
                    disabled={isSearching}
                    className="w-full"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Install Selected ({selectedPackages.size})
                  </Button>
                )}

                {searchResults.length > 0 && (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {searchResults.map((pkg) => (
                      <div
                        key={`${pkg.name}-${pkg.arch}`}
                        className="flex items-center justify-between p-3 border border-border/40 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={() => togglePackageSelection(pkg.name)}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <input
                            type="checkbox"
                            checked={selectedPackages.has(pkg.name)}
                            onChange={() => {}}
                            className="w-4 h-4"
                          />
                          <div className="flex-1">
                            <div className="font-medium">
                              {pkg.name}
                              {pkg.arch && <span className="text-muted-foreground ml-2">({pkg.arch})</span>}
                            </div>
                            <div className="text-sm text-muted-foreground">{pkg.summary}</div>
                          </div>
                        </div>
                        {pkg.repository && (
                          <div className="text-sm text-muted-foreground">
                            {pkg.repository}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {searchResults.length === 0 && searchQuery && !isSearching && (
                  <p className="text-center text-muted-foreground py-8">
                    No packages found
                  </p>
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
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Repository
              </Button>
            </div>

            {isEditingRepo && (
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>
                    {editingRepoId ? "Edit Repository" : "Add Repository"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Repository ID</Label>
                    <Input
                      value={repoForm.id}
                      onChange={(e) => setRepoForm({ ...repoForm, id: e.target.value })}
                      placeholder="my-repo"
                      disabled={!!editingRepoId}
                    />
                  </div>
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={repoForm.name}
                      onChange={(e) => setRepoForm({ ...repoForm, name: e.target.value })}
                      placeholder="My Repository"
                    />
                  </div>
                  <div>
                    <Label>Base URL</Label>
                    <Input
                      value={repoForm.baseurl || ""}
                      onChange={(e) => setRepoForm({ ...repoForm, baseurl: e.target.value })}
                      placeholder="https://example.com/repo"
                    />
                  </div>
                  <div>
                    <Label>Mirror List (optional)</Label>
                    <Input
                      value={repoForm.mirrorlist || ""}
                      onChange={(e) => setRepoForm({ ...repoForm, mirrorlist: e.target.value })}
                      placeholder="https://example.com/mirrorlist"
                    />
                  </div>
                  <div>
                    <Label>GPG Key (optional)</Label>
                    <Input
                      value={repoForm.gpgkey || ""}
                      onChange={(e) => setRepoForm({ ...repoForm, gpgkey: e.target.value })}
                      placeholder="https://example.com/RPM-GPG-KEY"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={repoForm.enabled}
                        onChange={(e) => setRepoForm({ ...repoForm, enabled: e.target.checked })}
                      />
                      Enabled
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={repoForm.gpgcheck}
                        onChange={(e) => setRepoForm({ ...repoForm, gpgcheck: e.target.checked })}
                      />
                      GPG Check
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={saveRepository}>
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
              <CardHeader>
                <CardTitle>Configured Repositories</CardTitle>
              </CardHeader>
              <CardContent>
                {repositories.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No repositories configured
                  </p>
                ) : (
                  <div className="space-y-2">
                    {repositories.map((repo) => (
                      <div
                        key={repo.id}
                        className="flex items-center justify-between p-3 border border-border/40 rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{repo.name}</span>
                            {repo.enabled ? (
                              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
                                ENABLED
                              </span>
                            ) : (
                              <span className="text-xs bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded">
                                DISABLED
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {repo.id}
                          </div>
                          {repo.baseurl && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {repo.baseurl}
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
    </DashboardLayout>
  );
}
