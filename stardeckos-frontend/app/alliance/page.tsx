"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  ShieldCheck,
  Users,
  UserPlus,
  Settings,
  Plus,
  Trash2,
  Link as LinkIcon,
  Unlink,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Package,
  Rocket,
  RefreshCw,
  Key,
  Globe,
  Server,
} from "lucide-react";

// Types
interface AllianceProvider {
  id: string;
  name: string;
  type: "oidc" | "ldap" | "saml";
  enabled: boolean;
  is_managed: boolean;
  container_id?: string;
  created_at: string;
  updated_at: string;
}

interface OIDCConfig {
  issuer_url: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  scopes: string[];
  username_claim: string;
  email_claim: string;
  groups_claim: string;
}

interface AllianceUser {
  id: string;
  provider_id: string;
  external_id: string;
  username: string;
  email: string;
  display_name: string;
  groups: string;
  local_user_id?: number;
  created_at: string;
  updated_at: string;
}

interface BuiltInTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  env_defaults: Record<string, string>;
  env_descriptions: Record<string, string>;
  required_env_vars: string[];
  tags: string[];
}

interface AllianceStatus {
  enabled: boolean;
  provider_count: number;
  user_count: number;
  group_count: number;
  client_count: number;
}

interface LocalUser {
  id: number;
  username: string;
  display_name: string;
}

export default function AlliancePage() {
  const { isAuthenticated, isLoading, token } = useAuth();
  const router = useRouter();

  // State
  const [status, setStatus] = useState<AllianceStatus | null>(null);
  const [providers, setProviders] = useState<AllianceProvider[]>([]);
  const [users, setUsers] = useState<AllianceUser[]>([]);
  const [templates, setTemplates] = useState<BuiltInTemplate[]>([]);
  const [localUsers, setLocalUsers] = useState<LocalUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("status");

  // Provider dialog state
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AllianceProvider | null>(null);
  const [providerForm, setProviderForm] = useState({
    name: "",
    type: "oidc" as "oidc" | "ldap" | "saml",
    issuer_url: "",
    client_id: "",
    client_secret: "",
    redirect_uri: "",
    scopes: "openid profile email",
    username_claim: "preferred_username",
    email_claim: "email",
    groups_claim: "groups",
  });
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Link user dialog state
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkingUser, setLinkingUser] = useState<AllianceUser | null>(null);
  const [selectedLocalUser, setSelectedLocalUser] = useState<string>("");
  const [isLinking, setIsLinking] = useState(false);

  // Deploy template dialog state
  const [showDeployDialog, setShowDeployDialog] = useState(false);
  const [deployingTemplate, setDeployingTemplate] = useState<BuiltInTemplate | null>(null);
  const [deployForm, setDeployForm] = useState<Record<string, string>>({});
  const [isDeploying, setIsDeploying] = useState(false);

  // Fetch functions
  const fetchStatus = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/alliance/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch status:", err);
    }
  }, [token]);

  const fetchProviders = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/alliance/providers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setProviders(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch providers:", err);
    }
  }, [token]);

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/alliance/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  }, [token]);

  const fetchTemplates = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/builtin-templates", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTemplates(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    }
  }, [token]);

  const fetchLocalUsers = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setLocalUsers(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch local users:", err);
    }
  }, [token]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (token) {
      fetchStatus();
      fetchProviders();
      fetchUsers();
      fetchTemplates();
      fetchLocalUsers();
    }
  }, [token, fetchStatus, fetchProviders, fetchUsers, fetchTemplates, fetchLocalUsers]);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Provider functions
  const openCreateProviderDialog = () => {
    setEditingProvider(null);
    setProviderForm({
      name: "",
      type: "oidc",
      issuer_url: "",
      client_id: "",
      client_secret: "",
      redirect_uri: `${window.location.origin}/api/alliance/callback`,
      scopes: "openid profile email",
      username_claim: "preferred_username",
      email_claim: "email",
      groups_claim: "groups",
    });
    setShowProviderDialog(true);
  };

  const saveProvider = async () => {
    if (!token) return;
    setIsSavingProvider(true);
    setError(null);

    try {
      const config: OIDCConfig = {
        issuer_url: providerForm.issuer_url,
        client_id: providerForm.client_id,
        client_secret: providerForm.client_secret,
        redirect_uri: providerForm.redirect_uri,
        scopes: providerForm.scopes.split(" ").filter(s => s),
        username_claim: providerForm.username_claim,
        email_claim: providerForm.email_claim,
        groups_claim: providerForm.groups_claim,
      };

      const body = {
        name: providerForm.name,
        type: providerForm.type,
        config,
      };

      const url = editingProvider
        ? `/api/alliance/providers/${editingProvider.id}`
        : "/api/alliance/providers";
      const method = editingProvider ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save provider");
      }

      setShowProviderDialog(false);
      setSuccessMessage(editingProvider ? "Provider updated" : "Provider created");
      fetchProviders();
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save provider");
    } finally {
      setIsSavingProvider(false);
    }
  };

  const deleteProvider = async (id: string) => {
    if (!token || !confirm("Are you sure you want to delete this provider?")) return;

    try {
      const response = await fetch(`/api/alliance/providers/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete provider");
      }

      setSuccessMessage("Provider deleted");
      fetchProviders();
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete provider");
    }
  };

  const testProvider = async (id: string) => {
    if (!token) return;
    setTestingProvider(id);
    setTestResult(null);

    try {
      const response = await fetch(`/api/alliance/providers/${id}/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      setTestResult({
        success: data.success,
        message: data.message || (data.success ? "Connection successful" : "Connection failed"),
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTestingProvider(null);
    }
  };

  // Link user function
  const linkUser = async () => {
    if (!token || !linkingUser || !selectedLocalUser) return;
    setIsLinking(true);

    try {
      const response = await fetch(`/api/alliance/users/${linkingUser.id}/link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ local_user_id: parseInt(selectedLocalUser) }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to link user");
      }

      setShowLinkDialog(false);
      setSuccessMessage("User linked successfully");
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link user");
    } finally {
      setIsLinking(false);
    }
  };

  // Deploy template function
  const deployTemplate = async () => {
    if (!token || !deployingTemplate) return;
    setIsDeploying(true);

    try {
      const response = await fetch(`/api/builtin-templates/${deployingTemplate.id}/deploy`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ environment: deployForm }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to deploy template");
      }

      setShowDeployDialog(false);
      setSuccessMessage(`${deployingTemplate.name} deployed successfully`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deploy template");
    } finally {
      setIsDeploying(false);
    }
  };

  const openDeployDialog = (template: BuiltInTemplate) => {
    setDeployingTemplate(template);
    setDeployForm({ ...template.env_defaults });
    setShowDeployDialog(true);
  };

  const getProviderIcon = (type: string) => {
    switch (type) {
      case "oidc": return <Key className="h-4 w-4" />;
      case "ldap": return <Server className="h-4 w-4" />;
      case "saml": return <Globe className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const getTemplateIcon = (icon: string) => {
    switch (icon) {
      case "file-text": return <FileText className="h-8 w-8" />;
      case "shield-check": return <ShieldCheck className="h-8 w-8" />;
      default: return <Package className="h-8 w-8" />;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-accent" />
            <div>
              <h1 className="text-2xl font-bold font-mono text-primary">STARFLEET ALLIANCE</h1>
              <p className="text-sm text-muted-foreground">Identity Federation & SSO Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchStatus();
                fetchProviders();
                fetchUsers();
                fetchTemplates();
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Status messages */}
        {error && (
          <div className="bg-destructive/20 border border-destructive/50 rounded-lg p-3 flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            <span className="text-destructive">{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-green-500">{successMessage}</span>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50 border border-border">
            <TabsTrigger value="status" className="data-[state=active]:bg-accent/20 data-[state=active]:text-accent">
              <Settings className="h-4 w-4 mr-2" />
              Status
            </TabsTrigger>
            <TabsTrigger value="providers" className="data-[state=active]:bg-accent/20 data-[state=active]:text-accent">
              <ShieldCheck className="h-4 w-4 mr-2" />
              Providers
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-accent/20 data-[state=active]:text-accent">
              <Users className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="templates" className="data-[state=active]:bg-accent/20 data-[state=active]:text-accent">
              <Package className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
          </TabsList>

          {/* Status Tab */}
          <TabsContent value="status" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono text-muted-foreground">STATUS</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {status?.enabled ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <span className="text-green-500 font-mono">ENABLED</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-5 w-5 text-muted-foreground" />
                        <span className="text-muted-foreground font-mono">DISABLED</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono text-muted-foreground">PROVIDERS</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold font-mono text-accent">
                    {status?.provider_count || 0}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono text-muted-foreground">FEDERATED USERS</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold font-mono text-primary">
                    {status?.user_count || 0}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono text-muted-foreground">SSO CLIENTS</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold font-mono text-green-500">
                    {status?.client_count || 0}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-mono text-primary">GETTING STARTED</CardTitle>
                <CardDescription>Configure SSO for your Stardeck installation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent/20 text-accent font-bold">1</div>
                  <div>
                    <h4 className="font-medium text-foreground">Add Identity Provider</h4>
                    <p className="text-sm text-muted-foreground">Connect to your existing identity provider (Authentik, Keycloak, etc.) or deploy one using the Templates tab.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent/20 text-accent font-bold">2</div>
                  <div>
                    <h4 className="font-medium text-foreground">Configure SSO</h4>
                    <p className="text-sm text-muted-foreground">Enter your OIDC configuration details and test the connection.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent/20 text-accent font-bold">3</div>
                  <div>
                    <h4 className="font-medium text-foreground">Link Users</h4>
                    <p className="text-sm text-muted-foreground">Users from your IdP will appear in the Users tab. Link them to local accounts for unified access.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Providers Tab */}
          <TabsContent value="providers" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-mono text-primary">Identity Providers</h2>
              <Button onClick={openCreateProviderDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Provider
              </Button>
            </div>

            {providers.length === 0 ? (
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardContent className="py-12 text-center">
                  <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No providers configured</h3>
                  <p className="text-muted-foreground mb-4">Add an identity provider to enable SSO</p>
                  <Button onClick={openCreateProviderDialog} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Provider
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {providers.map((provider) => (
                  <Card key={provider.id} className="border-border/60 bg-card/70 backdrop-blur-sm">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-muted rounded-lg">
                            {getProviderIcon(provider.type)}
                          </div>
                          <div>
                            <h3 className="font-medium text-foreground">{provider.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline">
                                {provider.type.toUpperCase()}
                              </Badge>
                              {provider.enabled ? (
                                <Badge className="bg-green-500/20 text-green-500 border-green-500/50">
                                  Enabled
                                </Badge>
                              ) : (
                                <Badge variant="secondary">
                                  Disabled
                                </Badge>
                              )}
                              {provider.is_managed && (
                                <Badge className="bg-accent/20 text-accent border-accent/50">
                                  Managed
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {testResult && testingProvider === null && (
                            <span className={`text-sm ${testResult.success ? "text-green-500" : "text-destructive"}`}>
                              {testResult.message}
                            </span>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testProvider(provider.id)}
                            disabled={testingProvider === provider.id}
                          >
                            {testingProvider === provider.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Play className="h-4 w-4 mr-1" />
                                Test
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteProvider(provider.id)}
                            className="border-destructive/50 text-destructive hover:bg-destructive/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-mono text-primary">Federated Users</h2>
            </div>

            {users.length === 0 ? (
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No federated users</h3>
                  <p className="text-muted-foreground">Users will appear here after they authenticate via SSO</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-muted-foreground">Username</TableHead>
                      <TableHead className="text-muted-foreground">Email</TableHead>
                      <TableHead className="text-muted-foreground">Display Name</TableHead>
                      <TableHead className="text-muted-foreground">Linked Account</TableHead>
                      <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id} className="border-border">
                        <TableCell className="font-mono text-accent">{user.username}</TableCell>
                        <TableCell className="text-foreground">{user.email}</TableCell>
                        <TableCell className="text-foreground">{user.display_name}</TableCell>
                        <TableCell>
                          {user.local_user_id ? (
                            <Badge className="bg-green-500/20 text-green-500 border-green-500/50">
                              <LinkIcon className="h-3 w-3 mr-1" />
                              Linked
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Unlink className="h-3 w-3 mr-1" />
                              Not Linked
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!user.local_user_id && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setLinkingUser(user);
                                setSelectedLocalUser("");
                                setShowLinkDialog(true);
                              }}
                            >
                              <UserPlus className="h-4 w-4 mr-1" />
                              Link
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-mono text-primary">Built-in Templates</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template) => (
                <Card key={template.id} className="border-border/60 bg-card/70 backdrop-blur-sm hover:border-accent/50 transition-colors">
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-accent/10 rounded-lg text-accent">
                        {getTemplateIcon(template.icon)}
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-lg text-foreground">{template.name}</CardTitle>
                        <CardDescription className="mt-1">{template.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1 mb-4">
                      {template.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <Button
                      onClick={() => openDeployDialog(template)}
                      className="w-full"
                    >
                      <Rocket className="h-4 w-4 mr-2" />
                      Deploy {template.name}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Provider Dialog */}
        <Dialog open={showProviderDialog} onOpenChange={setShowProviderDialog}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-primary font-mono">
                {editingProvider ? "Edit Provider" : "Add Identity Provider"}
              </DialogTitle>
              <DialogDescription>
                Configure your identity provider connection
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={providerForm.name}
                    onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                    placeholder="My IdP"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={providerForm.type}
                    onValueChange={(value: "oidc" | "ldap" | "saml") =>
                      setProviderForm({ ...providerForm, type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oidc">OpenID Connect (OIDC)</SelectItem>
                      <SelectItem value="ldap">LDAP</SelectItem>
                      <SelectItem value="saml">SAML</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {providerForm.type === "oidc" && (
                <>
                  <div className="space-y-2">
                    <Label>Issuer URL</Label>
                    <Input
                      value={providerForm.issuer_url}
                      onChange={(e) => setProviderForm({ ...providerForm, issuer_url: e.target.value })}
                      placeholder="https://auth.example.com"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Client ID</Label>
                      <Input
                        value={providerForm.client_id}
                        onChange={(e) => setProviderForm({ ...providerForm, client_id: e.target.value })}
                        placeholder="client_id"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Client Secret</Label>
                      <Input
                        type="password"
                        value={providerForm.client_secret}
                        onChange={(e) => setProviderForm({ ...providerForm, client_secret: e.target.value })}
                        placeholder="client_secret"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Redirect URI</Label>
                    <Input
                      value={providerForm.redirect_uri}
                      onChange={(e) => setProviderForm({ ...providerForm, redirect_uri: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scopes</Label>
                    <Input
                      value={providerForm.scopes}
                      onChange={(e) => setProviderForm({ ...providerForm, scopes: e.target.value })}
                      placeholder="openid profile email"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Username Claim</Label>
                      <Input
                        value={providerForm.username_claim}
                        onChange={(e) => setProviderForm({ ...providerForm, username_claim: e.target.value })}
                        placeholder="preferred_username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email Claim</Label>
                      <Input
                        value={providerForm.email_claim}
                        onChange={(e) => setProviderForm({ ...providerForm, email_claim: e.target.value })}
                        placeholder="email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Groups Claim</Label>
                      <Input
                        value={providerForm.groups_claim}
                        onChange={(e) => setProviderForm({ ...providerForm, groups_claim: e.target.value })}
                        placeholder="groups"
                      />
                    </div>
                  </div>
                </>
              )}

              {providerForm.type === "ldap" && (
                <div className="p-4 bg-muted/50 rounded-lg text-center text-muted-foreground">
                  LDAP configuration coming soon
                </div>
              )}

              {providerForm.type === "saml" && (
                <div className="p-4 bg-muted/50 rounded-lg text-center text-muted-foreground">
                  SAML configuration coming soon
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowProviderDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={saveProvider}
                disabled={isSavingProvider || !providerForm.name}
              >
                {isSavingProvider ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {editingProvider ? "Update" : "Create"} Provider
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Link User Dialog */}
        <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-primary font-mono">Link User Account</DialogTitle>
              <DialogDescription>
                Link &quot;{linkingUser?.username}&quot; to a local Stardeck account
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Local Account</Label>
                <Select value={selectedLocalUser} onValueChange={setSelectedLocalUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {localUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.username} ({user.display_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={linkUser}
                disabled={isLinking || !selectedLocalUser}
              >
                {isLinking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Link Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Deploy Template Dialog */}
        <Dialog open={showDeployDialog} onOpenChange={setShowDeployDialog}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-primary font-mono">
                Deploy {deployingTemplate?.name}
              </DialogTitle>
              <DialogDescription>
                Configure environment variables for deployment
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {deployingTemplate && Object.entries(deployingTemplate.env_defaults).map(([key, defaultValue]) => (
                <div key={key} className="space-y-2">
                  <Label className="flex items-center gap-2">
                    {key}
                    {deployingTemplate.required_env_vars.includes(key) && (
                      <Badge variant="destructive" className="text-xs">Required</Badge>
                    )}
                  </Label>
                  {deployingTemplate.env_descriptions[key] && (
                    <p className="text-xs text-muted-foreground">{deployingTemplate.env_descriptions[key]}</p>
                  )}
                  <Input
                    value={deployForm[key] || ""}
                    onChange={(e) => setDeployForm({ ...deployForm, [key]: e.target.value })}
                    placeholder={defaultValue}
                  />
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeployDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={deployTemplate}
                disabled={isDeploying}
              >
                {isDeploying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Rocket className="h-4 w-4 mr-2" />}
                Deploy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
