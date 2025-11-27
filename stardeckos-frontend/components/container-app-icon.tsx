"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Box } from "lucide-react";

interface ContainerAppIconProps {
  containerId: string;
  name: string;
  icon?: string;
  iconLight?: string;
  iconDark?: string;
  status: string;
}

export function ContainerAppIcon({
  containerId,
  name,
  icon,
  iconLight,
  iconDark,
  status,
}: ContainerAppIconProps) {
  const router = useRouter();
  const [isSelected, setIsSelected] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(false);

  const isRunning = status === "running";

  // Detect dark mode from document class
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkTheme(document.documentElement.classList.contains("dark"));
    };

    checkDarkMode();

    // Watch for dark mode changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  // Determine which icon to use based on theme
  // Priority: themed icon > legacy icon > none
  const displayIcon = isDarkTheme
    ? (iconDark || icon)
    : (iconLight || icon);

  const handleClick = () => {
    setIsSelected(true);
  };

  const handleDoubleClick = () => {
    if (isRunning) {
      // Open the container app view with query parameter
      router.push(`/container-app?id=${encodeURIComponent(containerId)}`);
    }
  };

  const handleBlur = () => {
    setIsSelected(false);
  };

  // Status color
  const statusColor = isRunning ? "bg-green-500" : "bg-gray-500";

  return (
    <button
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onBlur={handleBlur}
      disabled={!isRunning}
      className={`
        group flex flex-col items-center gap-2 p-4 rounded-lg w-28
        transition-all duration-200 outline-none
        ${!isRunning ? "opacity-50 cursor-not-allowed" : ""}
        ${isSelected
          ? "bg-cyan-500/20 border border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
          : "border border-transparent hover:bg-cyan-500/10 hover:border-cyan-500/20"
        }
      `}
      title={isRunning ? `Open ${name}` : `${name} is not running`}
    >
      {/* Icon container */}
      <div
        className={`
          relative w-16 h-16 flex items-center justify-center
          rounded-lg border-2 transition-all duration-200
          ${isSelected
            ? "border-cyan-500 bg-card/70 shadow-lg"
            : "border-border/60 bg-card/70 group-hover:border-cyan-500/50 group-hover:bg-card/90"
          }
        `}
      >
        {/* Corner accents */}
        <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-cyan-500/60" />
        <div className="absolute -top-px -right-px w-2 h-2 border-t-2 border-r-2 border-cyan-500/60" />
        <div className="absolute -bottom-px -left-px w-2 h-2 border-b-2 border-l-2 border-cyan-500/60" />
        <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-cyan-500/60" />

        {/* Status indicator */}
        <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${statusColor} border-2 border-background`}>
          {isRunning && (
            <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
          )}
        </div>

        {/* Icon */}
        <div className={`transition-all duration-200 ${isSelected ? "text-cyan-400 scale-110" : "text-cyan-400/70 group-hover:text-cyan-400 group-hover:scale-110"}`}>
          {displayIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayIcon} alt={name} className="w-8 h-8 object-contain" />
          ) : (
            <Box className="w-8 h-8" />
          )}
        </div>
      </div>

      {/* Label */}
      <span
        className={`
          text-xs font-medium text-center leading-tight max-w-full truncate
          transition-colors duration-200 px-1 py-0.5 rounded
          ${isSelected
            ? "text-cyan-400 bg-cyan-500/10"
            : "text-foreground/80 group-hover:text-foreground"
          }
        `}
      >
        {name}
      </span>

      {/* Status text */}
      <span className={`text-[10px] ${isRunning ? "text-green-500" : "text-muted-foreground"}`}>
        {isRunning ? "Running" : "Stopped"}
      </span>
    </button>
  );
}
