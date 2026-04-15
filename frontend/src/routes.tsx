import { Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Registration from "./pages/Registration";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Credentials from "./pages/Credentials";
import Skills from "./pages/Skills";
import Tests from "./pages/Tests";
import Vacancies from "./pages/Vacancies";
import VacancyMatching from "./pages/VacancyMatching";
import VacancyAnalysis from "./pages/VacancyAnalysis";
import ContentManagement from "./pages/ContentManagement";
import Admin from "./pages/Admin";
import SkillsAdmin from "./pages/SkillsAdmin";
import RecommendationsAdmin from "./pages/RecommendationsAdmin";
import UsersAdmin from "./pages/UsersAdmin";
import RequireAuth from "./components/RequireAuth";
import RootRedirect from "./components/RootRedirect";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="*" element={<NotFound />} />
      <Route path="/" element={<RootRedirect />} />
      <Route path="/auth/registration" element={<Registration />} />
      <Route path="/auth/login" element={<Login />} />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <Profile />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="skills" replace />} />
        <Route path="skills" element={<Skills />} />
        <Route path="credentials" element={<Credentials />} />
      </Route>
      <Route
        path="/tests"
        element={
          <RequireAuth>
            <Tests />
          </RequireAuth>
        }
      />
      <Route
        path="/vacancies"
        element={
          <RequireAuth>
            <Vacancies />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="matching" replace />} />
        <Route path="matching" element={<VacancyMatching />} />
        <Route path="analysis" element={<VacancyAnalysis />} />
      </Route>
      <Route
        path="/content"
        element={
          <RequireAuth allowedRoles={["curator", "admin"]}>
            <ContentManagement />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth allowedRoles={["admin"]}>
            <Admin />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="skills" replace />} />
        <Route path="skills" element={<SkillsAdmin />} />
        <Route path="recommendations" element={<RecommendationsAdmin />} />
        <Route path="users" element={<UsersAdmin />} />
      </Route>
    </Routes>
  );
}
