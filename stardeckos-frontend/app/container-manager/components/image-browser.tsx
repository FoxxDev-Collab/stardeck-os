"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Package,
  Search,
  Download,
  Trash2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Tag,
  Calendar,
  HardDrive,
  Layers,
} from "lucide-react";

interface ContainerImage {
  id: string;
  repo_tags: string[];
  repo_digests: string[];
  size: number;
  created: string;
  containers: number;
  shared_size: number;
  virtual_size: number;
}

interface ImageBrowserProps {
  onRefresh?: () => void;
}

export function ImageBrowser({ onRefresh }: ImageBrowserProps) {
  const { token, user } = useAuth();
  const [images, setImages] = useState<ContainerImage[]>([]);
  const [filteredImages, setFilteredImages] = useState<ContainerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [pullDialogOpen, setPullDialogOpen] = useState(false);
  const [pullImage, setPullImage] = useState("");
  const [pullTag, setPullTag] = useState("latest");
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState("");

  const isAdmin = user?.role === "admin";

  const fetchImages = async () => {
    if (!token) return;
    
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/images", {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error("Failed to fetch images");
      
      const data = await response.json();
      setImages(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load images");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (searchTerm.trim()) {
      const filtered = images.filter((image) =>
        image.repo_tags.some((tag) =>
          tag.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
      setFilteredImages(filtered);
    } else {
      setFilteredImages(images);
    }
  }, [images, searchTerm]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString();
  };

  const handlePullImage = async () => {
    if (!pullImage.trim()) return;

    setPulling(true);
    setPullProgress("Pulling image...");

    try {
      const fullImageName = `${pullImage}:${pullTag}`;
      const response = await fetch("/api/images/pull", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image: fullImageName }),
      });

      if (!response.ok) throw new Error("Failed to pull image");

      setPullProgress("Image pulled successfully!");
      setTimeout(() => {
        setPullDialogOpen(false);
        setPullImage("");
        setPullTag("latest");
        setPullProgress("");
        fetchImages();
        onRefresh?.();
      }, 1000);
    } catch (err) {
      setPullProgress(`Error: ${err instanceof Error ? err.message : "Failed to pull image"}`);
    } finally {
      setPulling(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm("Are you sure you want to delete this image?")) return;

    try {
      const response = await fetch(`/api/images/${imageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to delete image");

      fetchImages();
      onRefresh?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete image");
    }
  };

  if (loading) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={fetchImages} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-accent" />
                Container Images
              </CardTitle>
              <CardDescription>Manage container images available on this system</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={fetchImages} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              {isAdmin && (
                <Button onClick={() => setPullDialogOpen(true)} size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Pull Image
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search images by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Images Table */}
          {filteredImages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{searchTerm ? "No images match your search" : "No images found"}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Repository:Tag</TableHead>
                    <TableHead>Image ID</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Containers</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredImages.map((image) => (
                    <TableRow key={image.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {image.repo_tags && image.repo_tags.length > 0 ? (
                            image.repo_tags.map((tag) => (
                              <div key={tag} className="flex items-center gap-2">
                                <Tag className="w-3 h-3 text-accent" />
                                <span className="font-mono text-sm">{tag}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-sm italic">&lt;none&gt;</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {image.id.substring(0, 12)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-3 h-3 text-muted-foreground" />
                          <span className="text-sm">{formatBytes(image.size)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <span className="text-sm">{formatDate(image.created)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {image.containers}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteImage(image.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center justify-between pt-4 border-t border-border/50 text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4" />
                <span>{images.length} images</span>
              </div>
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4" />
                <span>
                  {formatBytes(images.reduce((acc, img) => acc + img.size, 0))} total
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pull Image Dialog */}
      <Dialog open={pullDialogOpen} onOpenChange={setPullDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-accent" />
              Pull Container Image
            </DialogTitle>
            <DialogDescription>
              Download a container image from a registry
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="image-name">Image Name</Label>
              <Input
                id="image-name"
                placeholder="e.g., nginx, docker.io/library/redis, ghcr.io/user/app"
                value={pullImage}
                onChange={(e) => setPullImage(e.target.value)}
                disabled={pulling}
              />
              <p className="text-xs text-muted-foreground">
                Enter the full image path or just the image name for Docker Hub
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="image-tag">Tag</Label>
              <Input
                id="image-tag"
                placeholder="latest"
                value={pullTag}
                onChange={(e) => setPullTag(e.target.value)}
                disabled={pulling}
              />
            </div>

            {pullProgress && (
              <div className={`text-sm p-3 rounded-lg ${
                pullProgress.includes("Error") 
                  ? "bg-destructive/10 text-destructive" 
                  : "bg-accent/10 text-accent"
              }`}>
                {pullProgress}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPullDialogOpen(false);
                setPullImage("");
                setPullTag("latest");
                setPullProgress("");
              }}
              disabled={pulling}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePullImage}
              disabled={!pullImage.trim() || pulling}
            >
              {pulling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Pull Image
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
