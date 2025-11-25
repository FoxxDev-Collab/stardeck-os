"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "@/lib/settings-context";

interface DesktopIconProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  description?: string;
  color?: string;
}

export function DesktopIcon({ icon, label, href, description, color }: DesktopIconProps) {
  const router = useRouter();
  const { settings } = useSettings();
  const [isSelected, setIsSelected] = useState(false);

  const useColor = settings.desktop.coloredIcons && color;

  const handleClick = () => {
    setIsSelected(true);
  };

  const handleDoubleClick = () => {
    router.push(href);
  };

  const handleBlur = () => {
    setIsSelected(false);
  };

  // Determine icon color class
  const getIconColorClass = () => {
    if (isSelected) {
      return useColor ? `${color} scale-110` : "text-accent scale-110";
    }
    if (useColor) {
      return `${color} group-hover:scale-110`;
    }
    return "text-muted-foreground group-hover:text-accent";
  };

  // Determine border color for colored icons
  const getBorderColorClass = () => {
    if (useColor) {
      // Extract the color name from the class (e.g., "text-chart-3" -> "border-chart-3")
      const borderColor = color?.replace("text-", "border-");
      if (isSelected) {
        return `${borderColor} bg-card/70 shadow-lg`;
      }
      return `border-border/60 bg-card/70 group-hover:${borderColor}/50 group-hover:bg-card/90`;
    }
    if (isSelected) {
      return "border-accent bg-accent/20 shadow-[0_0_15px_rgba(112,187,179,0.4)]";
    }
    return "border-border/60 bg-card/70 group-hover:border-accent/50 group-hover:bg-accent/10";
  };

  // Get corner accent color
  const getCornerColorClass = () => {
    if (useColor) {
      return color?.replace("text-", "border-") + "/60";
    }
    return "border-accent/60";
  };

  const cornerColor = getCornerColorClass();

  return (
    <button
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onBlur={handleBlur}
      className={`
        group flex flex-col items-center gap-2 p-4 rounded-lg w-28
        transition-all duration-200 outline-none
        ${isSelected
          ? "bg-accent/20 border border-accent/50 shadow-[0_0_20px_rgba(112,187,179,0.3)]"
          : "border border-transparent hover:bg-accent/10 hover:border-accent/20"
        }
      `}
      title={description}
    >
      {/* Icon container */}
      <div
        className={`
          relative w-16 h-16 flex items-center justify-center
          rounded-lg border-2 transition-all duration-200
          ${getBorderColorClass()}
        `}
      >
        {/* Corner accents */}
        <div className={`absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 ${cornerColor}`} />
        <div className={`absolute -top-px -right-px w-2 h-2 border-t-2 border-r-2 ${cornerColor}`} />
        <div className={`absolute -bottom-px -left-px w-2 h-2 border-b-2 border-l-2 ${cornerColor}`} />
        <div className={`absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 ${cornerColor}`} />

        {/* Icon */}
        <div className={`transition-all duration-200 ${getIconColorClass()}`}>
          {icon}
        </div>
      </div>

      {/* Label */}
      <span
        className={`
          text-xs font-medium text-center leading-tight max-w-full
          transition-colors duration-200 px-1 py-0.5 rounded
          ${isSelected
            ? "text-accent bg-accent/10"
            : "text-foreground/80 group-hover:text-foreground"
          }
        `}
      >
        {label}
      </span>
    </button>
  );
}
