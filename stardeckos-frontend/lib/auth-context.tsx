"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: number;
  username: string;
  display_name: string;
  role: "admin" | "operator" | "viewer";
  auth_type: "local" | "pam";
  disabled: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string, authType?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = "/api";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("stardeck-token");
    localStorage.removeItem("stardeck-user");
  }, []);

  const validateSession = useCallback(async (sessionToken: string) => {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        // Session invalid, clear storage
        clearSession();
        return;
      }

      const data = await response.json();
      setUser(data.user);
    } catch {
      // Network error, keep the stored session for offline support
      console.warn("Could not validate session with server");
    }
  }, [clearSession]);

  useEffect(() => {
    // Check for stored session on mount
    const storedToken = localStorage.getItem("stardeck-token");
    const storedUser = localStorage.getItem("stardeck-user");

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      // Optionally validate the token with the server
      validateSession(storedToken);
    }
    setIsLoading(false);
  }, [validateSession]);

  const login = async (
    username: string,
    password: string,
    authType?: string
  ): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          auth_type: authType || "", // Empty string tries both local and PAM
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Login failed");
      }

      const data = await response.json();

      setUser(data.user);
      setToken(data.token);
      localStorage.setItem("stardeck-token", data.token);
      localStorage.setItem("stardeck-user", JSON.stringify(data.user));

      return true;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch {
      // Ignore logout errors
    } finally {
      clearSession();
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAuthenticated: !!user && !!token,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
