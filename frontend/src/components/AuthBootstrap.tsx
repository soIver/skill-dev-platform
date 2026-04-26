import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { syncSession } from "../auth";
import { useUserStore } from "../hooks/useStore";

const PUBLIC_PATHS = new Set(["/", "/auth/login", "/auth/registration"]);

export default function AuthBootstrap() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHydrated = useUserStore((state) => state.isHydrated);
  const isAuthChecked = useUserStore((state) => state.isAuthChecked);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    if (!isHydrated || isAuthChecked || isSyncingRef.current) {
      return;
    }

    isSyncingRef.current = true;

    syncSession()
      .then((isAuthenticated) => {
        if (!isAuthenticated && !PUBLIC_PATHS.has(location.pathname)) {
          navigate("/auth/login", { replace: true });
        }
      })
      .finally(() => {
        isSyncingRef.current = false;
      });
  }, [isAuthChecked, isHydrated, location.pathname, navigate]);

  return null;
}
