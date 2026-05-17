// src/views/SettingsView.jsx
// ─────────────────────────────────────────────────────────────
//  Settings panel — accessible from OwnerDashboard bottom nav
//
//  Sections:
//    • Profile card  — owner name, email, address, UPI id
//    • Preferences   — Language EN/HI toggle
//    • Data          — Backup (JSON download)
//    • Danger zone   — Logout
//
//  Profile edits are saved back to ownerProfiles in Firestore.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../firebase/config";
import { useApp } from "../context/AppContext";

// ── motion helpers ───────────────────────────────────────────
const ease = [0.22, 1, 0.36, 1];
const fadeUp = {
  hidden:  { opacity: 0, y: 16 },
  visible: (d = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.48, delay: d, ease } }),
};

// ── Section wrapper ──────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="mb-5">
      <p
        className="font-black uppercase tracking-widest mb-2.5 px-1"
        style={{ fontSize: 10, color: "#9CA3AF" }}
      >
        {title}
      </p>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "white", border: "1.5px solid var(--border)", boxShadow: "0 2px 8px rgba(30,27,75,0.06)" }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────
function Row({ icon, iconBg, label, sublabel, right, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 transition-all active:scale-[0.98]"
      style={{
        background: "none",
        borderBottom: "1px solid var(--border)",
        cursor: onClick ? "pointer" : "default",
        border: "none",
        borderBottom: "1.5px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: iconBg }}
        >
          <i className={`${icon} text-sm`} style={{ color: danger ? "#E11D48" : undefined }} />
        </div>
        <div className="text-left">
          <p className="font-bold text-sm" style={{ color: danger ? "#E11D48" : "var(--text-primary)" }}>
            {label}
          </p>
          {sublabel && (
            <p className="font-medium" style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {sublabel}
            </p>
          )}
        </div>
      </div>
      {right}
    </button>
  );
}

// ── Language toggle ──────────────────────────────────────────
function LangToggle({ value, onChange }) {
  const isHindi = value === "hi";
  return (
    <button
      type="button"
      onClick={() => onChange(isHindi ? "en" : "hi")}
      className="relative flex items-center justify-between rounded-full transition-all"
      style={{
        width: 64,
        height: 28,
        background: isHindi
          ? "linear-gradient(135deg,#FF6600,#F59E0B)"
          : "linear-gradient(135deg,#2D1B69,#6D28D9)",
        padding: "3px",
        border: "none",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(30,27,75,0.20)",
      }}
    >
      <motion.div
        layout
        className="absolute rounded-full flex items-center justify-center"
        style={{
          width: 22, height: 22,
          background: "white",
          left: isHindi ? "calc(100% - 25px)" : 3,
          transition: "left 0.28s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <span className="font-black" style={{ fontSize: 8, color: isHindi ? "#FF6600" : "#2D1B69" }}>
          {isHindi ? "HI" : "EN"}
        </span>
      </motion.div>
    </button>
  );
}

// ── Edit profile modal ───────────────────────────────────────
function EditProfileModal({ profile, profileDocId, onClose, onSaved }) {
  const [name,    setName]    = useState(profile.name    || "");
  const [address, setAddress] = useState(profile.address || "");
  const [upiId,   setUpiId]   = useState(profile.upiId   || "");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleSave = async () => {
    if (!name.trim()) { setError("Name is required."); return; }
    setLoading(true);
    setError("");
    try {
      await updateDoc(doc(db, "ownerProfiles", profileDocId), {
        name: name.trim(),
        address: address.trim(),
        upiId: upiId.trim(),
      });
      onSaved({ name: name.trim(), address: address.trim(), upiId: upiId.trim() });
      onClose();
    } catch (e) {
      setError(e.message || "Update failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        className="relative z-10 bg-white w-full rounded-t-3xl px-6 pt-5 pb-10"
        style={{ maxWidth: 480, border: "1.5px solid var(--border)" }}
        initial={{ y: "100%" }}
        animate={{ y: 0, transition: { duration: 0.4, ease } }}
        exit={{ y: "100%", transition: { duration: 0.28 } }}
      >
        <div className="w-12 h-1 rounded-full mx-auto mb-5" style={{ background: "var(--border)" }} />
        <h3 className="text-xl font-black mb-5" style={{ color: "var(--indigo)" }}>Edit Profile</h3>

        <div className="space-y-4">
          {[
            { label: "Full Name",      val: name,    set: setName,    placeholder: "Ramesh Sharma", req: true },
            { label: "Property Address", val: address, set: setAddress, placeholder: "Building address…"       },
            { label: "UPI ID",         val: upiId,   set: setUpiId,   placeholder: "yourname@upi"             },
          ].map((f) => (
            <div key={f.label}>
              <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--indigo)" }}>
                {f.label}{f.req ? " *" : ""}
              </label>
              <input
                type="text"
                value={f.val}
                onChange={(e) => f.set(e.target.value)}
                placeholder={f.placeholder}
                className="w-full px-4 py-3 rounded-2xl font-medium text-sm outline-none transition-all"
                style={{
                  background: "var(--surface2)",
                  border: "1.5px solid var(--border)",
                  fontFamily: "'Poppins', sans-serif",
                  color: "var(--text-primary)",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--saffron)"; e.target.style.background = "#fff"; e.target.style.boxShadow = "0 0 0 3px rgba(255,102,0,.09)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "var(--border)";  e.target.style.background = "var(--surface2)"; e.target.style.boxShadow = "none"; }}
              />
            </div>
          ))}

          {error && (
            <div className="rounded-2xl px-4 py-3 text-sm font-semibold"
              style={{ background: "#FEE2E2", color: "#991B1B", border: "1.5px solid #FECACA" }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full py-4 text-white font-black rounded-2xl text-base flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#FF6600,#F59E0B)", boxShadow: "0 6px 20px rgba(255,102,0,.3)", border: "none", cursor: "pointer" }}
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="3" />
                <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              <><i className="fa-solid fa-check" /> Save Changes</>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════
// ROOT — SettingsView
// ════════════════════════════════════════════════════════════
export default function SettingsView() {
  const { authUser, setUserRole, language, setLanguage } = useApp();
  const navigate = useNavigate();

  const [profile,      setProfile]      = useState({ name: "", address: "", upiId: "" });
  const [profileDocId, setProfileDocId] = useState(null);
  const [editOpen,     setEditOpen]     = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [toastMsg,     setToastMsg]     = useState("");

  const toast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  };

  // ── Load profile ────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "ownerProfiles"), where("uid", "==", authUser.uid))
        );
        if (!snap.empty) {
          setProfileDocId(snap.docs[0].id);
          const d = snap.docs[0].data();
          setProfile({ name: d.name || "", address: d.address || "", upiId: d.upiId || "" });
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [authUser]);

  const handleLogout = async () => {
    const uid = authUser?.uid;
    await signOut(auth);
    if (uid) localStorage.removeItem(`rkp_role_${uid}`);
    setUserRole(null);
    navigate("/login", { replace: true });
  };

  const handleBackup = () => {
    const data = { profile, backup_date: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: "khata-backup.json" });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("☁️ Backup downloaded!");
  };

  const displayName = profile.name || authUser?.email?.split("@")[0] || "Owner";
  const initials    = displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--cream)" }}>

        {/* Header */}
        <motion.header
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
          initial="hidden"
          animate="visible"
          className="shrink-0 relative overflow-hidden"
          style={{
            background:  "linear-gradient(155deg,#0A0818 0%,#160F35 35%,#2D1B69 68%,#160F35 100%)",
            paddingTop:  "max(44px, env(safe-area-inset-top))",
          }}
        >
          {/* Ambient orb */}
          <div className="absolute pointer-events-none" style={{ top: -40, right: -30, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,102,0,0.20) 0%, transparent 70%)" }} />

          <div className="relative z-10 px-5 pt-4 pb-6">
            <motion.p variants={fadeUp} custom={0} className="font-bold uppercase tracking-widest mb-1" style={{ fontSize: 10, color: "rgba(255,255,255,0.40)" }}>
              Account
            </motion.p>
            <motion.h1 variants={fadeUp} custom={0.06} className="font-black leading-none mb-5" style={{ fontSize: "clamp(1.8rem,7vw,2.2rem)", color: "#fff" }}>
              Settings
            </motion.h1>

            {/* Profile card in header */}
            <motion.div
              variants={fadeUp}
              custom={0.14}
              className="flex items-center gap-4 p-4 rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.065)",
                border: "1px solid rgba(255,255,255,0.11)",
                backdropFilter: "blur(16px)",
              }}
            >
              {/* Avatar */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-white shrink-0 shadow-lg"
                style={{ background: "linear-gradient(135deg,#FF6600,#F59E0B)", fontSize: 18 }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-white truncate text-base">{displayName}</p>
                <p className="font-medium truncate" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                  {authUser?.email || ""}
                </p>
                {profile.address && (
                  <p className="font-medium truncate mt-0.5" style={{ fontSize: 10, color: "rgba(255,255,255,0.32)" }}>
                    {profile.address}
                  </p>
                )}
              </div>
              <button
                onClick={() => setEditOpen(true)}
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 active:scale-90 transition-all"
                style={{ background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer" }}
              >
                <i className="fa-solid fa-pencil text-white text-sm" />
              </button>
            </motion.div>
          </div>
        </motion.header>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-4 py-5">

          {/* Profile */}
          <motion.div variants={fadeUp} custom={0} initial="hidden" animate="visible">
            <Section title="Profile">
              <Row
                icon="fa-solid fa-user-pen"
                iconBg="linear-gradient(135deg,#FF6600,#F59E0B)"
                label="Edit Profile"
                sublabel="Name, address, UPI ID"
                onClick={() => setEditOpen(true)}
                right={<i className="fa-solid fa-chevron-right text-sm" style={{ color: "var(--text-muted)" }} />}
              />
              {profile.upiId && (
                <Row
                  icon="fa-solid fa-indian-rupee-sign"
                  iconBg="#F0FDF4"
                  label="UPI ID"
                  sublabel={profile.upiId}
                  right={
                    <button
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(profile.upiId); toast("UPI ID copied!"); }}
                      className="text-xs font-bold px-2.5 py-1 rounded-lg active:scale-90 transition-all"
                      style={{ background: "#F0FDF4", color: "#059669", border: "none", cursor: "pointer" }}
                    >
                      Copy
                    </button>
                  }
                />
              )}
            </Section>
          </motion.div>

          {/* Preferences */}
          <motion.div variants={fadeUp} custom={0.06} initial="hidden" animate="visible">
            <Section title="Preferences">
              <Row
                icon="fa-solid fa-language"
                iconBg="linear-gradient(135deg,#7C3AED,#6D28D9)"
                label="Language"
                sublabel={language === "hi" ? "हिंदी" : "English"}
                right={
                  <LangToggle value={language} onChange={(v) => { setLanguage(v); toast(v === "hi" ? "Hindi selected 🇮🇳" : "English selected"); }} />
                }
              />
            </Section>
          </motion.div>

          {/* Data */}
          <motion.div variants={fadeUp} custom={0.12} initial="hidden" animate="visible">
            <Section title="Data">
              <Row
                icon="fa-solid fa-cloud-arrow-down"
                iconBg="#F0FDF4"
                label="Backup Data"
                sublabel="Download JSON snapshot"
                onClick={handleBackup}
                right={<i className="fa-solid fa-chevron-right text-sm" style={{ color: "var(--text-muted)" }} />}
              />
            </Section>
          </motion.div>

          {/* Danger */}
          <motion.div variants={fadeUp} custom={0.18} initial="hidden" animate="visible">
            <Section title="Account">
              <Row
                icon="fa-solid fa-sign-out"
                iconBg="#FEE2E2"
                label="Logout"
                sublabel="Sign out of your account"
                onClick={handleLogout}
                danger
                right={<i className="fa-solid fa-chevron-right text-sm" style={{ color: "#FDA4AF" }} />}
              />
            </Section>
          </motion.div>

          <motion.p
            variants={fadeUp} custom={0.24}
            initial="hidden" animate="visible"
            className="text-center font-medium pb-4"
            style={{ fontSize: 11, color: "var(--text-muted)" }}
          >
            Room Khata Pro · v2.0 🏠
          </motion.p>

        </div>
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {editOpen && (
          <EditProfileModal
            key="edit"
            profile={profile}
            profileDocId={profileDocId}
            onClose={() => setEditOpen(false)}
            onSaved={(updated) => { setProfile(updated); toast("✓ Profile saved!"); }}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="fixed bottom-8 inset-x-4 z-50 flex justify-center pointer-events-none"
          >
            <div
              className="px-5 py-3 rounded-2xl text-sm font-bold text-white shadow-xl"
              style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
            >
              {toastMsg}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
