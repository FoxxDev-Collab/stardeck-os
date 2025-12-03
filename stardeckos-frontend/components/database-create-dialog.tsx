"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Database,
  ChevronRight,
  ChevronLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  Server,
  Boxes,
  Zap,
  FileJson,
  AlertCircle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface DatabaseType {
  id: string;
  name: string;
  description: string;
  default_version: string;
  available_versions: string[];
  default_port: number;
  icon: string;
}

interface CreateDatabaseRequest {
  type: 'postgresql' | 'mariadb' | 'mysql' | 'redis' | 'mongodb';
  name: string;
  version?: string;
  expose_port: boolean;
  external_port?: number;
  is_shared: boolean;
  admin_password: string;
}

interface CreateDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDatabaseCreated?: () => void;
}

const DATABASE_ICONS: Record<string, React.ReactNode> = {
  postgresql: <Server className="w-8 h-8" />,
  mariadb: <Database className="w-8 h-8" />,
  mysql: <Boxes className="w-8 h-8" />,
  redis: <Zap className="w-8 h-8" />,
  mongodb: <FileJson className="w-8 h-8" />,
};

const generatePassword = (length: number = 24): string => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
  }
  return password;
};

export function CreateDatabaseDialog({
  open,
  onOpenChange,
  onDatabaseCreated,
}: CreateDatabaseDialogProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [databaseTypes, setDatabaseTypes] = useState<DatabaseType[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  // Form state
  const [selectedType, setSelectedType] = useState<string>('');
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [exposePort, setExposePort] = useState(false);
  const [externalPort, setExternalPort] = useState<number | undefined>();
  const [isShared, setIsShared] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');

  // Fetch database types when dialog opens
  useEffect(() => {
    if (open) {
      fetchDatabaseTypes();
      // Generate initial password
      setAdminPassword(generatePassword());
    } else {
      // Reset form when dialog closes
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setStep(1);
    setSelectedType('');
    setName('');
    setVersion('');
    setExposePort(false);
    setExternalPort(undefined);
    setIsShared(false);
    setAdminPassword('');
    setError(null);
    setPasswordCopied(false);
  };

  const fetchDatabaseTypes = async () => {
    setLoadingTypes(true);
    setError(null);
    try {
      const response = await fetch('/api/databases/types');
      if (!response.ok) {
        throw new Error('Failed to fetch database types');
      }
      const data = await response.json();
      setDatabaseTypes(data.types || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load database types');
    } finally {
      setLoadingTypes(false);
    }
  };

  const validateName = (name: string): boolean => {
    const regex = /^[a-zA-Z0-9_-]+$/;
    return regex.test(name) && name.length > 0;
  };

  const handleNextStep = () => {
    setError(null);

    if (step === 1) {
      if (!selectedType) {
        setError('Please select a database type');
        return;
      }
      // Set default version when moving to step 2
      const dbType = databaseTypes.find((t) => t.id === selectedType);
      if (dbType && !version) {
        setVersion(dbType.default_version);
      }
      setStep(2);
    } else if (step === 2) {
      if (!name) {
        setError('Database name is required');
        return;
      }
      if (!validateName(name)) {
        setError('Database name must contain only alphanumeric characters, dashes, and underscores');
        return;
      }
      if (exposePort && externalPort) {
        if (externalPort < 1024 || externalPort > 65535) {
          setError('Port must be between 1024 and 65535');
          return;
        }
      }
      setStep(3);
    }
  };

  const handlePreviousStep = () => {
    setError(null);
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleCreate = async () => {
    setLoading(true);
    setError(null);

    try {
      const requestBody: CreateDatabaseRequest = {
        type: selectedType as CreateDatabaseRequest['type'],
        name,
        version: version || undefined,
        expose_port: exposePort,
        external_port: exposePort ? externalPort : undefined,
        is_shared: isShared,
        admin_password: adminPassword,
      };

      const response = await fetch('/api/databases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create database');
      }

      onDatabaseCreated?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create database');
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(adminPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy password:', err);
    }
  };

  const regeneratePassword = () => {
    setAdminPassword(generatePassword());
    setPasswordCopied(false);
  };

  const selectedDbType = databaseTypes.find((t) => t.id === selectedType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-xl font-mono text-amber-500">
            Create New Database
          </DialogTitle>
          <DialogDescription className="text-zinc-400 font-mono text-sm">
            Step {step} of 3
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[400px]">
          {/* Step 1: Choose Database Type */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label className="text-cyan-400 font-mono mb-3 block">
                  Select Database Type
                </Label>
                {loadingTypes ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
                  </div>
                ) : (
                  <RadioGroup
                    value={selectedType}
                    onValueChange={setSelectedType}
                    className="space-y-3"
                  >
                    {databaseTypes.map((dbType) => (
                      <div
                        key={dbType.id}
                        className={`flex items-start space-x-3 p-4 rounded border-2 transition-all cursor-pointer ${
                          selectedType === dbType.id
                            ? 'border-amber-500 bg-amber-500/10'
                            : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                        }`}
                        onClick={() => setSelectedType(dbType.id)}
                      >
                        <RadioGroupItem value={dbType.id} id={dbType.id} className="mt-1" />
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div
                              className={
                                selectedType === dbType.id ? 'text-amber-500' : 'text-cyan-400'
                              }
                            >
                              {DATABASE_ICONS[dbType.id] || <Database className="w-8 h-8" />}
                            </div>
                            <div>
                              <Label
                                htmlFor={dbType.id}
                                className="text-base font-mono cursor-pointer text-zinc-100"
                              >
                                {dbType.name}
                              </Label>
                              <p className="text-xs text-zinc-500 font-mono">
                                v{dbType.default_version}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm text-zinc-400 font-mono">{dbType.description}</p>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Configure Database */}
          {step === 2 && selectedDbType && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="db-name" className="text-cyan-400 font-mono">
                  Database Name *
                </Label>
                <Input
                  id="db-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-database"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 font-mono"
                />
                <p className="text-xs text-zinc-500 font-mono">
                  Alphanumeric characters, dashes, and underscores only
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="db-version" className="text-cyan-400 font-mono">
                  Version
                </Label>
                <Select value={version} onValueChange={setVersion}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 font-mono">
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {selectedDbType.available_versions.map((ver) => (
                      <SelectItem
                        key={ver}
                        value={ver}
                        className="text-zinc-100 font-mono focus:bg-zinc-700"
                      >
                        {ver}
                        {ver === selectedDbType.default_version && (
                          <span className="text-amber-500 ml-2">(default)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4 p-4 bg-zinc-800/50 rounded border border-zinc-700">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="expose-port" className="text-cyan-400 font-mono">
                      Expose Port
                    </Label>
                    <p className="text-xs text-zinc-500 font-mono">
                      Make database accessible from outside the container
                    </p>
                  </div>
                  <Switch
                    id="expose-port"
                    checked={exposePort}
                    onCheckedChange={setExposePort}
                  />
                </div>

                {exposePort && (
                  <div className="space-y-2 pt-2 border-t border-zinc-700">
                    <Label htmlFor="external-port" className="text-cyan-400 font-mono">
                      External Port
                    </Label>
                    <Input
                      id="external-port"
                      type="number"
                      value={externalPort || ''}
                      onChange={(e) =>
                        setExternalPort(e.target.value ? parseInt(e.target.value) : undefined)
                      }
                      placeholder={`${selectedDbType.default_port} (default)`}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 font-mono"
                      min="1024"
                      max="65535"
                    />
                    <p className="text-xs text-zinc-500 font-mono">
                      Leave blank to use default port {selectedDbType.default_port}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded border border-zinc-700">
                <div className="space-y-1">
                  <Label htmlFor="is-shared" className="text-cyan-400 font-mono">
                    Shared Database
                  </Label>
                  <p className="text-xs text-zinc-500 font-mono">
                    Allow multiple applications to use this database
                  </p>
                </div>
                <Switch id="is-shared" checked={isShared} onCheckedChange={setIsShared} />
              </div>
            </div>
          )}

          {/* Step 3: Review and Create */}
          {step === 3 && selectedDbType && (
            <div className="space-y-6">
              <div className="space-y-4 p-4 bg-zinc-800/50 rounded border border-zinc-700">
                <h3 className="text-sm font-mono text-amber-500 uppercase tracking-wide">
                  Configuration Summary
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                  <div>
                    <p className="text-zinc-500">Type:</p>
                    <p className="text-zinc-100">{selectedDbType.name}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Version:</p>
                    <p className="text-zinc-100">{version}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Name:</p>
                    <p className="text-zinc-100">{name}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Port:</p>
                    <p className="text-zinc-100">
                      {exposePort
                        ? externalPort || selectedDbType.default_port
                        : 'Internal only'}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Shared:</p>
                    <p className="text-zinc-100">{isShared ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-cyan-400 font-mono">Admin Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={adminPassword}
                    readOnly
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 font-mono pr-24"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 hover:bg-zinc-700"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-zinc-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-zinc-400" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 hover:bg-zinc-700"
                      onClick={copyPassword}
                    >
                      {passwordCopied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4 text-zinc-400" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={regeneratePassword}
                    className="text-xs font-mono border-zinc-700 hover:bg-zinc-800"
                  >
                    Regenerate
                  </Button>
                  {passwordCopied && (
                    <span className="text-xs text-green-500 font-mono flex items-center">
                      Password copied to clipboard
                    </span>
                  )}
                </div>
                <Alert className="bg-amber-500/10 border-amber-500/50">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <AlertDescription className="text-xs font-mono text-amber-200">
                    Save this password securely. It will only be shown once.
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          )}

          {error && (
            <Alert className="mt-4 bg-red-500/10 border-red-500/50">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <AlertDescription className="text-sm font-mono text-red-200">
                {error}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={handlePreviousStep}
              disabled={loading}
              className="font-mono border-zinc-700 hover:bg-zinc-800"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}

          {step < 3 ? (
            <Button
              onClick={handleNextStep}
              disabled={loadingTypes}
              className="font-mono bg-amber-500 hover:bg-amber-600 text-black"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={loading}
              className="font-mono bg-cyan-500 hover:bg-cyan-600 text-black"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Create Database
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
