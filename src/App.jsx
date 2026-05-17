import { Routes, Route, Navigate } from "react-router-dom";
import { useApp } from "./context/AppContext";
import LoginView          from "./views/LoginView";
import OnboardingView     from "./views/OnboardingView";
import OwnerDashboardView from "./views/OwnerDashboardView";
import TenantDashboardView from "./views/TenantDashboardView";
import SettingsView       from "./views/SettingsView";

function Spinner() {
  return (
    <div className="app-shell flex items-center justify-center"
         style={{ background: "linear-gradient(160deg,#07050F,#1E1B4B)" }}>
      <div className="text-center">
        <div className="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center"
             style={{ background: "linear-gradient(135deg,#FF6B35,#F5A623)",
                      boxShadow: "0 16px 40px rgba(255,107,53,.4)" }}>
          <span style={{ fontSize: 28, color: "white", fontWeight: 900 }}>₹</span>
        </div>
        <p style={{ color: "rgba(255,255,255,.5)", fontSize: 13, fontWeight: 600 }}>
          RoomKhata Pro…
        </p>
      </div>
    </div>
  );
}

function Guard({ role, children }) {
  const { authUser, userRole } = useApp();
  if (!authUser) return <Navigate to="/login" replace />;
  if (role && userRole !== role) return <Navigate to="/" replace />;
  return children;
}

function Root() {
  const { authUser, userRole } = useApp();
  if (!authUser) return <Navigate to="/login" replace />;
  if (!userRole) return <Navigate to="/onboarding" replace />;
  if (userRole === "owner")  return <Navigate to="/owner" replace />;
  if (userRole === "tenant") return <Navigate to="/tenant" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  const { loading } = useApp();
  if (loading) return <Spinner />;
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/"           element={<Root />} />
        <Route path="/login"      element={<LoginView />} />
        <Route path="/onboarding" element={<OnboardingView />} />
        <Route path="/owner"      element={<Guard role="owner"><OwnerDashboardView /></Guard>} />
        <Route path="/tenant"     element={<Guard role="tenant"><TenantDashboardView /></Guard>} />
        <Route path="/settings"   element={<Guard><SettingsView /></Guard>} />
        <Route path="*"           element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
