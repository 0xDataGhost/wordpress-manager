import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchMe,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  type AuthStore,
  type AuthUser,
  type LoginInput,
  type RegisterInput,
} from "@/lib/auth-api";
import {
  clearTokens,
  getRefreshToken,
  hasTokens,
  setTokens,
} from "@/lib/auth-storage";
import { AUTH_LOGOUT_EVENT } from "@/lib/http";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  store: AuthStore | null;
  signIn: (input: LoginInput) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [store, setStore] = useState<AuthStore | null>(null);

  // Hydrate the session from a stored token so a refresh keeps the user in.
  useEffect(() => {
    let active = true;

    if (!hasTokens()) {
      setStatus("unauthenticated");
      return;
    }

    fetchMe()
      .then((me) => {
        if (!active) return;
        setUser(me.user);
        setStore(me.store);
        setStatus("authenticated");
      })
      .catch(() => {
        if (!active) return;
        clearTokens();
        setUser(null);
        setStore(null);
        setStatus("unauthenticated");
      });

    return () => {
      active = false;
    };
  }, []);

  // A failed token refresh in the HTTP layer broadcasts this event.
  useEffect(() => {
    function handleForcedLogout() {
      setUser(null);
      setStore(null);
      setStatus("unauthenticated");
      navigate("/login", { replace: true });
    }

    window.addEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);
    return () =>
      window.removeEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);
  }, [navigate]);

  async function signIn(input: LoginInput): Promise<void> {
    const session = await loginRequest(input);
    setTokens({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
    setUser(session.user);
    setStore(session.store);
    setStatus("authenticated");
  }

  async function signUp(input: RegisterInput): Promise<void> {
    const session = await registerRequest(input);
    setTokens({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
    setUser(session.user);
    setStore(session.store);
    setStatus("authenticated");
  }

  async function signOut(): Promise<void> {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await logoutRequest(refreshToken).catch(() => undefined);
    }
    clearTokens();
    setUser(null);
    setStore(null);
    setStatus("unauthenticated");
    navigate("/login", { replace: true });
  }

  return (
    <AuthContext.Provider
      value={{ status, user, store, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
