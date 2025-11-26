"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme-provider";

interface SubtleStarfieldProps {
  starCount?: number;
  speed?: number;
  opacity?: number;
}

export function SubtleStarfield({
  starCount = 80,
  speed = 0.08,
  opacity = 0.6
}: SubtleStarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

  // Resolve the actual theme (handle "system" case)
  useEffect(() => {
    if (theme === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setResolvedTheme(isDark ? "dark" : "light");

      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        setResolvedTheme(e.matches ? "dark" : "light");
      };
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    } else {
      setResolvedTheme(theme);
    }
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isDark = resolvedTheme === "dark";

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Create stars with varied properties
    const stars: {
      x: number;
      y: number;
      size: number;
      speed: number;
      brightness: number;
      twinkleOffset: number;
    }[] = [];

    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.2 + 0.3,
        speed: (Math.random() * 0.5 + 0.5) * speed,
        brightness: Math.random() * 0.4 + 0.3,
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }

    let animationId: number;

    const animate = () => {
      // Clear with theme-appropriate color
      if (isDark) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      }
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const time = Date.now() * 0.001;

      stars.forEach((star) => {
        // Slow drift to the left
        star.x -= star.speed;
        if (star.x < -5) {
          star.x = canvas.width + 5;
          star.y = Math.random() * canvas.height;
        }

        // Gentle twinkle effect
        const twinkle = Math.sin(time * 0.5 + star.twinkleOffset) * 0.3 + 0.7;
        const finalBrightness = star.brightness * twinkle * opacity;

        // Draw star with theme-appropriate colors
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);

        if (isDark) {
          // Light blue-white stars on dark background
          ctx.fillStyle = `rgba(200, 210, 255, ${finalBrightness})`;
        } else {
          // Darker blue-gray stars on light background
          ctx.fillStyle = `rgba(80, 100, 140, ${finalBrightness * 0.7})`;
        }
        ctx.fill();

        // Add subtle glow to larger stars
        if (star.size > 0.8) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 2, 0, Math.PI * 2);
          if (isDark) {
            ctx.fillStyle = `rgba(180, 200, 255, ${finalBrightness * 0.15})`;
          } else {
            ctx.fillStyle = `rgba(60, 80, 120, ${finalBrightness * 0.1})`;
          }
          ctx.fill();
        }
      });

      animationId = requestAnimationFrame(animate);
    };

    // Initial clear with theme-appropriate background
    if (isDark) {
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 1)";
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, [starCount, speed, opacity, resolvedTheme]);

  const isDark = resolvedTheme === "dark";

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{ mixBlendMode: isDark ? "screen" : "multiply" }}
    />
  );
}
