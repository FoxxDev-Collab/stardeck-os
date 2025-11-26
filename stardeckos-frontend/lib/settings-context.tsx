"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  CustomTheme,
  ParsedThemeVariables,
  applyThemeVariables,
  clearThemeVariables,
  getThemeableVariables,
} from "./theme-parser";

export type TaskbarPosition = "top" | "bottom";
export type AccentColor = "cyan" | "amber" | "green" | "purple" | "red";

export type { CustomTheme, ParsedThemeVariables };

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
  activeCustomThemeId: string | null; // ID of active custom theme, or null for default
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

export type BackgroundType = "default" | "color" | "gradient" | "image";

export interface DesktopSettings {
  iconSize: "small" | "medium" | "large";
  showLabels: boolean;
  gridSpacing: "compact" | "normal" | "relaxed";
  coloredIcons: boolean;
  backgroundType: BackgroundType;
  backgroundColor: string; // hex color for solid backgrounds
  backgroundGradient: string; // CSS gradient string
  backgroundImage: string; // URL or path to image
}

export type RestartPolicy = "no" | "always" | "unless-stopped" | "on-failure";
export type NetworkMode = "bridge" | "host" | "none";

export interface ContainerSettings {
  defaultRestartPolicy: RestartPolicy;
  defaultNetworkMode: NetworkMode;
  autoStartContainers: boolean; // Start containers immediately after creation
  enablePrivilegedByDefault: boolean; // Default value for privileged mode (usually false)
}

export interface Settings {
  taskbarPosition: TaskbarPosition;
  tray: TraySettings;
  theme: ThemeSettings;
  desktop: DesktopSettings;
  container: ContainerSettings;
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
    activeCustomThemeId: null,
  },
  desktop: {
    iconSize: "medium",
    showLabels: true,
    gridSpacing: "normal",
    coloredIcons: true,
    backgroundType: "default",
    backgroundColor: "#1a1a2e",
    backgroundGradient: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    backgroundImage: "",
  },
  container: {
    defaultRestartPolicy: "unless-stopped",
    defaultNetworkMode: "bridge",
    autoStartContainers: true,
    enablePrivilegedByDefault: false,
  },
};

interface SettingsContextType {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  updateTraySettings: (updates: Partial<TraySettings>) => void;
  updateThemeSettings: (updates: Partial<ThemeSettings>) => void;
  updateDesktopSettings: (updates: Partial<DesktopSettings>) => void;
  updateContainerSettings: (updates: Partial<ContainerSettings>) => void;
  resetSettings: () => void;
  // Custom theme management
  customThemes: CustomTheme[];
  addCustomTheme: (theme: CustomTheme) => void;
  removeCustomTheme: (themeId: string) => void;
  applyCustomTheme: (themeId: string | null) => void;
  getActiveCustomTheme: () => CustomTheme | null;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY = "stardeck-settings";
const CUSTOM_THEMES_KEY = "stardeck-custom-themes";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings and custom themes from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Ensure theme has activeCustomThemeId (migration)
        if (parsed.theme && parsed.theme.activeCustomThemeId === undefined) {
          parsed.theme.activeCustomThemeId = null;
        }
        // Ensure container settings exist (migration)
        if (!parsed.container) {
          parsed.container = defaultSettings.container;
        }
        setSettings({ ...defaultSettings, ...parsed });
      }

      // Load custom themes
      const storedThemes = localStorage.getItem(CUSTOM_THEMES_KEY);
      if (storedThemes) {
        const parsedThemes = JSON.parse(storedThemes);
        setCustomThemes(parsedThemes);
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

  // Save custom themes to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(customThemes));
      } catch (e) {
        console.error("Failed to save custom themes:", e);
      }
    }
  }, [customThemes, isLoaded]);

  // Apply theme (custom theme or accent color) to CSS variables
  useEffect(() => {
    if (!isLoaded) return;

    const root = document.documentElement;
    const isDark = root.classList.contains("dark");

    // Check if a custom theme is active
    const activeTheme = settings.theme.activeCustomThemeId
      ? customThemes.find(t => t.id === settings.theme.activeCustomThemeId)
      : null;

    if (activeTheme) {
      // Apply custom theme variables
      const variables = isDark ? activeTheme.darkVariables : activeTheme.lightVariables;
      // If dark mode but no dark variables, fall back to light
      const fallbackVariables = Object.keys(variables).length > 0 ? variables : activeTheme.lightVariables;
      applyThemeVariables(fallbackVariables, isDark);
    } else {
      // Clear any custom theme variables first
      clearThemeVariables(getThemeableVariables());

      // Apply default accent color
      const colorDef = accentColors[settings.theme.accentColor];
      root.style.setProperty("--accent", isDark ? colorDef.dark : colorDef.light);
      root.style.setProperty("--accent-foreground", isDark ? colorDef.darkForeground : colorDef.lightForeground);
      root.style.setProperty("--ring", isDark ? colorDef.dark : colorDef.light);
    }
  }, [settings.theme.accentColor, settings.theme.activeCustomThemeId, customThemes, isLoaded]);

  // Watch for dark mode changes and reapply theme
  useEffect(() => {
    if (!isLoaded) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes" && mutation.attributeName === "class") {
          const root = document.documentElement;
          const isDark = root.classList.contains("dark");

          // Check if a custom theme is active
          const activeTheme = settings.theme.activeCustomThemeId
            ? customThemes.find(t => t.id === settings.theme.activeCustomThemeId)
            : null;

          if (activeTheme) {
            // Apply custom theme variables for the new mode
            const variables = isDark ? activeTheme.darkVariables : activeTheme.lightVariables;
            const fallbackVariables = Object.keys(variables).length > 0 ? variables : activeTheme.lightVariables;
            applyThemeVariables(fallbackVariables, isDark);
          } else {
            const colorDef = accentColors[settings.theme.accentColor];
            root.style.setProperty("--accent", isDark ? colorDef.dark : colorDef.light);
            root.style.setProperty("--accent-foreground", isDark ? colorDef.darkForeground : colorDef.lightForeground);
            root.style.setProperty("--ring", isDark ? colorDef.dark : colorDef.light);
          }
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [settings.theme.accentColor, settings.theme.activeCustomThemeId, customThemes, isLoaded]);

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

  const updateContainerSettings = (updates: Partial<ContainerSettings>) => {
    setSettings((prev) => ({
      ...prev,
      container: { ...prev.container, ...updates },
    }));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
  };

  // Custom theme management functions
  const addCustomTheme = (theme: CustomTheme) => {
    setCustomThemes((prev) => [...prev, theme]);
  };

  const removeCustomTheme = (themeId: string) => {
    // If the theme being removed is active, clear the active theme
    if (settings.theme.activeCustomThemeId === themeId) {
      updateThemeSettings({ activeCustomThemeId: null });
    }
    setCustomThemes((prev) => prev.filter((t) => t.id !== themeId));
  };

  const applyCustomTheme = (themeId: string | null) => {
    updateThemeSettings({ activeCustomThemeId: themeId });
  };

  const getActiveCustomTheme = (): CustomTheme | null => {
    if (!settings.theme.activeCustomThemeId) return null;
    return customThemes.find((t) => t.id === settings.theme.activeCustomThemeId) || null;
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        updateTraySettings,
        updateThemeSettings,
        updateDesktopSettings,
        updateContainerSettings,
        resetSettings,
        // Custom theme management
        customThemes,
        addCustomTheme,
        removeCustomTheme,
        applyCustomTheme,
        getActiveCustomTheme,
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
