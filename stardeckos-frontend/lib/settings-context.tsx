"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type TaskbarPosition = "top" | "bottom";

export interface TraySettings {
  showCpu: boolean;
  showMemory: boolean;
  showDisk: boolean;
  showNetwork: boolean;
  refreshInterval: number; // in seconds
}

export interface ThemeSettings {
  accentColor: "cyan" | "amber" | "green" | "purple" | "red";
  enableScanlines: boolean;
  enableGlow: boolean;
  enableAnimations: boolean;
}

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
