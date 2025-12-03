'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Activity, Users, Shield, AlertCircle, UserPlus, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Group {
  id: number
  name: string
  display_name: string
  description: string
  system_gid?: string
  created_at: string
}

interface SystemGroup {
  name: string
  gid: string
  members: string[]
}

export default function GroupManagerPage() {
  const { isAuthenticated, isLoading, user: currentUser, token } = useAuth()
  const router = useRouter()
  const [time, setTime] = useState<string>('')
  const [groups, setGroups] = useState<Group[]>([])
  const [systemGroups, setSystemGroups] = useState<SystemGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [activeTab, setActiveTab] = useState('stardeck')
  const [error, setError] = useState<string | null>(null)
  const [selectedSystemGroup, setSelectedSystemGroup] = useState<SystemGroup | null>(null)
  const [newMemberUsername, setNewMemberUsername] = useState('')
  const [addingMember, setAddingMember] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    description: '',
    sync_to_system: false,
  })

  const fetchGroups = useCallback(async () => {
    if (!token) return

    try {
      const response = await fetch('/api/groups', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch groups')
      }

      const data = await response.json()
      setGroups(data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups')
    } finally {
      setLoading(false)
    }
  }, [token])

  const fetchSystemGroups = useCallback(async () => {
    if (!token) return

    try {
      const response = await fetch('/api/system/groups', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch system groups')
      }

      const data = await response.json()
      setSystemGroups(data || [])
    } catch (err) {
      console.error('Failed to fetch system groups:', err)
    }
  }, [token])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    } else if (!isLoading && currentUser?.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [isAuthenticated, isLoading, currentUser, router])

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-US', { hour12: false }))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (isAuthenticated && currentUser?.role === 'admin' && token) {
      fetchGroups()
      fetchSystemGroups()
    }
  }, [isAuthenticated, currentUser, token, fetchGroups, fetchSystemGroups])

  if (isLoading || !isAuthenticated || currentUser?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Activity className="w-12 h-12 text-accent animate-pulse" />
      </div>
    )
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create group')
      }

      setShowCreateForm(false)
      fetchGroups()
      if (formData.sync_to_system) {
        fetchSystemGroups()
      }
      setFormData({
        name: '',
        display_name: '',
        description: '',
        sync_to_system: false,
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create group')
    }
  }

  const handleDelete = async (id: number) => {
    if (!token || !confirm('Are you sure you want to delete this group?')) return

    try {
      const response = await fetch(`/api/groups/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error('Failed to delete group')
      }

      fetchGroups()
      fetchSystemGroups()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete group')
    }
  }

  const addSystemGroupMember = async (groupName: string, username: string) => {
    if (!token || !username.trim()) return

    setAddingMember(true)
    try {
      const response = await fetch(`/api/system/groups/${encodeURIComponent(groupName)}/members`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim() }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to add user to group')
      }

      await fetchSystemGroups()
      setNewMemberUsername('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add user to group')
    } finally {
      setAddingMember(false)
    }
  }

  const removeSystemGroupMember = async (groupName: string, username: string) => {
    if (!token || !confirm(`Remove ${username} from ${groupName}?`)) return

    try {
      const response = await fetch(
        `/api/system/groups/${encodeURIComponent(groupName)}/members/${encodeURIComponent(username)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to remove user from group')
      }

      await fetchSystemGroups()
      // Update the selected group if it's the one we modified
      if (selectedSystemGroup?.name === groupName) {
        const updated = systemGroups.find(g => g.name === groupName)
        if (updated) {
          setSelectedSystemGroup({
            ...updated,
            members: (updated.members || []).filter(m => m !== username)
          })
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove user from group')
    }
  }

  const syncedGroups = groups.filter((g) => g.system_gid).length
  const adminGroups = systemGroups.filter((g) => g.name === 'wheel' || g.name === 'sudo').length

  return (
    <DashboardLayout title="GROUP MANAGER" time={time}>
      <div className="p-6 space-y-6">
        {/* Error message */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Stardeck Groups
              </CardTitle>
              <Users className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{groups.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {syncedGroups} synced to system
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                System Groups
              </CardTitle>
              <Shield className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{systemGroups.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {adminGroups} admin group{adminGroups !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setShowCreateForm(!showCreateForm)} className="w-full">
                {showCreateForm ? 'Cancel' : 'Create Group'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {showCreateForm && (
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Create New Group</CardTitle>
              <CardDescription>
                Create a new user group for permission management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Group Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="developers"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="display_name">Display Name</Label>
                    <Input
                      id="display_name"
                      value={formData.display_name}
                      onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                      placeholder="Developers"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Development team members"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="sync_to_system"
                    checked={formData.sync_to_system}
                    onCheckedChange={(checked) => setFormData({ ...formData, sync_to_system: checked })}
                  />
                  <Label htmlFor="sync_to_system">Create as Linux system group</Label>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create Group</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="stardeck">Stardeck Groups</TabsTrigger>
            <TabsTrigger value="system">System Groups</TabsTrigger>
          </TabsList>

          <TabsContent value="stardeck" className="space-y-4">
            {loading ? (
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardContent className="p-6 text-center text-muted-foreground">
                  Loading groups...
                </CardContent>
              </Card>
            ) : groups.length === 0 ? (
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardContent className="p-6 text-center text-muted-foreground">
                  No groups configured. Create your first group to get started.
                </CardContent>
              </Card>
            ) : (
              groups.map((group) => (
                <Card key={group.id} className="border-border/60 bg-card/70 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {group.display_name}
                          {group.system_gid && (
                            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                              System: GID {group.system_gid}
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription>{group.name}</CardDescription>
                      </div>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDelete(group.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-2">{group.description}</p>
                    <div className="text-xs text-muted-foreground">
                      Created: {new Date(group.created_at).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="system" className="space-y-4">
            {systemGroups.length === 0 ? (
              <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardContent className="p-6 text-center text-muted-foreground">
                  No system groups available.
                </CardContent>
              </Card>
            ) : (
              systemGroups.map((group) => (
                <Card key={group.gid} className="border-border/60 bg-card/70 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {group.name}
                          <span className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                            GID {group.gid}
                          </span>
                          {(group.name === 'wheel' || group.name === 'sudo') && (
                            <span className="text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 px-2 py-1 rounded">
                              Admin Group
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription>
                          {(group.members || []).length} member{(group.members || []).length !== 1 ? 's' : ''}
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedSystemGroup(group)}
                      >
                        <UserPlus className="w-4 h-4 mr-1" />
                        Manage
                      </Button>
                    </div>
                  </CardHeader>
                  {(group.members || []).length > 0 && (
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {(group.members || []).map((member) => (
                          <span
                            key={member}
                            className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded flex items-center gap-1"
                          >
                            {member}
                            <button
                              onClick={() => removeSystemGroupMember(group.name, member)}
                              className="ml-1 hover:text-red-500"
                              title={`Remove ${member} from ${group.name}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Add Member Dialog */}
        <Dialog open={!!selectedSystemGroup} onOpenChange={(open) => !open && setSelectedSystemGroup(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage {selectedSystemGroup?.name} Members</DialogTitle>
              <DialogDescription>
                Add or remove users from the {selectedSystemGroup?.name} group.
                {(selectedSystemGroup?.name === 'wheel' || selectedSystemGroup?.name === 'sudo') && (
                  <span className="block mt-1 text-amber-600 dark:text-amber-400">
                    Warning: This is an admin group. Members will have sudo privileges.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Add new member */}
              <div className="flex gap-2">
                <Input
                  placeholder="Username to add..."
                  value={newMemberUsername}
                  onChange={(e) => setNewMemberUsername(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && selectedSystemGroup) {
                      addSystemGroupMember(selectedSystemGroup.name, newMemberUsername)
                    }
                  }}
                />
                <Button
                  onClick={() => selectedSystemGroup && addSystemGroupMember(selectedSystemGroup.name, newMemberUsername)}
                  disabled={addingMember || !newMemberUsername.trim()}
                >
                  {addingMember ? 'Adding...' : 'Add'}
                </Button>
              </div>

              {/* Current members */}
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">Current Members</Label>
                {(selectedSystemGroup?.members || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No members</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(selectedSystemGroup?.members || []).map((member) => (
                      <span
                        key={member}
                        className="text-sm bg-muted px-3 py-1 rounded-full flex items-center gap-2"
                      >
                        {member}
                        <button
                          onClick={() => selectedSystemGroup && removeSystemGroupMember(selectedSystemGroup.name, member)}
                          className="hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
