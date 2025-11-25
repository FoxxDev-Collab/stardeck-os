"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "dark") {
      setTheme("light");
    } else if (theme === "light") {
      setTheme("system");
    } else {
      setTheme("dark");
    }
  };

  const getIcon = () => {
    switch (theme) {
      case "dark":
        return <Moon className="h-4 w-4" />;
      case "light":
        return <Sun className="h-4 w-4" />;
      case "system":
        return <Monitor className="h-4 w-4" />;
    }
  };

  const getLabel = () => {
    switch (theme) {
      case "dark":
        return "Dark";
      case "light":
        return "Light";
      case "system":
        return "System";
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={cycleTheme}
      className="gap-2 border-border/50 hover:border-accent/50 hover:bg-accent/10 transition-all duration-200"
      title={`Current theme: ${getLabel()}. Click to change.`}
    >
      {getIcon()}
      <span className="text-xs tracking-wider">{getLabel()}</span>
    </Button>
  );
}
