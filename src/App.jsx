import { Navigate, Route, Routes } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import LoginScreen from './features/auth/LoginScreen.jsx';
import OwnerHome from './features/owner/OwnerHome.jsx';
import BuildingRooms from './features/owner/BuildingRooms.jsx';
import OwnerRoomDetails from './features/owner/OwnerRoomDetails.jsx';
import TenantDashboard from './features/tenant/TenantDashboard.jsx';
import { useAuthUser } from './hooks/useAuthUser.js';

export default function App() {
  const { user, loading } = useAuthUser();

  if (loading) return <LoginScreen booting />;

  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginScreen user={user} />} />
        <Route path="/owner-home" element={<RequireRole user={user} role="owner"><OwnerHome user={user} /></RequireRole>} />
        <Route path="/building/:id" element={<RequireRole user={user} role="owner"><BuildingRooms user={user} /></RequireRole>} />
        <Route path="/room/:id" element={<RequireRole user={user} role="owner"><OwnerRoomDetails user={user} /></RequireRole>} />
        <Route path="/tenant-home" element={<RequireRole user={user} role="tenant"><TenantDashboard user={user} /></RequireRole>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function RequireRole({ user, role, children }) {
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'owner' ? '/owner-home' : '/tenant-home'} replace />;
  return children;
}
