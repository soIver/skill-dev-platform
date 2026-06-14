import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { syncSession } from "../auth";
import { useUserStore } from "../hooks/useUserStore";

const PUBLIC_PATHS = new Set([
  "/",
  "/auth/login",
  "/auth/registration",
  "/auth/change-password",
  "/auth/confirm-email",
  "/auth/change-email",
  "/auth/confirm-email-change",
]);
const AUTH_ENTRY_PATHS = new Set(["/auth/login", "/auth/registration"]);

export default function AuthBootstrap() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHydrated = useUserStore((state) => state.isHydrated);
  const isAuthChecked = useUserStore((state) => state.isAuthChecked);
  const user = useUserStore((state) => state.user);
  const isSyncingRef = useRef(false);
  const authEntrySyncKeyRef = useRef("");

  useEffect(() => {
    if (!isHydrated || !isAuthChecked || !user || !AUTH_ENTRY_PATHS.has(location.pathname)) {
      return;
    }

    navigate("/account", { replace: true });
  }, [isAuthChecked, isHydrated, location.pathname, navigate, user]);

  useEffect(() => {
    if (!isHydrated || isAuthChecked || isSyncingRef.current) {
      return;
    }

    isSyncingRef.current = true;

    syncSession()
      .then((isAuthenticated) => {
        if (isAuthenticated && AUTH_ENTRY_PATHS.has(location.pathname)) {
          navigate("/account", { replace: true });
          return;
        }

        if (!isAuthenticated && !PUBLIC_PATHS.has(location.pathname)) {
          navigate("/auth/login", { replace: true });
        }
      })
      .finally(() => {
        isSyncingRef.current = false;
      });
  }, [isAuthChecked, isHydrated, location.pathname, navigate]);

  useEffect(() => {
    if (!isHydrated || user || !AUTH_ENTRY_PATHS.has(location.pathname) || isSyncingRef.current) {
      return;
    }

    const syncKey = `${location.key}:${location.pathname}`;
    if (authEntrySyncKeyRef.current === syncKey) {
      return;
    }
    authEntrySyncKeyRef.current = syncKey;
    isSyncingRef.current = true;

    syncSession()
      .then((isAuthenticated) => {
        if (isAuthenticated && AUTH_ENTRY_PATHS.has(location.pathname)) {
          navigate("/account", { replace: true });
        }
      })
      .finally(() => {
        isSyncingRef.current = false;
      });
  }, [isHydrated, location.key, location.pathname, navigate, user]);

  return null;
}
