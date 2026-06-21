import { Routes, Route } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Registration from "./pages/Registration";
import Login from "./pages/Login";
import PasswordChange from "./pages/auth/PasswordChange";
import PasswordRecovery from "./pages/auth/PasswordRecovery";
import EmailConfirmation from "./pages/auth/EmailConfirmation";
import CuratorInvitationConfirmation from "./pages/auth/CuratorInvitationConfirmation";
import EmailChange from "./pages/auth/EmailChange";
import EmailChangeConfirmation from "./pages/auth/EmailChangeConfirmation";
import My from "./pages/my/My";
import Credentials from "./pages/my/Credentials";
import Profile from "./pages/my/Profile";
import Repositories from "./pages/my/Repositories";
import Progress from "./pages/Progress";
import Tasks from "./pages/Tasks";
import Tests from "./pages/Tests";
import TestAttempt from "./pages/TestAttempt";
import Vacancies from "./pages/vacancies/Vacancies";
import VacancySearch from "./pages/vacancies/Search";
import VacancyAnalysis from "./pages/vacancies/Analysis";
import Content from "./pages/content/Content";
import ContentClassifier from "./pages/content/Classifier";
import ContentSkills from "./pages/content/Skills";
import ContentTests from "./pages/content/Tests";
import ContentTasks from "./pages/content/Tasks";
import Management from "./pages/Management";
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
      <Route path="/auth/recovery/password" element={<PasswordRecovery />} />
      <Route path="/auth/confirm-email" element={<EmailConfirmation />} />
      <Route path="/auth/confirm-curator" element={<CuratorInvitationConfirmation />} />
      <Route path="/auth/change-email" element={<EmailChange />} />
      <Route path="/auth/confirm-email-change" element={<EmailChangeConfirmation />} />
      <Route
        path="/account"
        element={
          <RequireAuth>
            <My />
          </RequireAuth>
        }
      >
        <Route index element={<TabRedirect section="account" defaultTab="profile" />} />
        <Route path="profile" element={<Profile />} />
        <Route path="repositories" element={<Repositories />} />
        <Route path="credentials" element={<Credentials />} />
      </Route>
      <Route
        path="/progress"
        element={
          <RequireAuth>
            <Progress />
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
        path="/tests/attempt/:attemptId"
        element={
          <RequireAuth>
            <TestAttempt />
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
        <Route index element={<TabRedirect section="vacancies" defaultTab="search" />} />
        <Route path="search" element={<VacancySearch />} />
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
        <Route path="classifier" element={<ContentClassifier />} />
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
    </Routes>
  );
}
