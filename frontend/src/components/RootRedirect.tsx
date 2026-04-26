import { Navigate } from "react-router-dom";

import { useUserStore } from "../hooks/useStore";

export default function RootRedirect() {
  const isHydrated = useUserStore((state) => state.isHydrated);
  const isAuthChecked = useUserStore((state) => state.isAuthChecked);
  const user = useUserStore((state) => state.user);

  if (!isHydrated || !isAuthChecked) {
    return null;
  }

  if (user) {
    return <Navigate to="/profile" replace />;
  }

  return <Navigate to="/auth/login" replace />;
}
