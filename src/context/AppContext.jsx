// src/context/AppContext.jsx
// ─────────────────────────────────────────────────────────────
//  Single source of truth for auth + role.
//
//  IMPORTANT: We do NOT cache the role in localStorage because:
//  - localStorage is device-local — same account on Device B
//    would get no cache and resolve differently.
//  - Firestore SDK already caches locally (IndexedDB offline
//    persistence) so Firestore reads are instant after first load.
//  - Role is always freshly resolved from Firestore, guaranteeing
//    the same result on every device for the same Firebase user.
//
//  Role resolution order:
//    1. ownerProfiles collection  (field uid == user.uid)
//    2. tenantProfiles collection (doc id  == user.uid)
//    3. null  (brand-new user, goes to /onboarding)
// ─────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, getDoc, query, where, doc } from "firebase/firestore";
import { auth, db } from "../firebase/config";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [language, setLanguageState] = useState(
    () => localStorage.getItem("rkp_language") || "en"
  );
  const [authUser, setAuthUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading,  setLoading]  = useState(true);

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);
    localStorage.setItem("rkp_language", lang);
  }, []);

  // ── Resolve role from Firestore (no localStorage) ────────
  const resolveRole = useCallback(async (user) => {
    if (!user) { setUserRole(null); return; }
    try {
      // 1. Check ownerProfiles — matches on uid field
      const ownerSnap = await getDocs(
        query(collection(db, "ownerProfiles"), where("uid", "==", user.uid))
      );
      if (!ownerSnap.empty) {
        setUserRole("owner");
        return;
      }

      // 2. Check tenantProfiles — doc ID = tenantUid
      const tenantDoc = await getDoc(doc(db, "tenantProfiles", user.uid));
      if (tenantDoc.exists()) {
        setUserRole("tenant");
        return;
      }

      // 3. No profile found — new user, needs onboarding
      setUserRole(null);
    } catch (err) {
      console.error("resolveRole error:", err);
      setUserRole(null);
    }
  }, []);

  // ── Firebase Auth state listener ─────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      await resolveRole(user);
      setLoading(false);
    });
    return unsub;
  }, [resolveRole]);

  // ── setUserRole exposed to consumers ─────────────────────
  // Does NOT write to localStorage — Firestore is the source of truth.
  // After a login/signup the component calls this so the UI updates
  // immediately without waiting for the next onAuthStateChanged cycle.
  const handleSetUserRole = useCallback((role) => {
    setUserRole(role);
  }, []);

  const value = {
    language,
    setLanguage,
    authUser,
    userRole,
    setUserRole: handleSetUserRole,
    loading,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export default AppContext;
