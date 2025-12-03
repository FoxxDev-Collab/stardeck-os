"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  FileCode2,
  Plus,
  Search,
  Trash2,
  Edit,
  Rocket,
  Download,
  Upload,
  Copy,
  CheckCircle2,
  Loader2,
  Tag,
  User,
  Calendar,
  Box,
  FileJson,
} from "lucide-react";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  compose_content: string;
  env_defaults: string;
  volume_hints: string;
  tags: string;
  created_at: string;
  updated_at: string;
  usage_count: number;
}

interface TemplatesTabProps {
  token: string;
  isAdmin: boolean;
}

export function TemplatesTab({ token, isAdmin }: TemplatesTabProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeployDialog, setShowDeployDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formVersion, setFormVersion] = useState("1.0.0");
  const [formCompose, setFormCompose] = useState(`version: "3.8"
services:
  app:
    image: nginx:alpine
    ports:
      - "8080:80"
    restart: unless-stopped
`);
  const [formEnvDefaults, setFormEnvDefaults] = useState("");
  const [formTags, setFormTags] = useState("");

  // Deploy state
  const [deployProjectName, setDeployProjectName] = useState("");
  const [deployEnvVars, setDeployEnvVars] = useState<Record<string, string>>({});
  const [isDeploying, setIsDeploying] = useState(false);

  // Import state
  const [importJson, setImportJson] = useState("");

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch("/api/templates", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTemplates(data || []);
      }
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormVersion("1.0.0");
    setFormCompose(`version: "3.8"
services:
  app:
    image: nginx:alpine
    ports:
      - "8080:80"
    restart: unless-stopped
`);
    setFormEnvDefaults("");
    setFormTags("");
  };

  const parseEnvDefaults = (envString: string): Record<string, string> => {
    const result: Record<string, string> = {};
    envString.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key) {
          result[key.trim()] = valueParts.join("=").trim();
        }
      }
    });
    return result;
  };

  const parseTags = (tagsString: string): string[] => {
    return tagsString
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  };

  const createTemplate = async () => {
    if (!formName || !formCompose) {
      toast.error("Validation Error", { description: "Name and compose content are required" });
      return;
    }

    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formName,
          description: formDescription,
          version: formVersion,
          compose_content: formCompose,
          env_defaults: parseEnvDefaults(formEnvDefaults),
          tags: parseTags(formTags),
        }),
      });

      if (response.ok) {
        toast.success("Template Created", {
          description: `Template "${formName}" created successfully`,
        });
        setShowCreateDialog(false);
        resetForm();
        fetchTemplates();
      } else {
        const error = await response.json();
        toast.error("Failed to create template", {
          description: error.error || "Unknown error",
        });
      }
    } catch (error) {
      toast.error("Failed to create template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const updateTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      const response = await fetch(`/api/templates/${selectedTemplate.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formName || selectedTemplate.name,
          description: formDescription,
          version: formVersion,
          compose_content: formCompose,
          env_defaults: parseEnvDefaults(formEnvDefaults),
          tags: parseTags(formTags),
        }),
      });

      if (response.ok) {
        toast.success("Template Updated", {
          description: `Template "${selectedTemplate.name}" updated successfully`,
        });
        setShowEditDialog(false);
        fetchTemplates();
      } else {
        const error = await response.json();
        toast.error("Failed to update template", {
          description: error.error || "Unknown error",
        });
      }
    } catch (error) {
      toast.error("Failed to update template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const deleteTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      const response = await fetch(`/api/templates/${selectedTemplate.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        toast.success("Template Deleted", {
          description: `Template "${selectedTemplate.name}" deleted successfully`,
        });
        setShowDeleteDialog(false);
        setSelectedTemplate(null);
        fetchTemplates();
      } else {
        const error = await response.json();
        toast.error("Failed to delete template", {
          description: error.error || "Unknown error",
        });
      }
    } catch (error) {
      toast.error("Failed to delete template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const deployTemplate = async () => {
    if (!selectedTemplate) return;

    setIsDeploying(true);
    try {
      const response = await fetch(`/api/templates/${selectedTemplate.id}/deploy`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_name: deployProjectName,
          environment: deployEnvVars,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Stack Created from Template", {
          description: `Stack "${deployProjectName || selectedTemplate.name}" created. Go to Stacks tab to deploy it.`,
        });
        setShowDeployDialog(false);
        setDeployProjectName("");
        setDeployEnvVars({});
      } else {
        toast.error("Failed to deploy template", {
          description: data.error || "Unknown error",
        });
      }
    } catch (error) {
      toast.error("Failed to deploy template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const exportTemplate = async (template: Template) => {
    try {
      const response = await fetch(`/api/templates/${template.id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${template.name}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Template Exported", {
          description: `Template "${template.name}" exported successfully`,
        });
      } else {
        toast.error("Failed to export template");
      }
    } catch (error) {
      toast.error("Failed to export template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const copyToClipboard = async (template: Template) => {
    try {
      const response = await fetch(`/api/templates/${template.id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        toast.success("Copied to Clipboard", {
          description: "Template JSON copied to clipboard",
        });
      }
    } catch (error) {
      toast.error("Failed to copy template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const importTemplate = async () => {
    if (!importJson.trim()) {
      toast.error("Validation Error", { description: "Please paste template JSON" });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      toast.error("Invalid JSON", { description: "Please check the JSON format" });
      return;
    }

    try {
      const response = await fetch("/api/templates/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: importJson,
      });

      if (response.ok) {
        toast.success("Template Imported", {
          description: `Template "${parsed.name}" imported successfully`,
        });
        setShowImportDialog(false);
        setImportJson("");
        fetchTemplates();
      } else {
        const error = await response.json();
        toast.error("Failed to import template", {
          description: error.error || "Unknown error",
        });
      }
    } catch (error) {
      toast.error("Failed to import template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const openEditDialog = (template: Template) => {
    setSelectedTemplate(template);
    setFormName(template.name);
    setFormDescription(template.description);
    setFormVersion(template.version);
    setFormCompose(template.compose_content);

    // Parse env defaults
    if (template.env_defaults) {
      try {
        const envObj = JSON.parse(template.env_defaults);
        setFormEnvDefaults(
          Object.entries(envObj)
            .map(([k, v]) => `${k}=${v}`)
            .join("\n")
        );
      } catch {
        setFormEnvDefaults("");
      }
    } else {
      setFormEnvDefaults("");
    }

    // Parse tags
    if (template.tags) {
      try {
        const tagsArr = JSON.parse(template.tags);
        setFormTags(tagsArr.join(", "));
      } catch {
        setFormTags("");
      }
    } else {
      setFormTags("");
    }

    setShowEditDialog(true);
  };

  const openDeployDialog = (template: Template) => {
    setSelectedTemplate(template);
    setDeployProjectName("");

    // Parse env defaults for deploy form
    if (template.env_defaults) {
      try {
        const envObj = JSON.parse(template.env_defaults);
        setDeployEnvVars(envObj);
      } catch {
        setDeployEnvVars({});
      }
    } else {
      setDeployEnvVars({});
    }

    setShowDeployDialog(true);
  };

  const openViewDialog = (template: Template) => {
    setSelectedTemplate(template);
    setShowViewDialog(true);
  };

  const filteredTemplates = templates.filter((t) => {
    const search = searchTerm.toLowerCase();
    return (
      t.name.toLowerCase().includes(search) ||
      t.description.toLowerCase().includes(search) ||
      t.author.toLowerCase().includes(search)
    );
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getTagsArray = (tagsJson: string): string[] => {
    if (!tagsJson) return [];
    try {
      return JSON.parse(tagsJson);
    } catch {
      return [];
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-card/70 border-border/50"
          />
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImportDialog(true)} className="gap-2">
              <Upload className="w-4 h-4" /> Import
            </Button>
            <Button onClick={() => { resetForm(); setShowCreateDialog(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> New Template
            </Button>
          </div>
        )}
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <Card className="border-border/50 bg-card/70">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileCode2 className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Templates</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchTerm
                ? "No templates match your search"
                : "Save your container configurations as reusable templates"}
            </p>
            {isAdmin && !searchTerm && (
              <Button onClick={() => { resetForm(); setShowCreateDialog(true); }} className="gap-2">
                <Plus className="w-4 h-4" /> Create First Template
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <Card
              key={template.id}
              className="border-border/50 bg-card/70 hover:bg-card/90 transition-colors cursor-pointer"
              onClick={() => openViewDialog(template)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="w-5 h-5 text-cyan-400" />
                    <CardTitle className="text-base font-medium">{template.name}</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    v{template.version || "1.0"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {template.description || "No description"}
                </p>

                {/* Tags */}
                {getTagsArray(template.tags).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {getTagsArray(template.tags).slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        <Tag className="w-3 h-3 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                    {getTagsArray(template.tags).length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{getTagsArray(template.tags).length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Meta info */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {template.author}
                    </span>
                    <span className="flex items-center gap-1">
                      <Box className="w-3 h-3" />
                      {template.usage_count} deploys
                    </span>
                  </div>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(template.created_at)}
                  </span>
                </div>

                {/* Actions */}
                <div
                  className="flex gap-2 pt-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isAdmin && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDeployDialog(template)}
                        className="flex-1 gap-1"
                      >
                        <Rocket className="w-3 h-3" /> Deploy
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(template)}
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => exportTemplate(template)}
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(template)}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedTemplate(template);
                          setShowDeleteDialog(true);
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                  {!isAdmin && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportTemplate(template)}
                        className="gap-1"
                      >
                        <Download className="w-3 h-3" /> Export
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(template)}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Template Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode2 className="w-5 h-5 text-cyan-400" />
              Create Template
            </DialogTitle>
            <DialogDescription>
              Save a container configuration as a reusable template
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="my-app-template"
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="version">Version</Label>
                  <Input
                    id="version"
                    value={formVersion}
                    onChange={(e) => setFormVersion(e.target.value)}
                    placeholder="1.0.0"
                    className="bg-background/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formDescription}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormDescription(e.target.value)}
                  placeholder="Describe what this template does..."
                  rows={2}
                  className="bg-background/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="compose">Docker Compose Content *</Label>
                <Textarea
                  id="compose"
                  value={formCompose}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormCompose(e.target.value)}
                  placeholder="version: '3.8'\nservices:\n  ..."
                  rows={12}
                  className="font-mono text-sm bg-background/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="env">Environment Variables (KEY=value, one per line)</Label>
                <Textarea
                  id="env"
                  value={formEnvDefaults}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormEnvDefaults(e.target.value)}
                  placeholder="DATABASE_URL=postgres://localhost/db&#10;API_KEY="
                  rows={4}
                  className="font-mono text-sm bg-background/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="web, database, monitoring"
                  className="bg-background/50"
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createTemplate} className="gap-2">
              <CheckCircle2 className="w-4 h-4" /> Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Template Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-cyan-400" />
              Edit Template
            </DialogTitle>
            <DialogDescription>
              Update template configuration
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-version">Version</Label>
                  <Input
                    id="edit-version"
                    value={formVersion}
                    onChange={(e) => setFormVersion(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formDescription}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormDescription(e.target.value)}
                  rows={2}
                  className="bg-background/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-compose">Docker Compose Content</Label>
                <Textarea
                  id="edit-compose"
                  value={formCompose}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormCompose(e.target.value)}
                  rows={12}
                  className="font-mono text-sm bg-background/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-env">Environment Variables</Label>
                <Textarea
                  id="edit-env"
                  value={formEnvDefaults}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormEnvDefaults(e.target.value)}
                  rows={4}
                  className="font-mono text-sm bg-background/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-tags">Tags</Label>
                <Input
                  id="edit-tags"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  className="bg-background/50"
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={updateTemplate} className="gap-2">
              <CheckCircle2 className="w-4 h-4" /> Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Template
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{selectedTemplate?.name}</strong>? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteTemplate}>
              Delete Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deploy Template Dialog */}
      <Dialog open={showDeployDialog} onOpenChange={setShowDeployDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-cyan-400" />
              Deploy Template
            </DialogTitle>
            <DialogDescription>
              Create a new stack from <strong>{selectedTemplate?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name (optional)</Label>
              <Input
                id="project-name"
                value={deployProjectName}
                onChange={(e) => setDeployProjectName(e.target.value)}
                placeholder={`${selectedTemplate?.name || "project"}-${new Date().toISOString().slice(0, 10)}`}
                className="bg-background/50"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to auto-generate a unique name
              </p>
            </div>

            {Object.keys(deployEnvVars).length > 0 && (
              <div className="space-y-2">
                <Label>Environment Variables</Label>
                <ScrollArea className="max-h-48">
                  <div className="space-y-2">
                    {Object.entries(deployEnvVars).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <Input
                          value={key}
                          disabled
                          className="w-1/3 bg-background/30 text-muted-foreground text-sm"
                        />
                        <Input
                          value={value}
                          onChange={(e) =>
                            setDeployEnvVars((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder="value"
                          className="bg-background/50 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeployDialog(false)}>
              Cancel
            </Button>
            <Button onClick={deployTemplate} disabled={isDeploying} className="gap-2">
              {isDeploying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Rocket className="w-4 h-4" />
              )}
              {isDeploying ? "Creating..." : "Create Stack"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Template Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-cyan-400" />
              Import Template
            </DialogTitle>
            <DialogDescription>
              Paste exported template JSON to import
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={importJson}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setImportJson(e.target.value)}
              placeholder='{"name": "my-template", "compose_content": "...", ...}'
              rows={12}
              className="font-mono text-sm bg-background/50"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={importTemplate} className="gap-2">
              <Upload className="w-4 h-4" /> Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Template Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="w-5 h-5 text-cyan-400" />
              {selectedTemplate?.name}
              <Badge variant="outline" className="ml-2">
                v{selectedTemplate?.version || "1.0"}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {selectedTemplate?.description || "No description"}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-1">
              {/* Meta info */}
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pb-4 border-b border-border/50">
                <span className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  Author: {selectedTemplate?.author}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Created: {selectedTemplate ? formatDate(selectedTemplate.created_at) : ""}
                </span>
                <span className="flex items-center gap-1">
                  <Box className="w-4 h-4" />
                  Used {selectedTemplate?.usage_count} times
                </span>
              </div>

              {/* Tags */}
              {selectedTemplate && getTagsArray(selectedTemplate.tags).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {getTagsArray(selectedTemplate.tags).map((tag) => (
                    <Badge key={tag} variant="secondary">
                      <Tag className="w-3 h-3 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Compose content */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Compose File</Label>
                <pre className="p-4 rounded-lg bg-background/50 border border-border/50 overflow-x-auto text-sm font-mono whitespace-pre">
                  {selectedTemplate?.compose_content}
                </pre>
              </div>

              {/* Environment defaults */}
              {selectedTemplate?.env_defaults && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Default Environment Variables</Label>
                  <pre className="p-4 rounded-lg bg-background/50 border border-border/50 overflow-x-auto text-sm font-mono">
                    {(() => {
                      try {
                        const env = JSON.parse(selectedTemplate.env_defaults);
                        return Object.entries(env)
                          .map(([k, v]) => `${k}=${v}`)
                          .join("\n");
                      } catch {
                        return selectedTemplate.env_defaults;
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewDialog(false)}>
              Close
            </Button>
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowViewDialog(false);
                    if (selectedTemplate) openEditDialog(selectedTemplate);
                  }}
                  className="gap-2"
                >
                  <Edit className="w-4 h-4" /> Edit
                </Button>
                <Button
                  onClick={() => {
                    setShowViewDialog(false);
                    if (selectedTemplate) openDeployDialog(selectedTemplate);
                  }}
                  className="gap-2"
                >
                  <Rocket className="w-4 h-4" /> Deploy
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
