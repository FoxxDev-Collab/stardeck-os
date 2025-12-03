"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Server, Network, Share2, AlertCircle, Loader2 } from "lucide-react";

export interface ManagedDatabase {
  id: string;
  name: string;
  type: 'postgresql' | 'mariadb' | 'mysql' | 'redis' | 'mongodb';
  version: string;
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'unknown';
  internal_host: string;
  internal_port: number;
  external_port: number;
  is_shared: boolean;
  connection_count: number;
  created_at: string;
}

interface DatabaseCardProps {
  database: ManagedDatabase;
  onClick?: () => void;
}

export function DatabaseCard({ database, onClick }: DatabaseCardProps) {
  // Database type colors and labels
  const getDatabaseTypeInfo = (type: string) => {
    switch (type) {
      case 'postgresql':
        return { color: 'text-blue-400', bgColor: 'bg-blue-500/10', label: 'PostgreSQL' };
      case 'mariadb':
        return { color: 'text-amber-400', bgColor: 'bg-amber-500/10', label: 'MariaDB' };
      case 'mysql':
        return { color: 'text-orange-400', bgColor: 'bg-orange-500/10', label: 'MySQL' };
      case 'redis':
        return { color: 'text-red-400', bgColor: 'bg-red-500/10', label: 'Redis' };
      case 'mongodb':
        return { color: 'text-green-400', bgColor: 'bg-green-500/10', label: 'MongoDB' };
      default:
        return { color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', label: 'Database' };
    }
  };

  // Status badge variants
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'running':
        return {
          label: 'Running',
          className: 'bg-green-500/10 text-green-400 border-green-500/50',
          indicator: 'bg-green-500',
          animated: true,
        };
      case 'stopped':
        return {
          label: 'Stopped',
          className: 'bg-gray-500/10 text-gray-400 border-gray-500/50',
          indicator: 'bg-gray-500',
          animated: false,
        };
      case 'starting':
        return {
          label: 'Starting',
          className: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/50',
          indicator: 'bg-cyan-500',
          animated: true,
        };
      case 'stopping':
        return {
          label: 'Stopping',
          className: 'bg-amber-500/10 text-amber-400 border-amber-500/50',
          indicator: 'bg-amber-500',
          animated: true,
        };
      case 'error':
        return {
          label: 'Error',
          className: 'bg-red-500/10 text-red-400 border-red-500/50',
          indicator: 'bg-red-500',
          animated: true,
        };
      default:
        return {
          label: 'Unknown',
          className: 'bg-muted/50 text-muted-foreground border-border/50',
          indicator: 'bg-muted-foreground',
          animated: false,
        };
    }
  };

  const typeInfo = getDatabaseTypeInfo(database.type);
  const statusInfo = getStatusInfo(database.status);

  return (
    <Card
      onClick={onClick}
      className={`
        relative border-border/50 bg-card/70 transition-all duration-200
        ${onClick ? 'cursor-pointer hover:bg-card/90 hover:border-cyan-500/50 hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]' : ''}
        group
      `}
    >
      {/* Corner accents */}
      <div className="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-cyan-500/40 transition-colors group-hover:border-cyan-500/70" />
      <div className="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-cyan-500/40 transition-colors group-hover:border-cyan-500/70" />
      <div className="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-cyan-500/40 transition-colors group-hover:border-cyan-500/70" />
      <div className="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-cyan-500/40 transition-colors group-hover:border-cyan-500/70" />

      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Icon */}
            <div
              className={`
                relative w-12 h-12 flex items-center justify-center rounded-lg
                border-2 border-border/60 ${typeInfo.bgColor}
                transition-all duration-200 group-hover:border-cyan-500/50
              `}
            >
              <Database className={`w-6 h-6 ${typeInfo.color}`} />

              {/* Status indicator */}
              <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${statusInfo.indicator} border-2 border-background`}>
                {statusInfo.animated && (
                  <div className={`absolute inset-0 rounded-full ${statusInfo.indicator} animate-ping opacity-75`} />
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-foreground truncate group-hover:text-cyan-400 transition-colors">
                {database.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {typeInfo.label} {database.version}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <Badge variant="outline" className={`${statusInfo.className} text-xs shrink-0 gap-1.5`}>
            {database.status === 'starting' || database.status === 'stopping' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : database.status === 'error' ? (
              <AlertCircle className="w-3 h-3" />
            ) : null}
            {statusInfo.label}
          </Badge>
        </div>

        {/* Divider */}
        <div className="h-px bg-border/50" />

        {/* Connection Details */}
        <div className="space-y-2 text-xs">
          {/* Internal address */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Server className="w-3.5 h-3.5 text-cyan-400/70" />
            <span className="font-mono">
              {database.internal_host}:{database.internal_port}
            </span>
          </div>

          {/* External port */}
          {database.external_port > 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Network className="w-3.5 h-3.5 text-amber-400/70" />
              <span className="font-mono">
                External: :{database.external_port}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-3">
            {/* Connection count */}
            <span className="text-xs text-muted-foreground">
              <span className="font-mono text-cyan-400">{database.connection_count}</span> connections
            </span>

            {/* Shared badge */}
            {database.is_shared && (
              <Badge variant="secondary" className="text-xs gap-1 bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                <Share2 className="w-3 h-3" />
                Shared
              </Badge>
            )}
          </div>

          {/* Created date */}
          <span className="text-xs text-muted-foreground">
            {new Date(database.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
