"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  Activity,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Shield,
  RefreshCw,
} from "lucide-react";

interface AuditLog {
  id: number;
  timestamp: string;
  user_id: number;
  username: string;
  action: string;
  target: string;
  details: string;
  ip_address: string;
}

interface AuditStats {
  last_24h: number;
  last_7d: number;
  all_time: number;
}

export default function AuditLogPage() {
  const { isAuthenticated, isLoading, user: currentUser, token } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(25);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchAction, setSearchAction] = useState("");
  const [selectedAction, setSelectedAction] = useState("");

  const fetchLogs = useCallback(async () => {
    if (!token) return;

    setIsLoadingLogs(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (selectedAction) {
        params.set("action", selectedAction);
      } else if (searchAction) {
        params.set("action_prefix", searchAction);
      }

      const response = await fetch(`/api/audit?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch audit logs");
      }

      const data = await response.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setIsLoadingLogs(false);
    }
  }, [token, limit, offset, selectedAction, searchAction]);

  const fetchStats = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/audit/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, [token]);

  const fetchActions = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/audit/actions", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setActions(data || []);
      }
    } catch (err) {
      console.error("Failed to load actions:", err);
    }
  }, [token]);

  // Access check: must be a system user (PAM auth) with admin role
  // Backend enforces wheel/root group membership
  const canAccessAudit = currentUser?.auth_type === "pam" && currentUser?.role === "admin";

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    } else if (!isLoading && !canAccessAudit) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, canAccessAudit, router]);

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
    if (isAuthenticated && canAccessAudit && token) {
      fetchLogs();
      fetchStats();
      fetchActions();
    }
  }, [isAuthenticated, canAccessAudit, token, fetchLogs, fetchStats, fetchActions]);

  if (isLoading || !isAuthenticated || !canAccessAudit) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Activity className="w-12 h-12 text-accent animate-pulse" />
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const formatAction = (action: string) => {
    return action.replace(/\./g, " › ").replace(/_/g, " ");
  };

  const getActionColor = (action: string) => {
    if (action.includes("login") || action.includes("logout")) return "text-blue-400";
    if (action.includes("create")) return "text-green-400";
    if (action.includes("delete") || action.includes("kill")) return "text-red-400";
    if (action.includes("update") || action.includes("edit")) return "text-yellow-400";
    if (action.includes("service")) return "text-purple-400";
    return "text-muted-foreground";
  };

  const parseDetails = (details: string) => {
    try {
      return JSON.parse(details);
    } catch {
      return null;
    }
  };

  return (
    <DashboardLayout title="AUDIT LOG" time={time}>
      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Last 24 Hours
              </CardTitle>
              <Clock className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.last_24h || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">events</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Last 7 Days
              </CardTitle>
              <Shield className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{stats?.last_7d || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">events</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                All Time
              </CardTitle>
              <FileText className="w-4 h-4 text-chart-4" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.all_time || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">total events</p>
            </CardContent>
          </Card>
        </div>

        {/* Audit Log List */}
        <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
          <CardHeader>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-accent" />
                Audit Events
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filter by action..."
                    value={searchAction}
                    onChange={(e) => {
                      setSearchAction(e.target.value);
                      setSelectedAction("");
                      setOffset(0);
                    }}
                    className="pl-9 w-48"
                  />
                </div>
                <select
                  value={selectedAction}
                  onChange={(e) => {
                    setSelectedAction(e.target.value);
                    setSearchAction("");
                    setOffset(0);
                  }}
                  className="h-10 px-3 rounded-md border border-border bg-input text-foreground text-sm"
                >
                  <option value="">All Actions</option>
                  {actions.map((action) => (
                    <option key={action} value={action}>
                      {formatAction(action)}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchAction("");
                    setSelectedAction("");
                    setOffset(0);
                    fetchLogs();
                    fetchStats();
                  }}
                  className="gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
                {error}
              </div>
            )}

            {isLoadingLogs ? (
              <div className="flex items-center justify-center py-12">
                <Activity className="w-8 h-8 text-accent animate-pulse" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No audit logs found</p>
                {(searchAction || selectedAction) && (
                  <p className="text-xs mt-1">Try adjusting your filters</p>
                )}
              </div>
            ) : (
              <>
                {/* Log entries */}
                <div className="space-y-2">
                  {logs.map((log) => {
                    const details = parseDetails(log.details);
                    return (
                      <div
                        key={log.id}
                        className="p-4 rounded-lg border border-border/50 bg-background/40 hover:bg-background/60 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`font-mono text-sm font-semibold ${getActionColor(log.action)}`}>
                                {formatAction(log.action)}
                              </span>
                              {log.target && (
                                <>
                                  <span className="text-muted-foreground">→</span>
                                  <span className="text-sm text-foreground font-medium truncate">
                                    {log.target}
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {log.username || "System"}
                              </span>
                              <span>•</span>
                              <span>{new Date(log.timestamp).toLocaleString()}</span>
                              {log.ip_address && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono">{log.ip_address}</span>
                                </>
                              )}
                            </div>
                            {details && Object.keys(details).length > 0 && (
                              <div className="mt-2 p-2 rounded bg-background/60 text-xs font-mono text-muted-foreground overflow-x-auto">
                                {JSON.stringify(details, null, 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between pt-4 border-t border-border/30">
                  <div className="text-sm text-muted-foreground">
                    Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - limit))}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages || 1}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset + limit >= total}
                      onClick={() => setOffset(offset + limit)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
