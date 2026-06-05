// src/views/LoginView.jsx
// ─────────────────────────────────────────────────────────────
// Three-panel animated login flow:
//   Panel 1  — Role Selection  (Owner vs Tenant)
//   Panel 2a — Owner  Login / Signup  (email + password)
//   Panel 2b — Tenant Login  (WhatsApp + Connection Code → Anonymous Auth)
//
// Logic ported 1-to-1 from original app.js:
//   handleLoginSubmit, handleSignupSubmit, handleTenantCodeLogin
// ─────────────────────────────────────────────────────────────

import { useState, useRef } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
} from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  setDoc,
  doc,
} from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { useApp }   from "../context/AppContext";

// ── Panel keys ───────────────────────────────────────────────
const PANEL = { ROLE: "role", OWNER: "owner", TENANT: "tenant" };

// ────────────────────────────────────────────────────────────
// Spinner
// ────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="3" />
      <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// Animated slide-in panel wrapper
// ────────────────────────────────────────────────────────────
function SlidePanel({ dir = "right", children }) {
  const tx = dir === "right" ? "40px" : "-40px";
  return (
    <div
      style={{
        animation: "panelSlideIn 0.42s cubic-bezier(0.34,1.2,0.64,1) both",
        "--tx": tx,
      }}
    >
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Reusable styled input (focus ring matches saffron brand)
// ────────────────────────────────────────────────────────────
function AuthInput({ iconClass, type = "text", placeholder, value, onChange, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <i
        className={`${iconClass} absolute left-4 top-1/2 -translate-y-1/2 text-sm pointer-events-none transition-colors duration-200`}
        style={{ color: focused ? "var(--saffron)" : "#7C3AED" }}
      />
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full pl-11 pr-4 py-3.5 rounded-2xl font-medium text-[15px] outline-none transition-all duration-200"
        style={{
          background:    focused ? "#fff" : "var(--surface2)",
          border:        `1.5px solid ${focused ? "var(--saffron)" : "var(--border)"}`,
          boxShadow:     focused ? "0 0 0 4px rgba(255,102,0,0.1)" : "none",
          color:         "var(--text-primary)",
          fontFamily:    "Poppins, sans-serif",
        }}
        {...rest}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Error banner
// ────────────────────────────────────────────────────────────
function ErrorBanner({ msg }) {
  if (!msg) return null;
  return (
    <div
      className="flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-semibold animate-fadeUp"
      style={{ background: "#FEE2E2", color: "#991B1B", border: "1.5px solid #FECACA" }}
    >
      <i className="fa-solid fa-circle-exclamation mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// PANEL 1 — Role Selection
// ════════════════════════════════════════════════════════════
function RolePanel({ onSelect }) {
  return (
    <SlidePanel dir="left">
      <p className="text-center text-sm font-bold mb-5" style={{ color: "#6B7280" }}>
        आप कौन हैं? / Who are you?
      </p>

      {/* Owner card */}
      <button
        type="button"
        onClick={() => onSelect(PANEL.OWNER)}
        className="w-full mb-4 rounded-3xl p-5 text-left flex items-center gap-4 transition-all active:scale-95 overflow-hidden"
        style={{
          background:  "linear-gradient(135deg,#2D1B69 0%,#4C1D95 60%,#6D28D9 100%)",
          boxShadow:   "0 12px 32px rgba(45,27,105,.35)",
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md"
          style={{ background: "rgba(255,255,255,.15)" }}
        >
          <i className="fa-solid fa-key text-2xl text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-black text-lg leading-tight">मैं मकान मालिक हूँ</p>
          <p className="text-purple-200 text-xs font-semibold mt-0.5">I am an Owner / Landlord</p>
        </div>
        <i className="fa-solid fa-chevron-right text-white/60 shrink-0" />
      </button>

      {/* Tenant card */}
      <button
        type="button"
        onClick={() => onSelect(PANEL.TENANT)}
        className="w-full rounded-3xl p-5 text-left flex items-center gap-4 transition-all active:scale-95 overflow-hidden"
        style={{
          background: "linear-gradient(135deg,#FF6600 0%,#FF8C00 60%,#F59E0B 100%)",
          boxShadow:  "0 12px 32px rgba(255,102,0,.35)",
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md"
          style={{ background: "rgba(255,255,255,.18)" }}
        >
          <i className="fa-solid fa-house-user text-2xl text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-black text-lg leading-tight">मैं किरायेदार हूँ</p>
          <p className="text-orange-100 text-xs font-semibold mt-0.5">I am a Tenant / Kirayedaar</p>
        </div>
        <i className="fa-solid fa-chevron-right text-white/60 shrink-0" />
      </button>
    </SlidePanel>
  );
}

// ════════════════════════════════════════════════════════════
// PANEL 2a — Owner Login & Signup
// ════════════════════════════════════════════════════════════
function OwnerPanel({ onBack }) {
  const [mode,     setMode]    = useState("login"); // "login" | "signup"
  const [email,    setEmail]   = useState("");
  const [password, setPass]    = useState("");
  const [name,     setName]    = useState("");
  const [address,  setAddr]    = useState("");
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState("");
  const { setUserRole } = useApp();

  const isLogin = mode === "login";

  // ── Owner email/password login ────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setUserRole("owner");
      // App.jsx auth listener handles navigation
    } catch {
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Owner signup → saves profile to Firestore ─────────────
  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Please enter your full name."); return; }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      // Mirrors original: saves to ownerProfiles collection
      await addDoc(collection(db, "ownerProfiles"), {
        uid:       cred.user.uid,
        name:      name.trim(),
        address:   address.trim(),
        email:     email.trim(),
        createdAt: new Date().toISOString(),
      });
      setUserRole("owner");
      // onAuthStateChanged → App.jsx routes to /onboarding
    } catch (err) {
      const msg =
        err.code === "auth/email-already-in-use" ? "Email already in use. Sign in instead." :
        err.code === "auth/weak-password"         ? "Password must be at least 6 characters." :
        "Signup failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => { setMode(isLogin ? "signup" : "login"); setError(""); };

  return (
    <SlidePanel dir="right">
      {/* Back */}
      <button
        type="button" onClick={onBack}
        className="flex items-center gap-2 font-bold mb-5 active:scale-95 transition-all text-sm"
        style={{ color: "#9CA3AF" }}
      >
        <i className="fa-solid fa-arrow-left" /> वापस जाएं
      </button>

      {/* Header chip */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shadow shrink-0"
          style={{ background: "linear-gradient(135deg,#2D1B69,#6D28D9)" }}
        >
          <i className="fa-solid fa-key text-white" />
        </div>
        <div>
          <p className="font-black text-base" style={{ color: "var(--indigo)" }}>
            {isLogin ? "मकान मालिक Login" : "Account बनाएं"}
          </p>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>
            {isLogin ? "Owner Sign In" : "Create Owner Account"}
          </p>
        </div>
      </div>

      {/* Form card */}
      <div
        className="bg-white rounded-3xl p-6"
        style={{ border: "1.5px solid #DDD6FE", boxShadow: "0 20px 60px rgba(45,27,105,.1)" }}
      >
        <form onSubmit={isLogin ? handleLogin : handleSignup} className="space-y-4">

          {/* Signup-only extras */}
          {!isLogin && (
            <>
              <AuthInput
                iconClass="fa-solid fa-user"
                placeholder="आपका पूरा नाम"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
              <div className="relative">
                <i
                  className="fa-solid fa-location-dot absolute left-4 top-3.5 text-sm pointer-events-none"
                  style={{ color: "#7C3AED" }}
                />
                <textarea
                  rows={2}
                  placeholder="Property address (optional)"
                  value={address}
                  onChange={(e) => setAddr(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl font-medium text-[15px] outline-none resize-none transition-all duration-200"
                  style={{
                    background: "var(--surface2)",
                    border: "1.5px solid var(--border)",
                    color: "var(--text-primary)",
                    fontFamily: "Poppins, sans-serif",
                  }}
                  onFocus={(e) => {
                    e.target.style.background   = "#fff";
                    e.target.style.borderColor  = "var(--saffron)";
                    e.target.style.boxShadow    = "0 0 0 4px rgba(255,102,0,0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.background   = "var(--surface2)";
                    e.target.style.borderColor  = "var(--border)";
                    e.target.style.boxShadow    = "none";
                  }}
                />
              </div>
            </>
          )}

          <AuthInput
            iconClass="fa-solid fa-envelope"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <AuthInput
            iconClass="fa-solid fa-lock"
            type="password"
            placeholder={isLogin ? "••••••••" : "Min 6 characters"}
            value={password}
            onChange={(e) => setPass(e.target.value)}
            required
            minLength={6}
            autoComplete={isLogin ? "current-password" : "new-password"}
          />

          <ErrorBanner msg={error} />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 mt-2 text-white font-black rounded-2xl text-lg flex justify-center items-center gap-2 transition-all active:scale-95 disabled:opacity-60"
            style={{
              background:  "linear-gradient(135deg,#2D1B69,#6D28D9)",
              boxShadow:   "0 8px 28px rgba(45,27,105,.35)",
            }}
          >
            {loading ? (
              <><Spinner /> {isLogin ? "Signing in…" : "Creating…"}</>
            ) : isLogin ? (
              <><span>Sign In / साइन इन</span><i className="fa-solid fa-arrow-right" /></>
            ) : (
              <><span>Create Account</span><i className="fa-solid fa-arrow-right" /></>
            )}
          </button>
        </form>
      </div>

      {/* Mode toggle */}
      <p className="mt-5 text-sm text-center" style={{ color: "#6B7280" }}>
        {isLogin ? "नया account? " : "Account है? "}
        <button type="button" className="font-bold" style={{ color: "var(--saffron)" }} onClick={switchMode}>
          {isLogin ? "Create Account" : "Sign In"}
        </button>
      </p>
    </SlidePanel>
  );
}

// ════════════════════════════════════════════════════════════
// PANEL 2b — Tenant Code Login
// ════════════════════════════════════════════════════════════
function TenantPanel({ onBack }) {
  const [phone,   setPhone]   = useState("");
  const [code,    setCode]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const { setUserRole } = useApp();

  const handleCodeChange = (e) =>
    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9));

  // ── Tenant Connection Code login (mirrors handleTenantCodeLogin) ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!phone || phone.length !== 10) {
      setError("कृपया valid 10-digit WhatsApp number डालें।");
      return;
    }
    if (!code.trim()) {
      setError("कृपया Connection Code डालें।");
      return;
    }

    setLoading(true);
    try {
      // Step 1: Find room by connectionCode
      const snap = await getDocs(
        query(collection(db, "rooms"), where("connectionCode", "==", code.trim()))
      );
      if (snap.empty) {
        setError("❌ Invalid Code! मकान मालिक से सही code लें।");
        setLoading(false);
        return;
      }

      const roomDoc  = snap.docs[0];
      const roomId   = roomDoc.id;
      const roomData = roomDoc.data();

      // Step 2: Anonymous Firebase Auth session
      const cred      = await signInAnonymously(auth);
      const tenantUid = cred.user.uid;

      // Step 3: Link tenant UID + WhatsApp to the room document
      await updateDoc(doc(db, "rooms", roomId), {
        tenantPhone: phone,
        tenantUid:   tenantUid,
        status:      roomData.status || "pending",
      });

      // Step 4: Lightweight tenant profile (merge so repeat logins are safe)
      await setDoc(
        doc(db, "tenantProfiles", tenantUid),
        { phone, roomId, joinedAt: new Date().toISOString() },
        { merge: true }
      );

      setUserRole("tenant");
      // App.jsx onAuthStateChanged → navigates to /tenant
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <SlidePanel dir="right">
      {/* Back */}
      <button
        type="button" onClick={onBack}
        className="flex items-center gap-2 font-bold mb-5 active:scale-95 transition-all text-sm"
        style={{ color: "#9CA3AF" }}
      >
        <i className="fa-solid fa-arrow-left" /> वापस जाएं
      </button>

      {/* Header chip */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shadow shrink-0"
          style={{ background: "linear-gradient(135deg,#FF6600,#F59E0B)" }}
        >
          <i className="fa-solid fa-house-user text-white" />
        </div>
        <div>
          <p className="font-black text-base" style={{ color: "var(--indigo)" }}>किरायेदार Login</p>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>Tenant Sign In via Code</p>
        </div>
      </div>

      {/* Form card */}
      <div
        className="bg-white rounded-3xl p-6"
        style={{ border: "1.5px solid #FED7AA", boxShadow: "0 20px 60px rgba(255,102,0,.1)" }}
      >
        {/* Info banner */}
        <div
          className="flex items-start gap-3 rounded-2xl p-3 mb-5"
          style={{ background: "linear-gradient(135deg,#FFF7ED,#FEF3C7)", border: "1.5px solid #FED7AA" }}
        >
          <i className="fa-solid fa-circle-info mt-0.5 shrink-0" style={{ color: "var(--saffron)" }} />
          <p className="text-xs font-medium leading-relaxed" style={{ color: "#92400E" }}>
            अपना <strong>WhatsApp नंबर</strong> और मकान मालिक से मिला{" "}
            <strong>6-character Code</strong> डालें।
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* WhatsApp number */}
          <div>
            <label
              className="block text-xs font-bold mb-1.5 uppercase tracking-wider"
              style={{ color: "var(--indigo)" }}
            >
              WhatsApp Number
            </label>
            <div className="relative">
              <span
                className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold pointer-events-none select-none"
                style={{ color: "var(--saffron)" }}
              >
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                pattern="[0-9]{10}"
                required
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="w-full pl-14 pr-4 py-3.5 rounded-2xl font-medium text-[15px] outline-none transition-all duration-200"
                style={{
                  background:  "var(--surface2)",
                  border:      "1.5px solid var(--border)",
                  color:       "var(--text-primary)",
                  fontFamily:  "Poppins, sans-serif",
                }}
                onFocus={(e) => {
                  e.target.style.background  = "#fff";
                  e.target.style.borderColor = "var(--saffron)";
                  e.target.style.boxShadow   = "0 0 0 4px rgba(255,102,0,0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.background  = "var(--surface2)";
                  e.target.style.borderColor = "var(--border)";
                  e.target.style.boxShadow   = "none";
                }}
              />
            </div>
          </div>

          {/* Connection Code */}
          <div>
            <label
              className="block text-xs font-bold mb-1.5 uppercase tracking-wider"
              style={{ color: "var(--indigo)" }}
            >
              Connection Code (Room ID)
            </label>
            <div className="relative">
              <i
                className="fa-solid fa-hashtag absolute left-4 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                style={{ color: "var(--saffron)" }}
              />
              <input
                type="text"
                maxLength={9}
                required
                placeholder="e.g. RK-A4X9B2"
                value={code}
                onChange={handleCodeChange}
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-[15px] outline-none tracking-widest uppercase transition-all duration-200"
                style={{
                  fontFamily:  "JetBrains Mono, monospace",
                  fontWeight:  600,
                  background:  "var(--surface2)",
                  border:      "1.5px solid var(--border)",
                  color:       "var(--text-primary)",
                }}
                onFocus={(e) => {
                  e.target.style.background  = "#fff";
                  e.target.style.borderColor = "var(--saffron)";
                  e.target.style.boxShadow   = "0 0 0 4px rgba(255,102,0,0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.background  = "var(--surface2)";
                  e.target.style.borderColor = "var(--border)";
                  e.target.style.boxShadow   = "none";
                }}
              />
            </div>
          </div>

          <ErrorBanner msg={error} />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 mt-1 text-white font-black rounded-2xl text-lg flex justify-center items-center gap-2 transition-all active:scale-95 disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg,#FF6600,#F59E0B)",
              boxShadow:  "0 8px 28px rgba(255,102,0,.35)",
            }}
          >
            {loading ? (
              <><Spinner /> Verifying…</>
            ) : (
              <><span>Room Join करें</span><i className="fa-solid fa-right-to-bracket" /></>
            )}
          </button>
        </form>
      </div>
    </SlidePanel>
  );
}

// ════════════════════════════════════════════════════════════
// ROOT — LoginView
// ════════════════════════════════════════════════════════════
export default function LoginView() {
  const [panel, setPanel] = useState(PANEL.ROLE);

  return (
    <>
      {/* CSS keyframes injected once per mount */}
      <style>{`
        @keyframes panelSlideIn {
          from { opacity: 0; transform: translateX(var(--tx, 40px)); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes logoFloat {
          0%,100% { transform: translateY(0px)   rotate(-2deg); }
          50%      { transform: translateY(-14px) rotate(2deg);  }
        }
      `}</style>

      <div
        className="flex flex-col justify-center items-center min-h-full px-6 py-10 overflow-y-auto"
        style={{ background: "linear-gradient(160deg,#FFFBF5 0%,#FEF3C7 55%,#FFFBF5 100%)" }}
      >
        <div className="w-full max-w-sm">

          {/* ══ Logo block ══ */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-5">
              {/* Animated house icon */}
              <div
                className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-2xl"
                style={{
                  background:  "linear-gradient(135deg,#FF6600,#F59E0B)",
                  boxShadow:   "0 20px 50px rgba(255,102,0,.4)",
                  animation:   "logoFloat 3.5s ease-in-out infinite",
                }}
              >
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none"
                  stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 10L12 3l9 7" />
                  <path d="M5 10v11a2 2 0 002 2h10a2 2 0 002-2V10" />
                  <rect x="8" y="10" width="8" height="10" rx="1" />
                  <path d="M10 13h4" /><path d="M10 16h4" />
                </svg>
              </div>

              {/* ₹ badge */}
              <div
                className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
                style={{ background: "#F59E0B" }}
              >
                <span className="text-white font-black text-sm">₹</span>
              </div>
            </div>

            <h1 className="text-4xl font-black tracking-tight" style={{ color: "var(--indigo)" }}>
              Room<span style={{ color: "var(--saffron)" }}>Khata</span>
            </h1>
            <p className="text-xs font-bold tracking-[.3em] mt-1" style={{ color: "#9CA3AF" }}>
              RENT · TRACK · RELAX
            </p>
            <p className="text-xs font-semibold mt-1" style={{ color: "var(--gold2)" }}>
              किराया खाता प्रो 🏠
            </p>
          </div>

          {/* ══ Active panel ══ */}
          {panel === PANEL.ROLE   && <RolePanel   onSelect={setPanel} />}
          {panel === PANEL.OWNER  && <OwnerPanel  onBack={() => setPanel(PANEL.ROLE)} />}
          {panel === PANEL.TENANT && <TenantPanel onBack={() => setPanel(PANEL.ROLE)} />}

        </div>
      </div>
    </>
  );
}
