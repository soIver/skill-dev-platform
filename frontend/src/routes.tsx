import { Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Home from "./pages/Home";
import Registration from "./pages/Registration";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Credentials from "./pages/Credentials";
import Skills from "./pages/Skills";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="*" element={<NotFound />} />
      <Route path="/" element={<Home />} />
      <Route path="/auth/registration" element={<Registration />} />
      <Route path="/auth/login" element={<Login />} />
      <Route path="/profile" element={<Profile />}>
        <Route index element={<Navigate to="skills" replace />} />
        <Route path="skills" element={<Skills />} />
        <Route path="credentials" element={<Credentials />} />
      </Route>
    </Routes>
  );
}
