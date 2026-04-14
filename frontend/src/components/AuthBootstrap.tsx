import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { restoreSession } from "../auth";
import { useUserStore } from "../hooks/useStore";

const PUBLIC_PATHS = new Set(["/", "/auth/login", "/auth/registration"]);

export default function AuthBootstrap() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHydrated = useUserStore((state) => state.isHydrated);
  const user = useUserStore((state) => state.user);
  const accessToken = useUserStore((state) => state.accessToken);
  const refreshToken = useUserStore((state) => state.refreshToken);
  const isRestoringRef = useRef(false);

  useEffect(() => {
    if (!isHydrated || accessToken || !refreshToken || isRestoringRef.current) {
      return;
    }

    isRestoringRef.current = true;

    restoreSession()
      .then((restored) => {
        if (!restored && !PUBLIC_PATHS.has(location.pathname)) {
          navigate("/auth/login", { replace: true });
        }
      })
      .finally(() => {
        isRestoringRef.current = false;
      });
  }, [accessToken, isHydrated, location.pathname, navigate, refreshToken]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!user && !refreshToken && !PUBLIC_PATHS.has(location.pathname)) {
      navigate("/auth/login", { replace: true });
    }
  }, [isHydrated, location.pathname, navigate, refreshToken, user]);

  return null;
}
