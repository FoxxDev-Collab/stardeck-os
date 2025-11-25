"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Activity, Users, UserPlus, Edit, Trash2, Shield, User as UserIcon, UsersRound, X, Check } from "lucide-react";

interface User {
  id: number;
  username: string;
  display_name: string;
  role: "admin" | "operator" | "viewer";
  auth_type: "local" | "pam";
  disabled: boolean;
  created_at: string;
  last_login?: string;
}

interface Group {
  id: number;
  name: string;
  display_name: string;
  description?: string;
}

export default function UserManagerPage() {
  const { isAuthenticated, isLoading, user: currentUser, token } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [users, setUsers] = useState<User[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", display_name: "", password: "", role: "viewer" as const });
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Group management state
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userGroups, setUserGroups] = useState<number[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }

      const data = await response.json();
      setUsers(data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    }
  }, [token]);

  const fetchGroups = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/groups", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch groups");
      }

      const data = await response.json();
      setGroups(data || []);
    } catch (err) {
      console.error("Failed to load groups:", err);
    }
  }, [token]);

  const fetchUserGroups = useCallback(async (userId: number) => {
    if (!token) return [];

    try {
      // Get all groups and check which ones the user belongs to
      const groupsResponse = await fetch("/api/groups", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!groupsResponse.ok) return [];

      const allGroups: Group[] = await groupsResponse.json();
      const membershipPromises = allGroups.map(async (group) => {
        const membersResponse = await fetch(`/api/groups/${group.id}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!membersResponse.ok) return null;
        const members = await membersResponse.json();
        const isMember = members.some((m: { id: number }) => m.id === userId);
        return isMember ? group.id : null;
      });

      const memberships = await Promise.all(membershipPromises);
      return memberships.filter((id): id is number => id !== null);
    } catch (err) {
      console.error("Failed to load user groups:", err);
      return [];
    }
  }, [token]);

  const openGroupModal = async (user: User) => {
    setSelectedUser(user);
    setShowGroupModal(true);
    setIsLoadingGroups(true);

    await fetchGroups();
    const memberships = await fetchUserGroups(user.id);
    setUserGroups(memberships);
    setIsLoadingGroups(false);
  };

  const toggleGroupMembership = async (groupId: number) => {
    if (!token || !selectedUser) return;

    const isCurrentMember = userGroups.includes(groupId);

    try {
      if (isCurrentMember) {
        // Remove from group
        const response = await fetch(`/api/groups/${groupId}/members/${selectedUser.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Failed to remove from group");
        setUserGroups(prev => prev.filter(id => id !== groupId));
      } else {
        // Add to group
        const response = await fetch(`/api/groups/${groupId}/members`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ user_ids: [selectedUser.id] }),
        });
        if (!response.ok) throw new Error("Failed to add to group");
        setUserGroups(prev => [...prev, groupId]);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update group membership");
    }
  };

  const closeGroupModal = () => {
    setShowGroupModal(false);
    setSelectedUser(null);
    setUserGroups([]);
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    } else if (!isLoading && currentUser?.role !== "admin") {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, currentUser, router]);

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
    if (isAuthenticated && currentUser?.role === "admin" && token) {
      fetchUsers();
    }
  }, [isAuthenticated, currentUser, token, fetchUsers]);

  if (isLoading || !isAuthenticated || currentUser?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Activity className="w-12 h-12 text-accent animate-pulse" />
      </div>
    );
  }

  const activeUsers = users.filter((u) => !u.disabled).length;
  const adminUsers = users.filter((u) => u.role === "admin").length;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setIsCreating(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newUser),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create user");
      }

      await fetchUsers();
      setShowCreateForm(false);
      setNewUser({ username: "", display_name: "", password: "", role: "viewer" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!token || !confirm("Are you sure you want to delete this user?")) return;

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete user");
      }

      await fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const handleToggleUser = async (userId: number, currentState: boolean) => {
    if (!token) return;

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ disabled: !currentState }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update user");
      }

      await fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update user");
    }
  };

  return (
    <DashboardLayout title="USER MANAGER" time={time}>
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Users
              </CardTitle>
              <Users className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{users.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {activeUsers} active
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Administrators
              </CardTitle>
              <Shield className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{adminUsers}</div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Regular Users
              </CardTitle>
              <UserIcon className="w-4 h-4 text-chart-4" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{users.length - adminUsers}</div>
            </CardContent>
          </Card>
        </div>

        {/* User List */}
        <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
          <CardHeader>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-accent" />
                User Accounts
              </CardTitle>
              <Button
                size="sm"
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="bg-accent hover:bg-accent/90 gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Create User
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
                {error}
              </div>
            )}
            {/* Create User Form */}
            {showCreateForm && (
              <form onSubmit={handleCreateUser} className="p-4 rounded-lg border border-accent/30 bg-accent/5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Create New User</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input 
                      id="username" 
                      placeholder="Enter username" 
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      required
                      minLength={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="display_name">Display Name</Label>
                    <Input 
                      id="display_name" 
                      placeholder="Enter display name" 
                      value={newUser.display_name}
                      onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" placeholder="Enter password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <select
                      id="role"
                      className="w-full h-10 px-3 rounded-md border border-border bg-input text-foreground"
                    >
                      <option value="user">User</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewUser({ username: "", display_name: "", password: "", role: "viewer" });
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    size="sm" 
                    className="bg-accent hover:bg-accent/90"
                    disabled={isCreating}
                  >
                    {isCreating ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </form>
            )}

            {/* Users Table */}
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className={`p-4 rounded-lg border transition-colors ${
                    user.disabled
                      ? "border-border/30 bg-background/20 opacity-60"
                      : "border-border/50 bg-background/40 hover:bg-background/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center">
                        <span className="text-accent font-bold">
                          {user.username[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground">{user.username}</h3>
                          {user.role === "admin" && (
                            <span className="px-2 py-0.5 rounded text-xs bg-primary/10 border border-primary/30 text-primary">
                              ADMIN
                            </span>
                          )}
                          {user.disabled && (
                            <span className="px-2 py-0.5 rounded text-xs bg-destructive/10 border border-destructive/30 text-destructive">
                              DISABLED
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{user.display_name}</span>
                          <span>•</span>
                          <span>Created: {new Date(user.created_at).toLocaleDateString()}</span>
                          {user.last_login && (
                            <>
                              <span>•</span>
                              <span>Last login: {new Date(user.last_login).toLocaleDateString()}</span>
                            </>
                          )}
                          <span>•</span>
                          <span className="uppercase">{user.role}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openGroupModal(user)}
                        className="gap-2"
                      >
                        <UsersRound className="w-3 h-3" />
                        Groups
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleUser(user.id, user.disabled)}
                        className="gap-2"
                      >
                        {user.disabled ? "Enable" : "Disable"}
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Edit className="w-3 h-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Group Assignment Modal */}
        {showGroupModal && selectedUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div>
                  <h2 className="text-lg font-semibold">Manage Groups</h2>
                  <p className="text-sm text-muted-foreground">
                    Assign {selectedUser.username} to groups
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeGroupModal}
                  className="h-8 w-8 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-4 max-h-96 overflow-y-auto">
                {isLoadingGroups ? (
                  <div className="flex items-center justify-center py-8">
                    <Activity className="w-6 h-6 text-accent animate-pulse" />
                  </div>
                ) : groups.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <UsersRound className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No groups available</p>
                    <p className="text-xs mt-1">Create groups in the Group Manager</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groups.map((group) => {
                      const isMember = userGroups.includes(group.id);
                      return (
                        <button
                          key={group.id}
                          onClick={() => toggleGroupMembership(group.id)}
                          className={`w-full p-3 rounded-lg border transition-colors flex items-center justify-between ${
                            isMember
                              ? "border-accent bg-accent/10 hover:bg-accent/20"
                              : "border-border hover:bg-background/60"
                          }`}
                        >
                          <div className="text-left">
                            <div className="font-medium">{group.display_name}</div>
                            <div className="text-xs text-muted-foreground">{group.name}</div>
                            {group.description && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {group.description}
                              </div>
                            )}
                          </div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            isMember
                              ? "border-accent bg-accent text-accent-foreground"
                              : "border-muted-foreground"
                          }`}>
                            {isMember && <Check className="w-4 h-4" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex justify-end p-4 border-t border-border">
                <Button variant="outline" size="sm" onClick={closeGroupModal}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
