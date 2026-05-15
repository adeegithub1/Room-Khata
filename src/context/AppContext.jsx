// src/context/AppContext.jsx
// ─────────────────────────────────────────────────────────────
// Global state for:
//   • language  — 'en' | 'hi'  (English / Hindi toggle)
//   • authUser  — Firebase User object or null
//   • userRole  — 'owner' | 'tenant' | null  (set after login)
//   • loading   — whether auth state is still being resolved
// ─────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc }        from "firebase/firestore";
import { auth, db }           from "../firebase/config";

// ── 1. Create the context ────────────────────────────────────
const AppContext = createContext(null);

// ── 2. Language strings (seed — expand in /utils/i18n.js) ───
export const STRINGS = {
  en: {
    appName:   "Room Khata Pro",
    tagline:   "Rent Tracker",
    loading:   "Loading…",
    logout:    "Logout",
    settings:  "Settings",
    dashboard: "Dashboard",
  },
  hi: {
    appName:   "Room Khata Pro",
    tagline:   "किराया ट्रैकर",
    loading:   "लोड हो रहा है…",
    logout:    "लॉग आउट",
    settings:  "सेटिंग्स",
    dashboard: "डैशबोर्ड",
  },
};

// ── 3. Provider ──────────────────────────────────────────────
export function AppProvider({ children }) {
  // Language — default to device locale; fallback English
  const savedLang = localStorage.getItem("rkp_language");
  const [language, setLanguageState] = useState(savedLang || "en");

  // Auth
  const [authUser,  setAuthUser]  = useState(null);
  const [userRole,  setUserRole]  = useState(null);   // 'owner' | 'tenant'
  const [loading,   setLoading]   = useState(true);

  // ── Persist language choice ──────────────────────────────
  const setLanguage = (lang) => {
    setLanguageState(lang);
    localStorage.setItem("rkp_language", lang);
  };

  // ── Translation helper ───────────────────────────────────
  const t = (key) => STRINGS[language]?.[key] ?? STRINGS.en[key] ?? key;

  // ── Resolve user role from Firestore ────────────────────
  const resolveRole = async (user) => {
    if (!user) {
      setUserRole(null);
      return;
    }
    try {
      // Owners have a profile doc in /owners/{uid}
      const ownerSnap = await getDoc(doc(db, "owners", user.uid));
      if (ownerSnap.exists()) {
        setUserRole("owner");
        return;
      }
      // Tenants have a profile doc in /tenants/{uid}
      const tenantSnap = await getDoc(doc(db, "tenants", user.uid));
      if (tenantSnap.exists()) {
        setUserRole("tenant");
        return;
      }
      // Brand-new user — role assigned during onboarding
      setUserRole(null);
    } catch {
      setUserRole(null);
    }
  };

  // ── Firebase Auth listener ───────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      await resolveRole(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ── Context value ────────────────────────────────────────
  const value = {
    language,
    setLanguage,
    t,
    authUser,
    userRole,
    setUserRole,
    loading,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ── 4. Custom hook ───────────────────────────────────────────
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export default AppContext;
