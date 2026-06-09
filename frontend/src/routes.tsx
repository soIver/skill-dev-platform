import { Routes, Route } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Registration from "./pages/Registration";
import Login from "./pages/Login";
import PasswordChange from "./pages/auth/PasswordChange";
import Profile from "./pages/profile/Profile";
import Credentials from "./pages/profile/Credentials";
import Skills from "./pages/profile/Skills";
import Repositories from "./pages/profile/Repositories";
import Recommendations from "./pages/Recommendations";
import Tasks from "./pages/Tasks";
import Tests from "./pages/Tests";
import Vacancies from "./pages/vacancies/Vacancies";
import VacancyMatching from "./pages/vacancies/Matching";
import VacancyAnalysis from "./pages/vacancies/Analysis";
import Content from "./pages/content/Content";
import ContentSkills from "./pages/content/Skills";
import ContentTests from "./pages/content/Tests";
import ContentTasks from "./pages/content/Tasks";
import Management from "./pages/admin/Management";
import Statistics from "./pages/admin/Statistics";
import RequireAuth from "./components/RequireAuth";
import RootRedirect from "./components/RootRedirect";
import { TabRedirect } from "./components/TabTracker";


export default function AppRoutes() {
  return (
    <Routes>
      <Route path="*" element={<NotFound />} />
      <Route path="/" element={<RootRedirect />} />
      <Route path="/auth/registration" element={<Registration />} />
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/change-password" element={<PasswordChange />} />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <Profile />
          </RequireAuth>
        }
      >
        <Route index element={<TabRedirect section="profile" defaultTab="skills" />} />
        <Route path="skills" element={<Skills />} />
        <Route path="repositories" element={<Repositories />} />
        <Route path="credentials" element={<Credentials />} />
      </Route>
      <Route
        path="/recommendations"
        element={
          <RequireAuth>
            <Recommendations />
          </RequireAuth>
        }
      />
      <Route
        path="/tasks"
        element={
          <RequireAuth>
            <Tasks />
          </RequireAuth>
        }
      />
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
        <Route index element={<TabRedirect section="vacancies" defaultTab="matching" />} />
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
        <Route index element={<TabRedirect section="content" defaultTab="skills" />} />
        <Route path="skills" element={<ContentSkills />} />
        <Route path="tests" element={<ContentTests />} />
        <Route path="tasks" element={<ContentTasks />} />
      </Route>
      <Route
        path="/management"
        element={
          <RequireAuth allowedRoles={["admin"]}>
            <Management />
          </RequireAuth>
        }
      />
      <Route
        path="/statistics"
        element={
          <RequireAuth allowedRoles={["admin"]}>
            <Statistics />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
