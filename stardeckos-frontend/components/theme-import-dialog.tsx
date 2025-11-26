"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/lib/settings-context";
import {
  parseThemeCSS,
  validateTheme,
  createCustomTheme,
} from "@/lib/theme-parser";
import {
  Upload,
  AlertCircle,
  CheckCircle,
  Palette,
  ExternalLink,
} from "lucide-react";

interface ThemeImportDialogProps {
  children?: React.ReactNode;
  onImportSuccess?: () => void;
}

export function ThemeImportDialog({
  children,
  onImportSuccess,
}: ThemeImportDialogProps) {
  const { addCustomTheme, applyCustomTheme } = useSettings();
  const [open, setOpen] = useState(false);
  const [themeName, setThemeName] = useState("");
  const [cssInput, setCssInput] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [isValidated, setIsValidated] = useState(false);
  const [applyAfterImport, setApplyAfterImport] = useState(true);

  const resetForm = () => {
    setThemeName("");
    setCssInput("");
    setErrors([]);
    setIsValidated(false);
  };

  const handleValidate = () => {
    setErrors([]);
    setIsValidated(false);

    if (!themeName.trim()) {
      setErrors(["Please enter a theme name"]);
      return;
    }

    if (!cssInput.trim()) {
      setErrors(["Please paste your CSS theme code"]);
      return;
    }

    try {
      const parsed = parseThemeCSS(cssInput);
      const validation = validateTheme(parsed);

      if (!validation.isValid) {
        setErrors(validation.errors);
        return;
      }

      // Show warnings if any
      const warnings = validation.errors.filter((e) => e.startsWith("Warning"));
      if (warnings.length > 0) {
        setErrors(warnings);
      }

      setIsValidated(true);
    } catch {
      setErrors(["Failed to parse CSS. Please check the format."]);
    }
  };

  const handleImport = () => {
    if (!isValidated) {
      handleValidate();
      if (!isValidated) return;
    }

    try {
      const parsed = parseThemeCSS(cssInput);
      const theme = createCustomTheme(themeName.trim(), cssInput, parsed);

      addCustomTheme(theme);

      if (applyAfterImport) {
        applyCustomTheme(theme.id);
      }

      setOpen(false);
      resetForm();
      onImportSuccess?.();
    } catch {
      setErrors(["Failed to import theme. Please try again."]);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" className="gap-2">
            <Upload className="w-4 h-4" />
            Import Theme
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl border-border/60 bg-card/95 backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-accent" />
            Import Custom Theme
          </DialogTitle>
          <DialogDescription>
            Paste CSS from{" "}
            <a
              href="https://tweakcn.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline inline-flex items-center gap-1"
            >
              tweakcn.com
              <ExternalLink className="w-3 h-3" />
            </a>{" "}
            to create a custom theme. The CSS should include <code>:root</code>{" "}
            and optionally <code>.dark</code> blocks with CSS custom properties.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Theme Name Input */}
          <div className="space-y-2">
            <Label htmlFor="theme-name">Theme Name</Label>
            <Input
              id="theme-name"
              placeholder="My Custom Theme"
              value={themeName}
              onChange={(e) => {
                setThemeName(e.target.value);
                setIsValidated(false);
              }}
              className="border-border/60 bg-background/50"
            />
          </div>

          {/* CSS Input */}
          <div className="space-y-2">
            <Label htmlFor="css-input">CSS Theme Code</Label>
            <textarea
              id="css-input"
              placeholder={`:root {
  --background: oklch(0.9318 0.0228 98.6500);
  --foreground: oklch(0.3211 0 0);
  --primary: oklch(0.5135 0.0920 250.9606);
  /* ... more variables */
}

.dark {
  --background: oklch(0.3423 0.0345 250.4751);
  /* ... dark mode variables */
}`}
              value={cssInput}
              onChange={(e) => {
                setCssInput(e.target.value);
                setIsValidated(false);
                setErrors([]);
              }}
              rows={12}
              className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>

          {/* Apply after import checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="apply-after-import"
              checked={applyAfterImport}
              onChange={(e) => setApplyAfterImport(e.target.checked)}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            <Label
              htmlFor="apply-after-import"
              className="text-sm font-normal cursor-pointer"
            >
              Apply theme immediately after import
            </Label>
          </div>

          {/* Validation Status */}
          {errors.length > 0 && (
            <div
              className={`p-3 rounded-lg border ${
                errors.some((e) => !e.startsWith("Warning"))
                  ? "border-destructive/50 bg-destructive/10"
                  : "border-yellow-500/50 bg-yellow-500/10"
              }`}
            >
              <div className="flex items-start gap-2">
                <AlertCircle
                  className={`w-4 h-4 mt-0.5 ${
                    errors.some((e) => !e.startsWith("Warning"))
                      ? "text-destructive"
                      : "text-yellow-500"
                  }`}
                />
                <div className="space-y-1">
                  {errors.map((error, index) => (
                    <p
                      key={index}
                      className={`text-sm ${
                        error.startsWith("Warning")
                          ? "text-yellow-500"
                          : "text-destructive"
                      }`}
                    >
                      {error}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isValidated && errors.length === 0 && (
            <div className="p-3 rounded-lg border border-green-500/50 bg-green-500/10">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <p className="text-sm text-green-500">
                  Theme validated successfully! Ready to import.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-border/60"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleValidate}
            disabled={!themeName.trim() || !cssInput.trim()}
            className="gap-2 border-border/60"
          >
            Validate
          </Button>
          <Button
            onClick={handleImport}
            disabled={!isValidated}
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Upload className="w-4 h-4" />
            Import Theme
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
