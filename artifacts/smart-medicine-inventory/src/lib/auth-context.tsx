import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export interface UserProfile {
  id: number | string;
  userId?: string;
  role: "admin" | "customer" | "staff";
  fullName: string;
  email?: string | null;
  phone?: string | null;
  age?: number;
  address?: string;
  isFirstAdmin?: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  isCustomer: boolean;
  isSignedIn: boolean;
  login: (identifier: string, password: string, role: "admin" | "customer") => Promise<UserProfile>;
  logout: () => void;
  registerCustomer: (data: {
    fullName: string;
    age: number;
    phone: string;
    address: string;
    email?: string | null;
    password: string;
    confirmPassword: string;
    hasNoEmail?: boolean;
    verificationCode?: string;
  }) => Promise<UserProfile>;
  sendPhoneOtp: (phone: string) => Promise<{ code?: string; message: string }>;
  verifyPhoneOtp: (phone: string, code: string) => Promise<{ message: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type ApiResponse = Record<string, unknown>;

type RegistrationUserResponse = {
  id: number | string;
  fullName: string;
  role?: UserProfile["role"];
  email?: string | null;
  phone?: string | null;
  age?: number;
  address?: string;
};

function isRecord(value: unknown): value is ApiResponse {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRegistrationUser(value: unknown): value is RegistrationUserResponse {
  return (
    isRecord(value) &&
    (typeof value.id === "number" || typeof value.id === "string") &&
    typeof value.fullName === "string" &&
    (value.role === undefined ||
      value.role === "admin" ||
      value.role === "customer" ||
      value.role === "staff") &&
    (value.email === undefined || value.email === null || typeof value.email === "string") &&
    (value.phone === undefined || value.phone === null || typeof value.phone === "string") &&
    (value.age === undefined || typeof value.age === "number") &&
    (value.address === undefined || typeof value.address === "string")
  );
}

function isLoginResponse(
  value: unknown,
): value is ApiResponse & {
  token: string;
  user: RegistrationUserResponse & { role: UserProfile["role"] };
} {
  return (
    isRecord(value) &&
    typeof value.token === "string" &&
    isRegistrationUser(value.user) &&
    (value.user.role === "admin" ||
      value.user.role === "customer" ||
      value.user.role === "staff")
  );
}

async function fetchAuthJson(
  url: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<ApiResponse> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Unable to connect to the server. Check your connection and try again.");
    }
    throw error;
  }

  let responseText: string;
  try {
    responseText = await response.text();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("The server response could not be received. Please try again.");
    }
    throw error;
  }

  if (!responseText.trim()) {
    throw new Error(
      response.ok
        ? "The server returned an empty response. Please try again."
        : `${fallbackMessage} (HTTP ${response.status}; empty response).`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(
      response.ok
        ? "The server returned an invalid response. Please try again."
        : `${fallbackMessage} (HTTP ${response.status}; invalid response).`,
    );
  }

  if (!isRecord(payload)) {
    throw new Error(
      response.ok
        ? "The server returned an invalid response. Please try again."
        : `${fallbackMessage} (HTTP ${response.status}; invalid response).`,
    );
  }

  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" && payload.error.trim()
        ? payload.error
        : `${fallbackMessage} (HTTP ${response.status}).`,
    );
  }

  return payload;
}

// Set default auth token getter for customFetch
setAuthTokenGetter(() => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("medistock_token");
  }
  return null;
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem("medistock_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem("medistock_token");
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sync token getter whenever token changes
  useEffect(() => {
    setAuthTokenGetter(() => token || localStorage.getItem("medistock_token"));
  }, [token]);

  // Validate session on mount
  useEffect(() => {
    async function checkAuth() {
      const savedToken = localStorage.getItem("medistock_token");
      if (!savedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/auth/me", {
          headers: {
            Authorization: `Bearer ${savedToken}`,
          },
        });

        if (res.ok) {
          const profile = await res.json();
          const mappedUser: UserProfile = {
            id: profile.userId || profile.id,
            userId: profile.userId,
            role: profile.role,
            fullName: profile.fullName || "User",
            email: profile.email,
            phone: profile.phone,
            age: profile.age,
            address: profile.address,
            isFirstAdmin: profile.isFirstAdmin,
          };
          setUser(mappedUser);
          localStorage.setItem("medistock_user", JSON.stringify(mappedUser));
        } else {
          // Token expired or invalid
          localStorage.removeItem("medistock_token");
          localStorage.removeItem("medistock_user");
          setUser(null);
          setToken(null);
        }
      } catch (err) {
        console.warn("Could not verify session with server:", err);
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, []);

  const login = async (identifier: string, password: string, role: "admin" | "customer") => {
    const data = await fetchAuthJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password, role }),
    }, "Login failed. Please check your credentials.");

    if (!isLoginResponse(data)) {
      throw new Error("The server returned incomplete login details. Please try again.");
    }

    const loggedUser: UserProfile = {
      id: data.user.id,
      userId: String(data.user.id),
      role: data.user.role,
      fullName: data.user.fullName,
      email: data.user.email,
      phone: data.user.phone,
      age: data.user.age,
      address: data.user.address,
      isFirstAdmin: data.user.role === "admin",
    };

    localStorage.setItem("medistock_token", data.token);
    localStorage.setItem("medistock_user", JSON.stringify(loggedUser));
    setToken(data.token);
    setUser(loggedUser);
    return loggedUser;
  };

  const logout = () => {
    try {
      fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    } catch {}
    localStorage.removeItem("medistock_token");
    localStorage.removeItem("medistock_user");
    setToken(null);
    setUser(null);
  };

  const registerCustomer = async (formData: {
    fullName: string;
    age: number;
    phone: string;
    address: string;
    email?: string | null;
    password: string;
    confirmPassword: string;
    hasNoEmail?: boolean;
    verificationCode?: string;
  }) => {
    const data = await fetchAuthJson("/api/auth/register-customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    }, "Registration failed. Please check the form fields.");

    if (typeof data.token !== "string" || !data.token || !isRegistrationUser(data.user)) {
      throw new Error(
        "The server returned incomplete registration details. Your account may have been created; try signing in before registering again.",
      );
    }

    const newUser: UserProfile = {
      id: data.user.id,
      userId: String(data.user.id),
      role: "customer",
      fullName: data.user.fullName,
      email: data.user.email ?? null,
      phone: data.user.phone ?? null,
      age: data.user.age,
      address: data.user.address,
      isFirstAdmin: false,
    };

    localStorage.setItem("medistock_token", data.token);
    localStorage.setItem("medistock_user", JSON.stringify(newUser));
    setToken(data.token);
    setUser(newUser);
    return newUser;
  };

  const sendPhoneOtp = async (phone: string) => {
    const data = await fetchAuthJson("/api/auth/phone-otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    }, "Failed to send verification code.");
    if (typeof data.message !== "string") {
      throw new Error("The server returned incomplete phone verification details.");
    }
    return {
      code: typeof data.code === "string" ? data.code : undefined,
      message: data.message,
    };
  };

  const verifyPhoneOtp = async (phone: string, code: string) => {
    const data = await fetchAuthJson("/api/auth/phone-otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    }, "Phone verification failed.");
    if (typeof data.message !== "string") {
      throw new Error("The server returned incomplete phone verification details.");
    }
    return { message: data.message };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAdmin: user?.role === "admin",
        isCustomer: user?.role === "customer",
        isSignedIn: !!user,
        login,
        logout,
        registerCustomer,
        sendPhoneOtp,
        verifyPhoneOtp,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
