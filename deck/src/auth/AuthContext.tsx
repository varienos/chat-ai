import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { client } from "../api/client";

interface AuthContextType {
  user: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if we have a valid session cookie by calling /me
    client.get<{ username: string }>("/deck/api/auth/me")
      .then(data => setUser(data.username))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    await client.post<{ ok: boolean }>("/deck/api/auth/login", { username, password });
    // Cookie is set by the server via Set-Cookie — just update local state
    setUser(username);
  };

  const logout = async () => {
    try {
      await client.post("/deck/api/auth/logout", {});
    } catch {
      // Best-effort logout
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
