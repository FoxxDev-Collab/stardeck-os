"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type TaskbarPosition = "top" | "bottom";
export type AccentColor = "cyan" | "amber" | "green" | "purple" | "red";

export interface TraySettings {
  showCpu: boolean;
  showMemory: boolean;
  showDisk: boolean;
  showNetwork: boolean;
  refreshInterval: number; // in seconds
}

export interface ThemeSettings {
  accentColor: AccentColor;
  enableScanlines: boolean;
  enableGlow: boolean;
  enableAnimations: boolean;
}

// Accent color definitions in OKLCH format
const accentColors: Record<AccentColor, { light: string; dark: string; lightForeground: string; darkForeground: string }> = {
  cyan: {
    light: "oklch(0.7889 0.1105 196.6173)",
    dark: "oklch(0.7000 0.1190 200.4390)",
    lightForeground: "oklch(0.1496 0 0)",
    darkForeground: "oklch(0.1290 0.0714 263.7567)",
  },
  amber: {
    light: "oklch(0.7500 0.1500 65.0000)",
    dark: "oklch(0.7500 0.1500 65.0000)",
    lightForeground: "oklch(0.1496 0 0)",
    darkForeground: "oklch(0.1290 0.0714 263.7567)",
  },
  green: {
    light: "oklch(0.7200 0.1500 145.0000)",
    dark: "oklch(0.6800 0.1500 145.0000)",
    lightForeground: "oklch(0.1496 0 0)",
    darkForeground: "oklch(0.1290 0.0714 263.7567)",
  },
  purple: {
    light: "oklch(0.6500 0.1500 300.0000)",
    dark: "oklch(0.6800 0.1500 300.0000)",
    lightForeground: "oklch(0.9791 0 0)",
    darkForeground: "oklch(0.9791 0 0)",
  },
  red: {
    light: "oklch(0.6500 0.2000 25.0000)",
    dark: "oklch(0.6500 0.2000 25.0000)",
    lightForeground: "oklch(0.9791 0 0)",
    darkForeground: "oklch(0.9791 0 0)",
  },
};

export interface DesktopSettings {
  iconSize: "small" | "medium" | "large";
  showLabels: boolean;
  gridSpacing: "compact" | "normal" | "relaxed";
  coloredIcons: boolean;
}

export interface Settings {
  taskbarPosition: TaskbarPosition;
  tray: TraySettings;
  theme: ThemeSettings;
  desktop: DesktopSettings;
}

const defaultSettings: Settings = {
  taskbarPosition: "top",
  tray: {
    showCpu: true,
    showMemory: true,
    showDisk: true,
    showNetwork: true,
    refreshInterval: 3,
  },
  theme: {
    accentColor: "cyan",
    enableScanlines: false,
    enableGlow: true,
    enableAnimations: true,
  },
  desktop: {
    iconSize: "medium",
    showLabels: true,
    gridSpacing: "normal",
    coloredIcons: true,
  },
};

interface SettingsContextType {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  updateTraySettings: (updates: Partial<TraySettings>) => void;
  updateThemeSettings: (updates: Partial<ThemeSettings>) => void;
  updateDesktopSettings: (updates: Partial<DesktopSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY = "stardeck-settings";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...defaultSettings, ...parsed });
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
    setIsLoaded(true);
  }, []);

  // Save settings to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (e) {
        console.error("Failed to save settings:", e);
      }
    }
  }, [settings, isLoaded]);

  // Apply accent color to CSS variables
  useEffect(() => {
    if (!isLoaded) return;

    const root = document.documentElement;
    const colorDef = accentColors[settings.theme.accentColor];
    const isDark = root.classList.contains("dark");

    // Apply accent color
    root.style.setProperty("--accent", isDark ? colorDef.dark : colorDef.light);
    root.style.setProperty("--accent-foreground", isDark ? colorDef.darkForeground : colorDef.lightForeground);

    // Also update ring color to match accent
    root.style.setProperty("--ring", isDark ? colorDef.dark : colorDef.light);
  }, [settings.theme.accentColor, isLoaded]);

  // Watch for dark mode changes and reapply colors
  useEffect(() => {
    if (!isLoaded) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes" && mutation.attributeName === "class") {
          const root = document.documentElement;
          const colorDef = accentColors[settings.theme.accentColor];
          const isDark = root.classList.contains("dark");

          root.style.setProperty("--accent", isDark ? colorDef.dark : colorDef.light);
          root.style.setProperty("--accent-foreground", isDark ? colorDef.darkForeground : colorDef.lightForeground);
          root.style.setProperty("--ring", isDark ? colorDef.dark : colorDef.light);
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [settings.theme.accentColor, isLoaded]);

  const updateSettings = (updates: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  const updateTraySettings = (updates: Partial<TraySettings>) => {
    setSettings((prev) => ({
      ...prev,
      tray: { ...prev.tray, ...updates },
    }));
  };

  const updateThemeSettings = (updates: Partial<ThemeSettings>) => {
    setSettings((prev) => ({
      ...prev,
      theme: { ...prev.theme, ...updates },
    }));
  };

  const updateDesktopSettings = (updates: Partial<DesktopSettings>) => {
    setSettings((prev) => ({
      ...prev,
      desktop: { ...prev.desktop, ...updates },
    }));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        updateTraySettings,
        updateThemeSettings,
        updateDesktopSettings,
        resetSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
