"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Activity, HardDrive, Database, Disc, Layers, Plus, Trash2, Settings2, MoreVertical, FolderInput, FolderOutput, RefreshCw, AlertTriangle } from "lucide-react";

interface Disk {
  name: string;
  path: string;
  size: number;
  size_human: string;
  type: string;
  model: string;
  rotational: boolean;
  mount_point?: string;
  fstype?: string;
  partitions?: Disk[];
}

interface Mount {
  device: string;
  mount_point: string;
  fstype: string;
  options: string;
  total: number;
  used: number;
  available: number;
  use_percent: number;
}

interface LogicalVolume {
  name: string;
  vg_name: string;
  size: number;
  size_human: string;
  path: string;
  active: boolean;
  mount_point?: string;
}

interface VolumeGroup {
  name: string;
  size: number;
  size_human: string;
  free: number;
  free_human: string;
  pv_count: number;
  lv_count: number;
}

interface LVMInfo {
  volume_groups: VolumeGroup[];
  logical_volumes: LogicalVolume[];
  physical_volumes: { name: string; vg_name: string; size_human: string; free_human: string }[];
}

interface OperationResult {
  success: boolean;
  message: string;
  output?: string;
}

export default function StorageManagerPage() {
  const { isAuthenticated, isLoading, token, user } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState<string>("");
  const [disks, setDisks] = useState<Disk[]>([]);
  const [mounts, setMounts] = useState<Mount[]>([]);
  const [lvm, setLvm] = useState<LVMInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dialog states
  const [createPartitionDialog, setCreatePartitionDialog] = useState(false);
  const [formatDialog, setFormatDialog] = useState(false);
  const [mountDialog, setMountDialog] = useState(false);
  const [unmountDialog, setUnmountDialog] = useState(false);
  const [deletePartitionDialog, setDeletePartitionDialog] = useState(false);
  const [resultDialog, setResultDialog] = useState(false);
  const [operationResult, setOperationResult] = useState<OperationResult | null>(null);

  // Form states
  const [selectedDisk, setSelectedDisk] = useState<Disk | null>(null);
  const [selectedPartition, setSelectedPartition] = useState<Disk | null>(null);
  const [selectedMount, setSelectedMount] = useState<Mount | null>(null);
  const [partitionSize, setPartitionSize] = useState("");
  const [fsType, setFsType] = useState("ext4");
  const [label, setLabel] = useState("");
  const [mountPoint, setMountPoint] = useState("");
  const [partitionNumber, setPartitionNumber] = useState(1);

  // Check if user can manage storage (admin or operator role)
  const canManageStorage = user?.role === "admin" || user?.role === "operator";

  const fetchStorageData = useCallback(async () => {
    if (!token) return;

    try {
      setIsRefreshing(true);
      const [disksRes, mountsRes, lvmRes] = await Promise.all([
        fetch("/api/storage/disks", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/storage/mounts", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/storage/lvm", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (!disksRes.ok || !mountsRes.ok || !lvmRes.ok) {
        throw new Error("Failed to fetch storage data");
      }

      const [disksData, mountsData, lvmData] = await Promise.all([
        disksRes.json(),
        mountsRes.json(),
        lvmRes.json(),
      ]);

      setDisks(disksData || []);
      setMounts(mountsData || []);
      setLvm(lvmData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load storage data");
    } finally {
      setIsRefreshing(false);
    }
  }, [token]);

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
      fetchStorageData();
      const interval = setInterval(fetchStorageData, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, token, fetchStorageData]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // API calls for storage operations
  const createPartition = async () => {
    if (!selectedDisk || !token) return;

    try {
      const res = await fetch("/api/storage/partitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          device: selectedDisk.path,
          size_mb: partitionSize ? parseInt(partitionSize) : 0,
          fstype: fsType,
          label: label,
        }),
      });

      const result = await res.json();
      setOperationResult(result);
      setResultDialog(true);
      setCreatePartitionDialog(false);
      if (result.success) {
        fetchStorageData();
      }
    } catch (err) {
      setOperationResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to create partition",
      });
      setResultDialog(true);
    }
  };

  const formatPartition = async () => {
    if (!selectedPartition || !token) return;

    try {
      const res = await fetch("/api/storage/format", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          device: selectedPartition.path,
          fstype: fsType,
          label: label,
          force: true,
        }),
      });

      const result = await res.json();
      setOperationResult(result);
      setResultDialog(true);
      setFormatDialog(false);
      if (result.success) {
        fetchStorageData();
      }
    } catch (err) {
      setOperationResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to format partition",
      });
      setResultDialog(true);
    }
  };

  const mountPartition = async () => {
    if (!selectedPartition || !mountPoint || !token) return;

    try {
      const res = await fetch("/api/storage/mount", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          device: selectedPartition.path,
          mount_point: mountPoint,
          fstype: selectedPartition.fstype || "",
        }),
      });

      const result = await res.json();
      setOperationResult(result);
      setResultDialog(true);
      setMountDialog(false);
      if (result.success) {
        fetchStorageData();
      }
    } catch (err) {
      setOperationResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to mount partition",
      });
      setResultDialog(true);
    }
  };

  const unmountPartition = async () => {
    if (!selectedMount || !token) return;

    try {
      const res = await fetch("/api/storage/unmount", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mount_point: selectedMount.mount_point,
        }),
      });

      const result = await res.json();
      setOperationResult(result);
      setResultDialog(true);
      setUnmountDialog(false);
      if (result.success) {
        fetchStorageData();
      }
    } catch (err) {
      setOperationResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to unmount",
      });
      setResultDialog(true);
    }
  };

  const deletePartition = async () => {
    if (!selectedDisk || !token) return;

    try {
      const res = await fetch("/api/storage/partitions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          device: selectedDisk.path,
          partition: partitionNumber,
        }),
      });

      const result = await res.json();
      setOperationResult(result);
      setResultDialog(true);
      setDeletePartitionDialog(false);
      if (result.success) {
        fetchStorageData();
      }
    } catch (err) {
      setOperationResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to delete partition",
      });
      setResultDialog(true);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Activity className="w-12 h-12 text-accent animate-pulse" />
      </div>
    );
  }

  const totalDiskSpace = mounts.reduce((acc, m) => acc + m.total, 0);
  const totalDiskUsed = mounts.reduce((acc, m) => acc + m.used, 0);

  return (
    <DashboardLayout title="STORAGE MANAGER" time={time}>
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Storage
              </CardTitle>
              <HardDrive className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatBytes(totalDiskSpace)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatBytes(totalDiskUsed)} used
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Physical Disks
              </CardTitle>
              <Disc className="w-4 h-4 text-chart-3" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{disks.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {disks.filter((d) => !d.rotational).length} SSD/NVMe
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Mount Points
              </CardTitle>
              <Database className="w-4 h-4 text-chart-4" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{mounts.length}</div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                LVM Volumes
              </CardTitle>
              <Layers className="w-4 h-4 text-chart-5" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{lvm?.logical_volumes?.length || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Physical Disks */}
        <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Disc className="w-5 h-5 text-chart-3" />
              Physical Disks
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchStorageData()}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="p-4 mb-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-4">
              {disks.map((disk) => (
                <div
                  key={disk.path}
                  className="p-4 rounded-lg border border-border/50 bg-background/40"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground font-mono">{disk.name}</h3>
                        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">
                          {disk.type}
                        </span>
                        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">
                          {disk.rotational ? "HDD" : "SSD/NVMe"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{disk.model}</span>
                        <span>•</span>
                        <span>{disk.size_human}</span>
                        <span>•</span>
                        <span className="font-mono">{disk.path}</span>
                      </div>
                    </div>
                    {canManageStorage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedDisk(disk);
                              setPartitionSize("");
                              setFsType("ext4");
                              setLabel("");
                              setCreatePartitionDialog(true);
                            }}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Create Partition
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setSelectedDisk(disk);
                              setPartitionNumber(1);
                              setDeletePartitionDialog(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Partition
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* Partitions */}
                  {disk.partitions && disk.partitions.length > 0 && (
                    <div className="mt-3 pl-4 border-l-2 border-border/50 space-y-2">
                      {disk.partitions.map((part) => (
                        <div
                          key={part.path}
                          className="flex items-center justify-between p-2 rounded bg-muted/30"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm">{part.name}</span>
                            <span className="text-xs text-muted-foreground">{part.size_human}</span>
                            {part.fstype && (
                              <span className="text-xs px-2 py-0.5 rounded bg-muted">{part.fstype}</span>
                            )}
                            {part.mount_point && (
                              <span className="text-xs text-accent">{part.mount_point}</span>
                            )}
                          </div>
                          {canManageStorage && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Settings2 className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedPartition(part);
                                    setFsType("ext4");
                                    setLabel("");
                                    setFormatDialog(true);
                                  }}
                                >
                                  <Settings2 className="w-4 h-4 mr-2" />
                                  Format
                                </DropdownMenuItem>
                                {!part.mount_point && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedPartition(part);
                                      setMountPoint("");
                                      setMountDialog(true);
                                    }}
                                  >
                                    <FolderInput className="w-4 h-4 mr-2" />
                                    Mount
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Mount Points */}
        <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-chart-4" />
              Mount Points
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mounts.map((mount) => (
                <div
                  key={mount.device + mount.mount_point}
                  className="p-4 rounded-lg border border-border/50 bg-background/40 hover:bg-background/60 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">{mount.mount_point}</h3>
                        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">
                          {mount.fstype}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {mount.device}
                      </div>
                    </div>
                    {canManageStorage && mount.mount_point !== "/" && !mount.mount_point.startsWith("/boot") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedMount(mount);
                          setUnmountDialog(true);
                        }}
                      >
                        <FolderOutput className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Used</span>
                      <span className="font-mono">
                        {formatBytes(mount.used)} / {formatBytes(mount.total)}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          mount.use_percent > 90
                            ? "bg-destructive"
                            : mount.use_percent > 70
                            ? "bg-yellow-500"
                            : "bg-chart-4"
                        }`}
                        style={{ width: `${mount.use_percent}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 text-right">
                      {mount.use_percent.toFixed(1)}% used
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* LVM Volumes */}
        <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-chart-5" />
              LVM Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Volume Groups */}
            {lvm?.volume_groups && lvm.volume_groups.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Volume Groups</h4>
                <div className="space-y-2">
                  {lvm.volume_groups.map((vg) => (
                    <div
                      key={vg.name}
                      className="p-3 rounded-lg border border-border/50 bg-background/40"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{vg.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {vg.size_human} total, {vg.free_human} free
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {vg.pv_count} PV(s), {vg.lv_count} LV(s)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Logical Volumes */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Logical Volumes</h4>
              <div className="space-y-2">
                {lvm?.logical_volumes && lvm.logical_volumes.length > 0 ? (
                  lvm.logical_volumes.map((volume) => (
                    <div
                      key={volume.path}
                      className="p-4 rounded-lg border border-border/50 bg-background/40 hover:bg-background/60 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-foreground mb-1">
                            {volume.vg_name}/{volume.name}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Size: {volume.size_human}</span>
                            {volume.mount_point && (
                              <>
                                <span>•</span>
                                <span className="text-accent">Mounted: {volume.mount_point}</span>
                              </>
                            )}
                            <span>•</span>
                            <span className={volume.active ? "text-green-500" : "text-yellow-500"}>
                              {volume.active ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No LVM volumes configured</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Partition Dialog */}
      <Dialog open={createPartitionDialog} onOpenChange={setCreatePartitionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Partition</DialogTitle>
            <DialogDescription>
              Create a new partition on {selectedDisk?.path}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Size (MB)</Label>
              <Input
                type="number"
                placeholder="Leave empty to use all available space"
                value={partitionSize}
                onChange={(e) => setPartitionSize(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Filesystem Type (optional)</Label>
              <Select value={fsType} onValueChange={setFsType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ext4">ext4</SelectItem>
                  <SelectItem value="xfs">XFS</SelectItem>
                  <SelectItem value="swap">Swap</SelectItem>
                  <SelectItem value="vfat">FAT32</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Label (optional)</Label>
              <Input
                placeholder="Partition label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePartitionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createPartition}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Format Partition Dialog */}
      <Dialog open={formatDialog} onOpenChange={setFormatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Format Partition
            </DialogTitle>
            <DialogDescription>
              Format {selectedPartition?.path}. This will DESTROY all data on the partition.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Filesystem Type</Label>
              <Select value={fsType} onValueChange={setFsType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ext4">ext4</SelectItem>
                  <SelectItem value="xfs">XFS</SelectItem>
                  <SelectItem value="swap">Swap</SelectItem>
                  <SelectItem value="vfat">FAT32</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Label (optional)</Label>
              <Input
                placeholder="Filesystem label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormatDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={formatPartition}>
              Format
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mount Dialog */}
      <Dialog open={mountDialog} onOpenChange={setMountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mount Partition</DialogTitle>
            <DialogDescription>
              Mount {selectedPartition?.path} to a directory
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Mount Point</Label>
              <Input
                placeholder="/mnt/data"
                value={mountPoint}
                onChange={(e) => setMountPoint(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMountDialog(false)}>
              Cancel
            </Button>
            <Button onClick={mountPartition}>Mount</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unmount Dialog */}
      <AlertDialog open={unmountDialog} onOpenChange={setUnmountDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unmount Filesystem</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unmount {selectedMount?.mount_point}?
              Make sure no processes are using this filesystem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={unmountPartition}>Unmount</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Partition Dialog */}
      <AlertDialog open={deletePartitionDialog} onOpenChange={setDeletePartitionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete Partition
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete a partition from {selectedDisk?.path}.
              All data on the partition will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>Partition Number</Label>
            <Input
              type="number"
              min={1}
              value={partitionNumber}
              onChange={(e) => setPartitionNumber(parseInt(e.target.value) || 1)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deletePartition}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Result Dialog */}
      <Dialog open={resultDialog} onOpenChange={setResultDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={operationResult?.success ? "text-green-500" : "text-destructive"}>
              {operationResult?.success ? "Operation Successful" : "Operation Failed"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>{operationResult?.message}</p>
            {operationResult?.output && (
              <pre className="mt-4 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-48">
                {operationResult.output}
              </pre>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setResultDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
