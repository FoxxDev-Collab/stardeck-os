'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Activity, Globe, Shield, AlertCircle } from 'lucide-react'

interface Realm {
  id: number
  name: string
  display_name: string
  type: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export default function RealmManagerPage() {
  const { isAuthenticated, isLoading, user: currentUser, token } = useAuth()
  const router = useRouter()
  const [time, setTime] = useState<string>('')
  const [realms, setRealms] = useState<Realm[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    type: 'local',
    enabled: true,
    config: {
      default_role: 'viewer',
      auto_create_users: false,
      sync_groups: false,
    }
  })

  const fetchRealms = useCallback(async () => {
    if (!token) return

    try {
      const response = await fetch('/api/realms', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch realms')
      }

      const data = await response.json()
      setRealms(data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load realms')
    } finally {
      setLoading(false)
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
      fetchRealms()
    }
  }, [isAuthenticated, currentUser, token, fetchRealms])

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
      const response = await fetch('/api/realms', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create realm')
      }

      setShowCreateForm(false)
      fetchRealms()
      setFormData({
        name: '',
        display_name: '',
        type: 'local',
        enabled: true,
        config: {
          default_role: 'viewer',
          auto_create_users: false,
          sync_groups: false,
        }
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create realm')
    }
  }

  const handleToggleEnabled = async (id: number, enabled: boolean) => {
    if (!token) return

    try {
      const response = await fetch(`/api/realms/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: !enabled })
      })

      if (!response.ok) {
        throw new Error('Failed to update realm')
      }

      fetchRealms()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update realm')
    }
  }

  const handleDelete = async (id: number) => {
    if (!token || !confirm('Are you sure you want to delete this realm?')) return

    try {
      const response = await fetch(`/api/realms/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error('Failed to delete realm')
      }

      fetchRealms()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete realm')
    }
  }

  const enabledRealms = realms.filter((r) => r.enabled).length

  return (
    <DashboardLayout title="REALM MANAGER" time={time}>
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
                Total Realms
              </CardTitle>
              <Globe className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{realms.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {enabledRealms} enabled
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Realm Types
              </CardTitle>
              <Shield className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {new Set(realms.map((r) => r.type)).size}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Authentication methods
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
                {showCreateForm ? 'Cancel' : 'Create Realm'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {showCreateForm && (
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Create New Realm</CardTitle>
              <CardDescription>
                Configure a new authentication realm for your organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Realm Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="internal"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="display_name">Display Name</Label>
                    <Input
                      id="display_name"
                      value={formData.display_name}
                      onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                      placeholder="Internal Users"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="type">Realm Type</Label>
                    <Select 
                      value={formData.type} 
                      onValueChange={(value) => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Local</SelectItem>
                        <SelectItem value="pam">PAM (System Users)</SelectItem>
                        <SelectItem value="ldap">LDAP/Active Directory</SelectItem>
                        <SelectItem value="oidc">OpenID Connect</SelectItem>
                        <SelectItem value="saml">SAML 2.0</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="default_role">Default Role</Label>
                    <Select 
                      value={formData.config.default_role} 
                      onValueChange={(value) => setFormData({ 
                        ...formData, 
                        config: { ...formData.config, default_role: value }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="operator">Operator</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="enabled"
                    checked={formData.enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                  />
                  <Label htmlFor="enabled">Enable realm immediately</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="auto_create"
                    checked={formData.config.auto_create_users}
                    onCheckedChange={(checked) => setFormData({ 
                      ...formData, 
                      config: { ...formData.config, auto_create_users: checked }
                    })}
                  />
                  <Label htmlFor="auto_create">Auto-create users on first login</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="sync_groups"
                    checked={formData.config.sync_groups}
                    onCheckedChange={(checked) => setFormData({ 
                      ...formData, 
                      config: { ...formData.config, sync_groups: checked }
                    })}
                  />
                  <Label htmlFor="sync_groups">Synchronize group memberships</Label>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create Realm</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {loading ? (
            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardContent className="p-6 text-center text-muted-foreground">
                Loading realms...
              </CardContent>
            </Card>
          ) : realms.length === 0 ? (
            <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
              <CardContent className="p-6 text-center text-muted-foreground">
                No realms configured. Create your first realm to get started.
              </CardContent>
            </Card>
          ) : (
            realms.map((realm) => (
              <Card key={realm.id} className="border-border/60 bg-card/70 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {realm.display_name}
                        {!realm.enabled && (
                          <span className="text-sm font-normal text-muted-foreground">(Disabled)</span>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {realm.name} • Type: {realm.type}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={realm.enabled}
                        onCheckedChange={() => handleToggleEnabled(realm.id, realm.enabled)}
                      />
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDelete(realm.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    Created: {new Date(realm.created_at).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
