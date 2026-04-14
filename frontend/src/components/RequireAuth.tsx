import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useUserStore } from "../hooks/useStore";

interface RequireAuthProps {
  children: ReactNode;
}

export default function RequireAuth({ children }: RequireAuthProps) {
  const isHydrated = useUserStore((state) => state.isHydrated);
  const user = useUserStore((state) => state.user);

  if (!isHydrated) {
    return null;
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  return <>{children}</>;
}
