import { Navigate } from "react-router-dom";

import { useUserStore } from "../hooks/useStore";

export default function RootRedirect() {
  const isHydrated = useUserStore((state) => state.isHydrated);
  const user = useUserStore((state) => state.user);
  const refreshToken = useUserStore((state) => state.refreshToken);

  if (!isHydrated) {
    return null;
  }

  if (user) {
    return <Navigate to="/profile" replace />;
  }

  if (refreshToken) {
    return null;
  }

  return <Navigate to="/auth/login" replace />;
}
