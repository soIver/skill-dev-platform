import { Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Registration from "./pages/Registration";
import Login from "./pages/Login";
import Profile from "./pages/profile/Profile";
import Credentials from "./pages/profile/Credentials";
import Skills from "./pages/profile/Skills";
import Tests from "./pages/Tests";
import Vacancies from "./pages/vacancies/Vacancies";
import VacancyMatching from "./pages/vacancies/Matching";
import VacancyAnalysis from "./pages/vacancies/Analysis";
import Content from "./pages/content/Content";
import ContentSkills from "./pages/content/Skills";
import ContentTests from "./pages/content/Tests";
import ContentRecommendations from "./pages/content/Recommendations";
import Admin from "./pages/admin/Admin";
import Management from "./pages/admin/Management";
import Statistics from "./pages/admin/Statistics";
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
            <Content />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="skills" replace />} />
        <Route path="skills" element={<ContentSkills />} />
        <Route path="tests" element={<ContentTests />} />
        <Route path="recommendations" element={<ContentRecommendations />} />
      </Route>
      <Route
        path="/admin"
        element={
          <RequireAuth allowedRoles={["admin"]}>
            <Admin />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="management" replace />} />
        <Route path="management" element={<Management />} />
        <Route path="statistics" element={<Statistics />} />
      </Route>
    </Routes>
  );
}
