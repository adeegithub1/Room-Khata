// src/context/AppContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase/config";

const AppContext = createContext(null);

export const STRINGS = {
  en: { appName: "Room Khata Pro", loading: "Loading…", logout: "Logout" },
  hi: { appName: "Room Khata Pro", loading: "लोड हो रहा है…", logout: "लॉग आउट" },
};

export function AppProvider({ children }) {
  const savedLang = localStorage.getItem("rkp_language");
  const [language, setLanguageState] = useState(savedLang || "en");
  const [authUser,  setAuthUser]  = useState(null);
  const [userRole,  setUserRole]  = useState(null);
  const [loading,   setLoading]   = useState(true);

  const setLanguage = (lang) => {
    setLanguageState(lang);
    localStorage.setItem("rkp_language", lang);
  };

  const t = (key) => STRINGS[language]?.[key] ?? STRINGS.en[key] ?? key;

  // ── FIX: Sahi Firebase Collections dhoondhna ──
  const resolveRole = async (user) => {
    if (!user) {
      setUserRole(null);
      return;
    }
    try {
      // 1. Owner Check (Purane app ki tarah 'ownerProfiles' mein check karega)
      const ownerQ = query(collection(db, "ownerProfiles"), where("uid", "==", user.uid));
      const ownerSnap = await getDocs(ownerQ);
      if (!ownerSnap.empty) {
        setUserRole("owner");
        return;
      }

      // 2. Tenant Check (Purane app ki tarah 'tenantProfiles' mein check karega)
      const tenantSnap = await getDoc(doc(db, "tenantProfiles", user.uid));
      if (tenantSnap.exists()) {
        setUserRole("tenant");
        return;
      }

      // Agar data nahi mila toh onboarding par bhejega
      setUserRole(null);
    } catch (e) {
      console.error("Role fetch error:", e);
      setUserRole(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      await resolveRole(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = { language, setLanguage, t, authUser, userRole, setUserRole, loading };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export default AppContext;
