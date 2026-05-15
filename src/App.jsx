// src/App.jsx
// ─────────────────────────────────────────────────────────────
// Top-level router:
//   /              → redirect based on auth state
//   /login         → LoginView
//   /onboarding    → OnboardingView  (new users)
//   /owner         → OwnerDashboardView   (role: owner)
//   /tenant        → TenantDashboardView  (role: tenant)
//   /settings      → SettingsView
// ─────────────────────────────────────────────────────────────

import { Routes, Route, Navigate } from "react-router-dom";
import { useApp }                  from "./context/AppContext";

// Views (stubbed — will be built in Step 2+)
import LoginView            from "./views/LoginView";
import OnboardingView       from "./views/OnboardingView";
import OwnerDashboardView   from "./views/OwnerDashboardView";
import TenantDashboardView  from "./views/TenantDashboardView";
import SettingsView         from "./views/SettingsView";

// ── Full-screen loading spinner ──────────────────────────────
function LoadingScreen() {
  return (
    <div className="app-container flex items-center justify-center">
      <div className="text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg animate-pulse"
          style={{ background: "linear-gradient(135deg, #FF6600, #F59E0B)" }}
        >
          <span className="text-3xl">₹</span>
        </div>
        <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
          Loading Room Khata Pro…
        </p>
      </div>
    </div>
  );
}

// ── Root redirect based on auth/role ────────────────────────
function RootRedirect() {
  const { authUser, userRole } = useApp();
  if (!authUser)         return <Navigate to="/login"      replace />;
  if (!userRole)         return <Navigate to="/onboarding" replace />;
  if (userRole === "owner")  return <Navigate to="/owner"  replace />;
  if (userRole === "tenant") return <Navigate to="/tenant" replace />;
  return <Navigate to="/login" replace />;
}

// ── Protected route wrapper ──────────────────────────────────
function ProtectedRoute({ children, allowedRole }) {
  const { authUser, userRole } = useApp();
  if (!authUser)                          return <Navigate to="/login"  replace />;
  if (allowedRole && userRole !== allowedRole) return <Navigate to="/"  replace />;
  return children;
}

// ── App ──────────────────────────────────────────────────────
export default function App() {
  const { loading } = useApp();

  if (loading) return <LoadingScreen />;

  return (
    <div className="app-container">
      <Routes>
        <Route path="/"            element={<RootRedirect />} />
        <Route path="/login"       element={<LoginView />} />
        <Route path="/onboarding"  element={<OnboardingView />} />

        <Route
          path="/owner"
          element={
            <ProtectedRoute allowedRole="owner">
              <OwnerDashboardView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tenant"
          element={
            <ProtectedRoute allowedRole="tenant">
              <TenantDashboardView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsView />
            </ProtectedRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
