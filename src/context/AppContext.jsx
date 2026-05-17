// src/context/AppContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "../firebase/config";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [language,  setLanguageState] = useState(localStorage.getItem("rkp_language") || "en");
  const [authUser,  setAuthUser]      = useState(null);
  const [userRole,  setUserRole]      = useState(null);
  const [loading,   setLoading]       = useState(true);

  const setLanguage = (lang) => {
    setLanguageState(lang);
    localStorage.setItem("rkp_language", lang);
  };

  // ── Resolve role from Firestore ──────────────────────────
  // Checks ownerProfiles (uid field) then tenantProfiles (doc id = uid)
  const resolveRole = async (user) => {
    if (!user) { setUserRole(null); return; }

    // Check if persisted role exists in localStorage first (fast path)
    const cached = localStorage.getItem(`rkp_role_${user.uid}`);
    if (cached === "owner" || cached === "tenant") {
      setUserRole(cached);
      return;
    }

    try {
      // Owner? → ownerProfiles collection, uid field
      const ownerSnap = await getDocs(
        query(collection(db, "ownerProfiles"), where("uid", "==", user.uid))
      );
      if (!ownerSnap.empty) {
        setUserRole("owner");
        localStorage.setItem(`rkp_role_${user.uid}`, "owner");
        return;
      }
      // Tenant? → tenantProfiles collection, doc id = uid
      const tenantSnap = await getDocs(
        query(collection(db, "tenantProfiles"), where("phone", "!=", ""))
      );
      // Check by uid match (tenantProfiles doc id = tenantUid)
      const { getDoc, doc } = await import("firebase/firestore");
      const tDoc = await getDoc(doc(db, "tenantProfiles", user.uid));
      if (tDoc.exists()) {
        setUserRole("tenant");
        localStorage.setItem(`rkp_role_${user.uid}`, "tenant");
        return;
      }
      // Anonymous user with no profile yet → no role
      setUserRole(null);
    } catch {
      setUserRole(null);
    }
  };

  // ── Auth listener ────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        await resolveRole(user);
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const value = {
    language, setLanguage,
    authUser,
    userRole, setUserRole: (role) => {
      setUserRole(role);
      // Persist so resolveRole fast-paths on next reload
      if (authUser?.uid && role) {
        localStorage.setItem(`rkp_role_${authUser.uid}`, role);
      }
    },
    loading,
    t: (key) => key, // simple passthrough; expand if needed
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export default AppContext;
