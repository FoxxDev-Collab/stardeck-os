const API_BASE = '/api';

export async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Health check
  health: () => apiFetch<{ status: string }>('/health'),

  // Auth
  auth: {
    login: (username: string, password: string) =>
      apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    logout: () => apiFetch('/auth/logout', { method: 'POST' }),
  },

  // System
  system: {
    info: () => apiFetch('/system/info'),
    resources: () => apiFetch('/system/resources'),
  },

  // Processes
  processes: {
    list: () => apiFetch('/processes'),
    kill: (pid: number) =>
      apiFetch(`/processes/${pid}`, { method: 'DELETE' }),
  },

  // Services
  services: {
    list: () => apiFetch('/services'),
    get: (name: string) => apiFetch(`/services/${name}`),
    action: (name: string, action: 'start' | 'stop' | 'restart' | 'enable' | 'disable') =>
      apiFetch(`/services/${name}/${action}`, { method: 'POST' }),
  },

  // Updates
  updates: {
    available: () => apiFetch('/updates/available'),
    apply: (packages?: string[]) =>
      apiFetch('/updates/apply', {
        method: 'POST',
        body: JSON.stringify({ packages }),
      }),
    history: () => apiFetch('/updates/history'),
  },

  // Storage
  storage: {
    disks: () => apiFetch('/storage/disks'),
    mounts: () => apiFetch('/storage/mounts'),
    lvm: () => apiFetch('/storage/lvm'),
  },

  // Users
  users: {
    list: () => apiFetch('/users'),
    get: (id: number) => apiFetch(`/users/${id}`),
    create: (data: { username: string; password: string; display_name?: string; role?: string }) =>
      apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: { display_name?: string; role?: string; disabled?: boolean }) =>
      apiFetch(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      apiFetch(`/users/${id}`, { method: 'DELETE' }),
  },
};
