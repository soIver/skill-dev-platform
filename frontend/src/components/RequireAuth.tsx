import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useUserStore } from "../hooks/useStore";

interface RequireAuthProps {
  children: ReactNode;
  allowedRoles?: string[];
}

export default function RequireAuth({ children, allowedRoles }: RequireAuthProps) {
  const isHydrated = useUserStore((state) => state.isHydrated);
  const user = useUserStore((state) => state.user);

  if (!isHydrated) {
    return null;
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/profile/skills" replace />;
  }

  return <>{children}</>;
}
