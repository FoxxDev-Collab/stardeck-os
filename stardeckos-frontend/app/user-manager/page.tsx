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
  is_pam_admin?: boolean; // True if PAM user is in wheel/sudo group or is root
}

interface Group {
  id: number;
  name: string;
  display_name: string;
  description?: string;
}

// Password complexity validation
const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("At least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("One uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("One lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("One number");
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("One special character");
  }

  return { valid: errors.length === 0, errors };
};

export default function UserManagerPage() {
  const { isAuthenticated, isLoading, user: currentUser, token } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [users, setUsers] = useState<User[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState<{ username: string; display_name: string; password: string; role: "admin" | "operator" | "viewer" }>({ username: "", display_name: "", password: "", role: "viewer" });
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Group management state
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userGroups, setUserGroups] = useState<number[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);

  // Edit user state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<{ display_name: string; password: string; role: "admin" | "operator" | "viewer" }>({ display_name: "", password: "", role: "viewer" });
  const [isEditing, setIsEditing] = useState(false);

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

  const openEditModal = (user: User) => {
    setEditUser(user);
    setEditForm({
      display_name: user.display_name,
      password: "",
      role: user.role,
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditUser(null);
    setEditForm({ display_name: "", password: "", role: "viewer" });
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editUser) return;

    // Validate password if provided
    if (editForm.password && !validatePassword(editForm.password).valid) {
      alert("Password does not meet complexity requirements");
      return;
    }

    setIsEditing(true);
    try {
      const updateData: { display_name: string; role: string; password?: string } = {
        display_name: editForm.display_name,
        role: editForm.role,
      };

      // Only include password if it was changed
      if (editForm.password) {
        updateData.password = editForm.password;
      }

      const response = await fetch(`/api/users/${editUser.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update user");
      }

      await fetchUsers();
      closeEditModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setIsEditing(false);
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
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value.toLowerCase().replace(/[^a-z0-9_\-]/g, '') })}
                      required
                      minLength={3}
                      pattern="[a-z0-9_\-]+"
                      title="Lowercase letters, numbers, underscores, and hyphens only"
                    />
                    <p className="text-xs text-muted-foreground">Lowercase letters, numbers, _, -</p>
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
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      required
                      minLength={8}
                    />
                    {newUser.password && (
                      <div className="space-y-1">
                        {(() => {
                          const { valid, errors } = validatePassword(newUser.password);
                          if (valid) {
                            return (
                              <p className="text-xs text-green-500 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Password meets requirements
                              </p>
                            );
                          }
                          return (
                            <div className="text-xs text-muted-foreground">
                              <p className="mb-1">Required:</p>
                              <ul className="list-disc list-inside space-y-0.5">
                                {errors.map((err, i) => (
                                  <li key={i} className="text-destructive/80">{err}</li>
                                ))}
                              </ul>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <select
                      id="role"
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value as "admin" | "operator" | "viewer" })}
                      className="w-full h-10 px-3 rounded-md border border-border bg-input text-foreground"
                    >
                      <option value="viewer">Viewer (Read-only)</option>
                      <option value="operator">Operator (View + Control)</option>
                      <option value="admin">Administrator (Full Access)</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {newUser.role === "admin" && "Full system access including user management"}
                      {newUser.role === "operator" && "Can view and control services, but cannot modify settings"}
                      {newUser.role === "viewer" && "Read-only access to dashboards and logs"}
                    </p>
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
                    disabled={isCreating || !validatePassword(newUser.password).valid || !newUser.username || !newUser.display_name}
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
                          {user.is_pam_admin && (
                            <span className="px-2 py-0.5 rounded text-xs bg-chart-2/10 border border-chart-2/30 text-chart-2">
                              SUDO
                            </span>
                          )}
                          {user.auth_type === "pam" && (
                            <span className="px-2 py-0.5 rounded text-xs bg-chart-4/10 border border-chart-4/30 text-chart-4">
                              PAM
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(user)}
                        className="gap-2"
                      >
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

        {/* Edit User Modal */}
        {showEditModal && editUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div>
                  <h2 className="text-lg font-semibold">Edit User</h2>
                  <p className="text-sm text-muted-foreground">
                    Editing {editUser.username}
                    {editUser.auth_type === "pam" && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs bg-chart-4/10 border border-chart-4/30 text-chart-4">
                        PAM User
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeEditModal}
                  className="h-8 w-8 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <form onSubmit={handleEditUser} className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_display_name">Display Name</Label>
                  <Input
                    id="edit_display_name"
                    value={editForm.display_name}
                    onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_role">Role</Label>
                  <select
                    id="edit_role"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value as "admin" | "operator" | "viewer" })}
                    className="w-full h-10 px-3 rounded-md border border-border bg-input text-foreground"
                  >
                    <option value="viewer">Viewer (Read-only)</option>
                    <option value="operator">Operator (View + Control)</option>
                    <option value="admin">Administrator (Full Access)</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {editForm.role === "admin" && "Full system access including user management"}
                    {editForm.role === "operator" && "Can view and control services, but cannot modify settings"}
                    {editForm.role === "viewer" && "Read-only access to dashboards and logs"}
                  </p>
                  {editUser.is_pam_admin && (
                    <p className="text-xs text-chart-2">
                      Note: This user is in the wheel/sudo group and has system admin privileges regardless of role.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_password">New Password (leave empty to keep current)</Label>
                  <Input
                    id="edit_password"
                    type="password"
                    placeholder="Enter new password"
                    value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  />
                  {editForm.password && (
                    <div className="space-y-1">
                      {(() => {
                        const { valid, errors } = validatePassword(editForm.password);
                        if (valid) {
                          return (
                            <p className="text-xs text-green-500 flex items-center gap-1">
                              <Check className="w-3 h-3" /> Password meets requirements
                            </p>
                          );
                        }
                        return (
                          <div className="text-xs text-muted-foreground">
                            <p className="mb-1">Required:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {errors.map((err, i) => (
                                <li key={i} className="text-destructive/80">{err}</li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={closeEditModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="bg-accent hover:bg-accent/90"
                    disabled={isEditing || !editForm.display_name || (editForm.password.length > 0 && !validatePassword(editForm.password).valid)}
                  >
                    {isEditing ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
