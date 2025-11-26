"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  Folder,
  FolderOpen,
  File,
  FileText,
  FileCode,
  FileImage,
  FileArchive,
  FileCog,
  FileJson,
  ChevronRight,
  ChevronDown,
  Home,
  Upload,
  FolderPlus,
  FilePlus,
  Download,
  Trash2,
  Edit3,
  RefreshCw,
  ArrowUp,
  Lock,
  Link2,
  Loader2,
  Save,
  X,
  Eye,
  Copy,
  Scissors,
  Clipboard,
  HardDrive,
  Settings,
} from "lucide-react";

interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mode: string;
  permissions: string;
  owner: string;
  group: string;
  owner_uid: number;
  group_gid: number;
  mod_time: string;
  is_symlink: boolean;
  link_target?: string;
  extension?: string;
  mime_type?: string;
}

interface DirectoryListing {
  path: string;
  parent: string;
  files: FileInfo[];
  total: number;
  can_write: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
  isExpanded?: boolean;
  isLoading?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileIcon(file: FileInfo, size: "sm" | "md" | "lg" = "sm") {
  const sizeClass = size === "lg" ? "w-8 h-8" : size === "md" ? "w-6 h-6" : "w-4 h-4";

  if (file.is_dir) {
    return <Folder className={`${sizeClass} text-chart-3`} />;
  }

  if (file.is_symlink) {
    return <Link2 className={`${sizeClass} text-chart-4`} />;
  }

  const ext = file.extension?.toLowerCase() || "";
  const mime = file.mime_type || "";

  if (mime.startsWith("image/")) {
    return <FileImage className={`${sizeClass} text-chart-5`} />;
  }

  if (mime.startsWith("text/") || ["md", "txt", "log", "conf", "cfg", "ini"].includes(ext)) {
    return <FileText className={`${sizeClass} text-muted-foreground`} />;
  }

  if (["js", "ts", "tsx", "jsx", "py", "go", "rs", "c", "cpp", "h", "java", "sh", "bash", "zsh", "sql", "html", "css", "vue"].includes(ext)) {
    return <FileCode className={`${sizeClass} text-accent`} />;
  }

  if (["json", "yaml", "yml", "xml", "toml"].includes(ext)) {
    return <FileJson className={`${sizeClass} text-chart-2`} />;
  }

  if (["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "rpm", "deb"].includes(ext)) {
    return <FileArchive className={`${sizeClass} text-chart-1`} />;
  }

  if (["exe", "bin", "so", "dll"].includes(ext)) {
    return <FileCog className={`${sizeClass} text-destructive`} />;
  }

  return <File className={`${sizeClass} text-muted-foreground`} />;
}

// Directory Tree Component
function DirectoryTree({
  currentPath,
  onNavigate,
  token
}: {
  currentPath: string;
  onNavigate: (path: string) => void;
  token: string | null;
}) {
  const [tree, setTree] = useState<TreeNode[]>([
    { name: "/", path: "/", isExpanded: true, children: [] }
  ]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(["/"]));

  const loadChildren = useCallback(async (path: string): Promise<TreeNode[]> => {
    if (!token) return [];

    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];

      const data: DirectoryListing = await res.json();
      return data.files
        .filter(f => f.is_dir)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(f => ({
          name: f.name,
          path: f.path,
          children: undefined,
          isExpanded: false,
        }));
    } catch {
      return [];
    }
  }, [token]);

  const toggleExpand = useCallback(async (path: string) => {
    const newExpanded = new Set(expandedPaths);

    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
      // Load children if not loaded
      const updateTree = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
        return Promise.all(nodes.map(async (node) => {
          if (node.path === path && node.children === undefined) {
            const children = await loadChildren(path);
            return { ...node, children, isExpanded: true };
          }
          if (node.children) {
            return { ...node, children: await updateTree(node.children) };
          }
          return node;
        }));
      };
      setTree(await updateTree(tree));
    }

    setExpandedPaths(newExpanded);
  }, [expandedPaths, loadChildren, tree]);

  // Load root children on mount
  useEffect(() => {
    const loadRoot = async () => {
      const children = await loadChildren("/");
      setTree([{ name: "/", path: "/", isExpanded: true, children }]);
    };
    if (token) {
      loadRoot();
    }
  }, [token, loadChildren]);

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedPaths.has(node.path);
    const isSelected = currentPath === node.path;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-1 py-1 px-2 cursor-pointer rounded text-sm transition-colors ${
            isSelected
              ? "bg-accent/20 text-accent"
              : "hover:bg-accent/10 text-foreground"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => onNavigate(node.path)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node.path);
            }}
            className="w-4 h-4 flex items-center justify-center hover:bg-accent/20 rounded"
          >
            {hasChildren || node.children === undefined ? (
              isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )
            ) : (
              <span className="w-3" />
            )}
          </button>
          {isExpanded ? (
            <FolderOpen className="w-4 h-4 text-chart-3 shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-chart-3 shrink-0" />
          )}
          <span className="truncate">{node.name === "/" ? "Root" : node.name}</span>
        </div>
        {isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="text-sm">
      {tree.map(node => renderNode(node))}
    </div>
  );
}

// Quick Access Sidebar
function QuickAccess({ onNavigate }: { onNavigate: (path: string) => void }) {
  const quickLinks = [
    { name: "Root", path: "/", icon: HardDrive },
    { name: "Home", path: "/home", icon: Home },
    { name: "etc", path: "/etc", icon: Settings },
    { name: "var", path: "/var", icon: Folder },
    { name: "tmp", path: "/tmp", icon: Folder },
  ];

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
        Quick Access
      </div>
      {quickLinks.map(link => {
        const Icon = link.icon;
        return (
          <button
            key={link.path}
            onClick={() => onNavigate(link.path)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent/10 transition-colors text-left"
          >
            <Icon className="w-4 h-4 text-muted-foreground" />
            <span>{link.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function FileBrowserContent() {
  const { isAuthenticated, isLoading, token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if user has permission (operator or admin)
  const hasPermission = user?.role === "admin" || user?.role === "operator" || user?.is_pam_admin;

  const [time, setTime] = useState<string>("");
  const [currentPath, setCurrentPath] = useState("/");
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Clipboard
  const [clipboard, setClipboard] = useState<{ files: FileInfo[]; operation: "copy" | "cut" } | null>(null);

  // Dialogs
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  // Form states
  const [newName, setNewName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [permMode, setPermMode] = useState("");
  const [permOwner, setPermOwner] = useState("");
  const [permGroup, setPermGroup] = useState("");
  const [previewContent, setPreviewContent] = useState("");
  const [editingFile, setEditingFile] = useState<FileInfo | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Sidebar state
  const [sidebarWidth] = useState(240);

  const fetchDirectory = useCallback(async (path: string) => {
    if (!token) return;

    setLoading(true);
    setError(null);
    setSelectedFiles(new Set());

    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load directory");
      }

      const data: DirectoryListing = await res.json();

      // Sort: folders first, then by name
      data.files.sort((a, b) => {
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;
        return a.name.localeCompare(b.name);
      });

      setListing(data);
      setCurrentPath(data.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load directory");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    } else if (!isLoading && isAuthenticated && !hasPermission) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, hasPermission, router]);

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
      const pathParam = searchParams.get("path") || "/";
      fetchDirectory(pathParam);
    }
  }, [isAuthenticated, token, searchParams, fetchDirectory]);

  const navigateTo = (path: string) => {
    router.push(`/file-browser?path=${encodeURIComponent(path)}`);
  };

  const handleFileClick = (file: FileInfo, index: number, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      // Toggle selection
      const newSelected = new Set(selectedFiles);
      if (newSelected.has(file.path)) {
        newSelected.delete(file.path);
      } else {
        newSelected.add(file.path);
      }
      setSelectedFiles(newSelected);
      setLastSelectedIndex(index);
    } else if (event.shiftKey && lastSelectedIndex !== null && listing) {
      // Range selection
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const newSelected = new Set(selectedFiles);
      for (let i = start; i <= end; i++) {
        newSelected.add(listing.files[i].path);
      }
      setSelectedFiles(newSelected);
    } else {
      // Single selection
      setSelectedFiles(new Set([file.path]));
      setLastSelectedIndex(index);
    }
  };

  const handleFileDoubleClick = (file: FileInfo) => {
    if (file.is_dir) {
      navigateTo(file.path);
    } else {
      // Open file for editing/preview
      handleEdit(file);
    }
  };

  const getSelectedFiles = (): FileInfo[] => {
    if (!listing) return [];
    return listing.files.filter(f => selectedFiles.has(f.path));
  };

  const handlePreview = async (file: FileInfo) => {
    if (!token || file.is_dir) return;

    try {
      const res = await fetch(`/api/files/preview?path=${encodeURIComponent(file.path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Cannot preview file");
      }

      const data = await res.json();
      setPreviewContent(data.content);
      setEditingFile(file);
      setShowPreview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview file");
    }
  };

  const handleEdit = async (file: FileInfo) => {
    if (!token || file.is_dir) return;

    try {
      const res = await fetch(`/api/files/preview?path=${encodeURIComponent(file.path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Cannot open file");
      }

      const data = await res.json();
      setEditContent(data.content);
      setEditingFile(file);
      setShowEditor(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open file");
    }
  };

  const handleSaveEdit = async () => {
    if (!token || !editingFile) return;

    try {
      const res = await fetch("/api/files/content", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: editingFile.path, content: editContent }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save file");
      }

      setShowEditor(false);
      setEditingFile(null);
      fetchDirectory(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save file");
    }
  };

  const handleDownload = (file: FileInfo) => {
    if (!token || file.is_dir) return;
    window.open(`/api/files/download?path=${encodeURIComponent(file.path)}`, "_blank");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !token) return;

    setUploading(true);
    setUploadProgress(0);

    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append("path", currentPath);
      formData.append("file", files[i]);

      try {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const fileProgress = (e.loaded / e.total) * 100;
            const totalProgress = ((i + fileProgress / 100) / files.length) * 100;
            setUploadProgress(Math.round(totalProgress));
          }
        });

        await new Promise<void>((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed: ${files[i].name}`));
            }
          };
          xhr.onerror = () => reject(new Error("Upload failed"));
          xhr.open("POST", "/api/files/upload");
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          xhr.send(formData);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        break;
      }
    }

    setUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    fetchDirectory(currentPath);
  };

  const handleCreateFolder = async () => {
    if (!token || !newName.trim()) return;

    try {
      const res = await fetch("/api/files/mkdir", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: currentPath, name: newName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create folder");
      }

      setShowNewFolder(false);
      setNewName("");
      fetchDirectory(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    }
  };

  const handleCreateFile = async () => {
    if (!token || !newName.trim()) return;

    try {
      const res = await fetch("/api/files/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: currentPath, name: newName.trim(), content: fileContent }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create file");
      }

      setShowNewFile(false);
      setNewName("");
      setFileContent("");
      fetchDirectory(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create file");
    }
  };

  const handleRename = async () => {
    const selected = getSelectedFiles();
    if (!token || selected.length !== 1 || !newName.trim()) return;

    const file = selected[0];
    const dir = file.path.substring(0, file.path.lastIndexOf("/"));
    const newPath = `${dir}/${newName.trim()}`;

    try {
      const res = await fetch("/api/files/rename", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ old_path: file.path, new_path: newPath }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to rename");
      }

      setShowRename(false);
      setNewName("");
      setSelectedFiles(new Set());
      fetchDirectory(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
    }
  };

  const handleDelete = async () => {
    const selected = getSelectedFiles();
    if (!token || selected.length === 0) return;

    try {
      for (const file of selected) {
        const res = await fetch(`/api/files?path=${encodeURIComponent(file.path)}&recursive=true`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `Failed to delete ${file.name}`);
        }
      }

      setShowDelete(false);
      setSelectedFiles(new Set());
      fetchDirectory(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleCopy = () => {
    const selected = getSelectedFiles();
    if (selected.length > 0) {
      setClipboard({ files: selected, operation: "copy" });
    }
  };

  const handleCut = () => {
    const selected = getSelectedFiles();
    if (selected.length > 0) {
      setClipboard({ files: selected, operation: "cut" });
    }
  };

  const handlePaste = async () => {
    if (!token || !clipboard) return;

    try {
      for (const file of clipboard.files) {
        const destPath = `${currentPath}/${file.name}`;

        if (clipboard.operation === "copy") {
          const res = await fetch("/api/files/copy", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ source: file.path, destination: destPath }),
          });
          if (!res.ok) throw new Error(`Failed to copy ${file.name}`);
        } else {
          const res = await fetch("/api/files/rename", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ old_path: file.path, new_path: destPath }),
          });
          if (!res.ok) throw new Error(`Failed to move ${file.name}`);
        }
      }

      if (clipboard.operation === "cut") {
        setClipboard(null);
      }
      fetchDirectory(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paste failed");
    }
  };

  const handleChangePermissions = async () => {
    const selected = getSelectedFiles();
    if (!token || selected.length !== 1) return;

    const file = selected[0];

    try {
      const res = await fetch("/api/files/permissions", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: file.path,
          mode: permMode || undefined,
          owner: permOwner || undefined,
          group: permGroup || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to change permissions");
      }

      setShowPermissions(false);
      setPermMode("");
      setPermOwner("");
      setPermGroup("");
      fetchDirectory(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change permissions");
    }
  };

  const openRenameDialog = () => {
    const selected = getSelectedFiles();
    if (selected.length === 1) {
      setNewName(selected[0].name);
      setShowRename(true);
    }
  };

  const openPermissionsDialog = () => {
    const selected = getSelectedFiles();
    if (selected.length === 1) {
      setPermMode("");
      setPermOwner(selected[0].owner);
      setPermGroup(selected[0].group);
      setShowPermissions(true);
    }
  };

  // Breadcrumb parts
  const pathParts = currentPath.split("/").filter(Boolean);
  const selectedCount = selectedFiles.size;
  const selectedFile = selectedCount === 1 ? getSelectedFiles()[0] : null;

  if (isLoading || !isAuthenticated || !hasPermission) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-12 h-12 mx-auto mb-4 text-accent animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <DashboardLayout title="FILE BROWSER" time={time}>
        <div className="h-[calc(100vh-3.5rem)] flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/50 bg-card/50">
            {/* Navigation */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => listing?.parent && navigateTo(listing.parent)}
                  disabled={!listing?.parent}
                  className="h-8 w-8 p-0"
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Go Up</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchDirectory(currentPath)}
                  className="h-8 w-8 p-0"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>

            <div className="w-px h-6 bg-border/50 mx-1" />

            {/* File Operations */}
            {listing?.can_write && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowNewFolder(true)}
                      className="h-8 px-2 gap-1"
                    >
                      <FolderPlus className="w-4 h-4" />
                      <span className="text-xs hidden sm:inline">New Folder</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New Folder</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowNewFile(true)}
                      className="h-8 px-2 gap-1"
                    >
                      <FilePlus className="w-4 h-4" />
                      <span className="text-xs hidden sm:inline">New File</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New File</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-8 px-2 gap-1"
                    >
                      <Upload className="w-4 h-4" />
                      <span className="text-xs hidden sm:inline">Upload</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Upload Files</TooltipContent>
                </Tooltip>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleUpload}
                  multiple
                  className="hidden"
                />

                <div className="w-px h-6 bg-border/50 mx-1" />
              </>
            )}

            {/* Edit Operations */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  disabled={selectedCount === 0}
                  className="h-8 w-8 p-0"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCut}
                  disabled={selectedCount === 0}
                  className="h-8 w-8 p-0"
                >
                  <Scissors className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cut</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePaste}
                  disabled={!clipboard || !listing?.can_write}
                  className="h-8 w-8 p-0"
                >
                  <Clipboard className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Paste {clipboard ? `(${clipboard.files.length} items)` : ""}</TooltipContent>
            </Tooltip>

            <div className="w-px h-6 bg-border/50 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openRenameDialog}
                  disabled={selectedCount !== 1}
                  className="h-8 w-8 p-0"
                >
                  <Edit3 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Rename</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDelete(true)}
                  disabled={selectedCount === 0}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm overflow-x-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateTo("/")}
                className="h-6 px-1.5 text-xs"
              >
                <HardDrive className="w-3 h-3" />
              </Button>
              {pathParts.map((part, i) => (
                <div key={i} className="flex items-center shrink-0">
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigateTo("/" + pathParts.slice(0, i + 1).join("/"))}
                    className="h-6 px-1.5 text-xs"
                  >
                    {part}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Upload progress */}
          {uploading && (
            <div className="px-4 py-2 bg-accent/10 border-b border-border/50">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Uploading...</span>
                <Progress value={uploadProgress} className="flex-1 h-2" />
                <span className="text-sm text-accent font-mono">{uploadProgress}%</span>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/30 text-destructive text-sm flex items-center justify-between">
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={() => setError(null)} className="h-6 px-2">
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar */}
            <div
              className="border-r border-border/50 bg-card/30 flex flex-col shrink-0"
              style={{ width: sidebarWidth }}
            >
              <ScrollArea className="h-full">
                <div className="p-2">
                  <QuickAccess onNavigate={navigateTo} />
                  <div className="my-3 border-t border-border/30" />
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                    Folders
                  </div>
                  <DirectoryTree
                    currentPath={currentPath}
                    onNavigate={navigateTo}
                    token={token}
                  />
                </div>
              </ScrollArea>
            </div>

            {/* File list */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <ScrollArea className="flex-1">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-accent animate-spin" />
                  </div>
                ) : listing?.files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Folder className="w-16 h-16 mb-4 opacity-30" />
                    <p className="text-lg">Empty folder</p>
                    <p className="text-sm">Create a new file or folder to get started</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {/* Grid/List View */}
                    <div className="grid grid-cols-1 gap-0.5">
                      {listing?.files.map((file, index) => (
                        <ContextMenu key={file.path}>
                          <ContextMenuTrigger>
                            <div
                              className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors select-none ${
                                selectedFiles.has(file.path)
                                  ? "bg-accent/20 border border-accent/40"
                                  : "hover:bg-accent/10 border border-transparent"
                              }`}
                              onClick={(e) => handleFileClick(file, index, e)}
                              onDoubleClick={() => handleFileDoubleClick(file)}
                            >
                              <div className="shrink-0">{getFileIcon(file, "md")}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate">{file.name}</span>
                                  {file.is_symlink && (
                                    <span className="text-xs text-muted-foreground">→ {file.link_target}</span>
                                  )}
                                </div>
                              </div>
                              <div className="shrink-0 text-xs text-muted-foreground font-mono w-20 text-right">
                                {file.is_dir ? "-" : formatBytes(file.size)}
                              </div>
                              <div className="shrink-0 text-xs text-muted-foreground font-mono w-24 hidden md:block">
                                {file.permissions}
                              </div>
                              <div className="shrink-0 text-xs text-muted-foreground w-20 hidden lg:block">
                                {file.owner}
                              </div>
                              <div className="shrink-0 text-xs text-muted-foreground w-36 hidden xl:block">
                                {formatDate(file.mod_time)}
                              </div>
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-48">
                            {file.is_dir ? (
                              <ContextMenuItem onClick={() => navigateTo(file.path)}>
                                <FolderOpen className="w-4 h-4 mr-2" />
                                Open
                              </ContextMenuItem>
                            ) : (
                              <>
                                <ContextMenuItem onClick={() => handleEdit(file)}>
                                  <Edit3 className="w-4 h-4 mr-2" />
                                  Edit
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => handlePreview(file)}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  Preview
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => handleDownload(file)}>
                                  <Download className="w-4 h-4 mr-2" />
                                  Download
                                </ContextMenuItem>
                              </>
                            )}
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={handleCopy}>
                              <Copy className="w-4 h-4 mr-2" />
                              Copy
                            </ContextMenuItem>
                            <ContextMenuItem onClick={handleCut}>
                              <Scissors className="w-4 h-4 mr-2" />
                              Cut
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={openRenameDialog}>
                              <Edit3 className="w-4 h-4 mr-2" />
                              Rename
                            </ContextMenuItem>
                            <ContextMenuItem onClick={openPermissionsDialog}>
                              <Lock className="w-4 h-4 mr-2" />
                              Permissions
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={() => setShowDelete(true)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      ))}
                    </div>
                  </div>
                )}
              </ScrollArea>

              {/* Status bar */}
              <div className="flex items-center gap-4 px-3 py-1.5 border-t border-border/50 bg-card/30 text-xs text-muted-foreground">
                <span>{listing?.total ?? 0} items</span>
                {selectedCount > 0 && (
                  <>
                    <div className="h-3 w-px bg-border/50" />
                    <span className="text-accent">{selectedCount} selected</span>
                  </>
                )}
                {selectedFile && !selectedFile.is_dir && (
                  <span>{formatBytes(selectedFile.size)}</span>
                )}
                {clipboard && (
                  <>
                    <div className="h-3 w-px bg-border/50" />
                    <span>{clipboard.files.length} in clipboard ({clipboard.operation})</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* New Folder Dialog */}
        <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-chart-3" />
                Create New Folder
              </DialogTitle>
              <DialogDescription>Enter a name for the new folder in {currentPath}</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="folder-name">Folder name</Label>
              <Input
                id="folder-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New Folder"
                className="mt-2"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewFolder(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateFolder} disabled={!newName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New File Dialog */}
        <Dialog open={showNewFile} onOpenChange={setShowNewFile}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FilePlus className="w-5 h-5 text-accent" />
                Create New File
              </DialogTitle>
              <DialogDescription>Create a new file in {currentPath}</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="file-name">File name</Label>
                <Input
                  id="file-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="newfile.txt"
                  className="mt-2"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="file-content">Content (optional)</Label>
                <textarea
                  id="file-content"
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  placeholder="File content..."
                  className="mt-2 w-full h-40 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewFile(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateFile} disabled={!newName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename Dialog */}
        <Dialog open={showRename} onOpenChange={setShowRename}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit3 className="w-5 h-5" />
                Rename
              </DialogTitle>
              <DialogDescription>Enter a new name</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="new-name">New name</Label>
              <Input
                id="new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-2"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRename(false)}>
                Cancel
              </Button>
              <Button onClick={handleRename} disabled={!newName.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedCount} item{selectedCount !== 1 ? "s" : ""}?</AlertDialogTitle>
              <AlertDialogDescription>
                {selectedCount === 1 && selectedFile ? (
                  <>Are you sure you want to delete &quot;{selectedFile.name}&quot;?</>
                ) : (
                  <>Are you sure you want to delete {selectedCount} items?</>
                )}
                {" "}This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Permissions Dialog */}
        <Dialog open={showPermissions} onOpenChange={setShowPermissions}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Change Permissions
              </DialogTitle>
              <DialogDescription>
                Modify permissions for {selectedFile?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="perm-mode">Mode (e.g., 755, 644)</Label>
                <Input
                  id="perm-mode"
                  value={permMode}
                  onChange={(e) => setPermMode(e.target.value)}
                  placeholder={selectedFile?.permissions}
                  className="mt-2 font-mono"
                />
              </div>
              <div>
                <Label htmlFor="perm-owner">Owner</Label>
                <Input
                  id="perm-owner"
                  value={permOwner}
                  onChange={(e) => setPermOwner(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="perm-group">Group</Label>
                <Input
                  id="perm-group"
                  value={permGroup}
                  onChange={(e) => setPermGroup(e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPermissions(false)}>
                Cancel
              </Button>
              <Button onClick={handleChangePermissions}>Apply</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingFile && getFileIcon(editingFile)}
                {editingFile?.name}
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[60vh]">
              <pre className="text-sm font-mono whitespace-pre-wrap break-all p-4 bg-muted/30 rounded-lg">
                {previewContent}
              </pre>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPreview(false)}>
                Close
              </Button>
              {editingFile && (
                <>
                  <Button variant="outline" onClick={() => {
                    setShowPreview(false);
                    setEditContent(previewContent);
                    setShowEditor(true);
                  }}>
                    <Edit3 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button onClick={() => handleDownload(editingFile)}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Editor Dialog */}
        <Dialog open={showEditor} onOpenChange={setShowEditor}>
          <DialogContent className="max-w-5xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingFile && getFileIcon(editingFile)}
                Editing: {editingFile?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="h-[65vh]">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-full rounded-md border border-input bg-background px-4 py-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                spellCheck={false}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditor(false)}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </TooltipProvider>
  );
}

function FileBrowserFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 mx-auto mb-4 text-accent animate-spin" />
        <p className="text-muted-foreground">Loading File Browser...</p>
      </div>
    </div>
  );
}

export default function FileBrowserPage() {
  return (
    <Suspense fallback={<FileBrowserFallback />}>
      <FileBrowserContent />
    </Suspense>
  );
}
