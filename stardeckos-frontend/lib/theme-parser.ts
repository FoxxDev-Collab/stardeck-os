/**
 * Theme Parser Utility
 * Parses CSS from tweakcn.com format and extracts CSS custom properties
 */

export interface ParsedThemeVariables {
  // Core colors
  background?: string;
  foreground?: string;
  card?: string;
  "card-foreground"?: string;
  popover?: string;
  "popover-foreground"?: string;
  primary?: string;
  "primary-foreground"?: string;
  secondary?: string;
  "secondary-foreground"?: string;
  muted?: string;
  "muted-foreground"?: string;
  accent?: string;
  "accent-foreground"?: string;
  destructive?: string;
  "destructive-foreground"?: string;
  border?: string;
  input?: string;
  ring?: string;
  // Chart colors
  "chart-1"?: string;
  "chart-2"?: string;
  "chart-3"?: string;
  "chart-4"?: string;
  "chart-5"?: string;
  // Sidebar
  sidebar?: string;
  "sidebar-foreground"?: string;
  "sidebar-primary"?: string;
  "sidebar-primary-foreground"?: string;
  "sidebar-accent"?: string;
  "sidebar-accent-foreground"?: string;
  "sidebar-border"?: string;
  "sidebar-ring"?: string;
  // Typography
  "font-sans"?: string;
  "font-serif"?: string;
  "font-mono"?: string;
  // Radius and spacing
  radius?: string;
  spacing?: string;
  "tracking-normal"?: string;
  // Shadows
  "shadow-x"?: string;
  "shadow-y"?: string;
  "shadow-blur"?: string;
  "shadow-spread"?: string;
  "shadow-opacity"?: string;
  "shadow-color"?: string;
  "shadow-2xs"?: string;
  "shadow-xs"?: string;
  "shadow-sm"?: string;
  shadow?: string;
  "shadow-md"?: string;
  "shadow-lg"?: string;
  "shadow-xl"?: string;
  "shadow-2xl"?: string;
  // Allow additional properties
  [key: string]: string | undefined;
}

export interface CustomTheme {
  id: string;
  name: string;
  createdAt: string;
  lightVariables: ParsedThemeVariables;
  darkVariables: ParsedThemeVariables;
  rawCss: string;
}

/**
 * Parse CSS custom properties from a CSS block (e.g., :root or .dark)
 */
function parseVariablesFromBlock(cssBlock: string): ParsedThemeVariables {
  const variables: ParsedThemeVariables = {};

  // Match CSS custom properties: --property-name: value;
  const regex = /--([a-zA-Z0-9-]+):\s*([^;]+);/g;
  let match;

  while ((match = regex.exec(cssBlock)) !== null) {
    const propertyName = match[1];
    const value = match[2].trim();
    variables[propertyName] = value;
  }

  return variables;
}

/**
 * Extract the :root block from CSS
 */
function extractRootBlock(css: string): string | null {
  // Match :root { ... } - handles nested braces
  const rootMatch = css.match(/:root\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/);
  return rootMatch ? rootMatch[1] : null;
}

/**
 * Extract the .dark block from CSS
 */
function extractDarkBlock(css: string): string | null {
  // Match .dark { ... } - handles nested braces
  const darkMatch = css.match(/\.dark\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/);
  return darkMatch ? darkMatch[1] : null;
}

/**
 * Parse tweakcn CSS format and extract theme variables
 */
export function parseThemeCSS(css: string): { light: ParsedThemeVariables; dark: ParsedThemeVariables } {
  const rootBlock = extractRootBlock(css);
  const darkBlock = extractDarkBlock(css);

  const lightVariables = rootBlock ? parseVariablesFromBlock(rootBlock) : {};
  const darkVariables = darkBlock ? parseVariablesFromBlock(darkBlock) : {};

  return {
    light: lightVariables,
    dark: darkVariables,
  };
}

/**
 * Validate that the parsed theme has the minimum required variables
 */
export function validateTheme(theme: { light: ParsedThemeVariables; dark: ParsedThemeVariables }): {
  isValid: boolean;
  errors: string[];
} {
  const requiredVariables = [
    "background",
    "foreground",
    "primary",
    "accent",
  ];

  const errors: string[] = [];

  // Check light theme
  for (const varName of requiredVariables) {
    if (!theme.light[varName]) {
      errors.push(`Missing light theme variable: --${varName}`);
    }
  }

  // Check dark theme (optional but warn)
  const hasDarkTheme = Object.keys(theme.dark).length > 0;
  if (!hasDarkTheme) {
    errors.push("Warning: No dark theme variables found. Light theme will be used for both modes.");
  }

  return {
    isValid: errors.filter(e => !e.startsWith("Warning")).length === 0,
    errors,
  };
}

/**
 * Apply theme variables to the document root
 */
export function applyThemeVariables(
  variables: ParsedThemeVariables,
  isDarkMode: boolean = false
): void {
  const root = document.documentElement;

  // Apply each variable to the root element
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined) {
      root.style.setProperty(`--${key}`, value);
    }
  }
}

/**
 * Remove custom theme variables from the document root
 * This resets to the default stylesheet values
 */
export function clearThemeVariables(variableNames: string[]): void {
  const root = document.documentElement;

  for (const name of variableNames) {
    root.style.removeProperty(`--${name}`);
  }
}

/**
 * Get all CSS custom property names that can be themed
 */
export function getThemeableVariables(): string[] {
  return [
    "background", "foreground",
    "card", "card-foreground",
    "popover", "popover-foreground",
    "primary", "primary-foreground",
    "secondary", "secondary-foreground",
    "muted", "muted-foreground",
    "accent", "accent-foreground",
    "destructive", "destructive-foreground",
    "border", "input", "ring",
    "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
    "sidebar", "sidebar-foreground",
    "sidebar-primary", "sidebar-primary-foreground",
    "sidebar-accent", "sidebar-accent-foreground",
    "sidebar-border", "sidebar-ring",
    "font-sans", "font-serif", "font-mono",
    "radius", "spacing", "tracking-normal",
    "shadow-2xs", "shadow-xs", "shadow-sm", "shadow",
    "shadow-md", "shadow-lg", "shadow-xl", "shadow-2xl",
  ];
}

/**
 * Generate a unique ID for a theme
 */
export function generateThemeId(): string {
  return `theme_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a CustomTheme object from parsed CSS
 */
export function createCustomTheme(
  name: string,
  css: string,
  parsed: { light: ParsedThemeVariables; dark: ParsedThemeVariables }
): CustomTheme {
  return {
    id: generateThemeId(),
    name,
    createdAt: new Date().toISOString(),
    lightVariables: parsed.light,
    darkVariables: parsed.dark,
    rawCss: css,
  };
}

/**
 * Export theme to CSS format (for sharing)
 */
export function exportThemeToCSS(theme: CustomTheme): string {
  let css = `:root {\n`;

  for (const [key, value] of Object.entries(theme.lightVariables)) {
    if (value !== undefined) {
      css += `  --${key}: ${value};\n`;
    }
  }

  css += `}\n\n.dark {\n`;

  for (const [key, value] of Object.entries(theme.darkVariables)) {
    if (value !== undefined) {
      css += `  --${key}: ${value};\n`;
    }
  }

  css += `}\n`;

  return css;
}
