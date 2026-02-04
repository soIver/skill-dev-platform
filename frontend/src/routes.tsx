import { Routes, Route } from 'react-router-dom';
import NotFound from './pages/NotFound';
import Home from './pages/Home';
import Registration from './pages/Registration';
import Login from './pages/Login';

export default function AppRoutes() {
    return (
        <Routes>
            <Route path="*" element={<NotFound />} />
            <Route path="/" element={< Home />} />
            <Route path="/auth/registration" element={<Registration />} />
            <Route path="/auth/login" element={<Login />} />
        </Routes>
    );
}