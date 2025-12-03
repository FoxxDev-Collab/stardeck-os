"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  Zap,
  Shield,
  Boxes,
  ChevronRight,
  Info,
  Star,
} from "lucide-react";

interface DatabaseWelcomeProps {
  onCreateDatabase?: (type: 'postgresql' | 'mariadb' | 'mysql') => void;
  onSkip?: () => void;
}

interface DatabaseTypeOption {
  type: 'postgresql' | 'mariadb' | 'mysql';
  label: string;
  description: string;
  icon: string;
  iconColor: string;
  bgColor: string;
  popular?: boolean;
  useCases: string[];
}

export function DatabaseWelcome({ onCreateDatabase, onSkip }: DatabaseWelcomeProps) {
  const [selectedType, setSelectedType] = useState<'postgresql' | 'mariadb' | 'mysql' | null>(null);

  const databaseTypes: DatabaseTypeOption[] = [
    {
      type: 'postgresql',
      label: 'PostgreSQL',
      description: 'Advanced open-source database with strong ACID compliance',
      icon: '🐘',
      iconColor: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      popular: true,
      useCases: ['Web apps', 'Analytics', 'Geospatial data'],
    },
    {
      type: 'mariadb',
      label: 'MariaDB',
      description: 'Drop-in MySQL replacement with enhanced performance',
      icon: '🦭',
      iconColor: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      useCases: ['WordPress', 'CMS', 'E-commerce'],
    },
    {
      type: 'mysql',
      label: 'MySQL',
      description: 'World\'s most popular open-source relational database',
      icon: '🐬',
      iconColor: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
      useCases: ['Enterprise apps', 'SaaS', 'High traffic sites'],
    },
  ];

  const benefits = [
    {
      icon: Zap,
      title: 'Quick Setup',
      description: 'Deploy production-ready databases in seconds',
    },
    {
      icon: Shield,
      title: 'Secure by Default',
      description: 'Isolated containers with network controls',
    },
    {
      icon: Boxes,
      title: 'Share Across Apps',
      description: 'One database for multiple container applications',
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Hero Section */}
      <Card className="border-border/50 bg-card/70 overflow-hidden">
        {/* Corner accents */}
        <div className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-cyan-500/60" />
        <div className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-cyan-500/60" />
        <div className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-cyan-500/60" />
        <div className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-cyan-500/60" />

        <CardContent className="p-8 sm:p-12 text-center">
          {/* Icon */}
          <div className="relative inline-flex mb-6">
            <div
              className="
                w-20 h-20 rounded-lg border-2 border-cyan-500/50 bg-cyan-500/10
                flex items-center justify-center
                shadow-[0_0_30px_rgba(6,182,212,0.2)]
              "
            >
              <Database className="w-10 h-10 text-cyan-400" />
            </div>
            {/* Pulse rings */}
            <div className="absolute inset-0 rounded-lg border-2 border-cyan-500/30 animate-ping" />
            <div className="absolute inset-0 rounded-lg border-2 border-cyan-500/20 animate-pulse" style={{ animationDelay: '0.5s' }} />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-foreground mb-3">
            Set Up Your First Database
          </h1>

          {/* Description */}
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
            Deploy managed databases for your container applications. Perfect for WordPress,
            web apps, or any service that needs persistent data storage.
          </p>

          {/* Benefits Grid */}
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="p-4 rounded-lg border border-border/50 bg-background/50 text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center shrink-0">
                    <benefit.icon className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm mb-1">{benefit.title}</h3>
                    <p className="text-xs text-muted-foreground">{benefit.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Database Type Selection */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Choose a Database Type</h2>
          <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30">
            Step 1 of 2
          </Badge>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {databaseTypes.map((db) => (
            <Card
              key={db.type}
              onClick={() => setSelectedType(db.type)}
              className={`
                relative border-2 transition-all duration-200 cursor-pointer
                ${
                  selectedType === db.type
                    ? 'border-cyan-500 bg-card/90 shadow-[0_0_25px_rgba(6,182,212,0.3)]'
                    : 'border-border/50 bg-card/70 hover:border-cyan-500/50 hover:bg-card/90'
                }
              `}
            >
              {/* Popular badge */}
              {db.popular && (
                <div className="absolute -top-2 -right-2 z-10">
                  <Badge className="bg-amber-500 text-amber-950 border-amber-600 gap-1 shadow-lg">
                    <Star className="w-3 h-3 fill-current" />
                    Popular
                  </Badge>
                </div>
              )}

              {/* Selection indicator */}
              {selectedType === db.type && (
                <>
                  <div className="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-cyan-400" />
                  <div className="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-cyan-400" />
                  <div className="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-cyan-400" />
                  <div className="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-cyan-400" />
                </>
              )}

              <CardContent className="p-5 space-y-3">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-lg border border-border/50 ${db.bgColor} flex items-center justify-center text-2xl`}>
                    {db.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold ${selectedType === db.type ? 'text-cyan-400' : 'text-foreground'} transition-colors`}>
                      {db.label}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {db.description}
                    </p>
                  </div>
                </div>

                {/* Use cases */}
                <div className="pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-2">Best for:</p>
                  <div className="flex flex-wrap gap-1">
                    {db.useCases.map((useCase) => (
                      <Badge
                        key={useCase}
                        variant="secondary"
                        className="text-xs bg-background/50 border-border/50"
                      >
                        {useCase}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Info Section */}
      <Card className="border-border/50 bg-card/70">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center shrink-0">
              <Info className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-sm mb-2">Why set up a database now?</h3>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                  <span>Many container apps (WordPress, Ghost, etc.) require a database to function</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                  <span>Shared databases let multiple apps use the same database server, saving resources</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                  <span>You can always create more databases later from the Database Manager</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-4 pt-4">
        <Button
          variant="ghost"
          onClick={onSkip}
          className="text-muted-foreground hover:text-foreground"
        >
          Skip for now
        </Button>

        <Button
          onClick={() => selectedType && onCreateDatabase?.(selectedType)}
          disabled={!selectedType}
          size="lg"
          className={`
            gap-2 min-w-[200px] transition-all duration-200
            ${selectedType ? 'shadow-[0_0_20px_rgba(6,182,212,0.3)]' : ''}
          `}
        >
          Create {selectedType ? databaseTypes.find(db => db.type === selectedType)?.label : 'Database'}
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
