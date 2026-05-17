// src/views/OnboardingView.jsx
// ─────────────────────────────────────────────────────────────
//  3-step onboarding wizard for new owners
//
//  Step 1 — Enter your name
//  Step 2 — How many buildings? (1–4+)
//  Step 3 — Add building name + room count + starting number
//           (loops once per building, then finishes)
//
//  On completion: navigates to /owner (App.jsx handles routing
//  because onAuthStateChanged will see buildings now exist)
// ─────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { collection, addDoc, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useApp } from "../context/AppContext";

// ── helpers ──────────────────────────────────────────────────
function genConnectionCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "RK-" + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── motion variants ──────────────────────────────────────────
const ease = [0.22, 1, 0.36, 1];
const slideIn = {
  hidden:  { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0,  transition: { duration: 0.42, ease } },
  exit:    { opacity: 0, x: -30, transition: { duration: 0.28, ease } },
};
const fadeUp = {
  hidden:  { opacity: 0, y: 18 },
  visible: (d = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay: d, ease } }),
};

// ── shared styled input ──────────────────────────────────────
function Field({ label, children }) {
  return (
    <div className="text-left">
      <label className="block text-sm font-bold mb-2" style={{ color: "var(--indigo)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", required, min, max }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      min={min}
      max={max}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="w-full px-5 py-4 rounded-2xl font-medium text-base outline-none transition-all"
      style={{
        background:  focused ? "#fff" : "var(--surface2)",
        border:      `1.5px solid ${focused ? "var(--saffron)" : "var(--border)"}`,
        boxShadow:   focused ? "0 0 0 4px rgba(255,102,0,0.10)" : "none",
        fontFamily:  "'Poppins', sans-serif",
        color:       "var(--text-primary)",
      }}
    />
  );
}

// ── progress dots ────────────────────────────────────────────
function ProgressDots({ total, current }) {
  return (
    <div className="flex justify-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width:      i === current ? 18 : 7,
            height:     7,
            background: i <= current ? "var(--saffron)" : "var(--border)",
          }}
        />
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// STEP 1 — Name
// ════════════════════════════════════════════════════════════
function Step1({ onNext }) {
  const [name, setName] = useState("");
  return (
    <motion.div
      key="step1"
      variants={slideIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="w-full max-w-sm mx-auto text-center"
    >
      <motion.div variants={fadeUp} custom={0.05}>
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl"
          style={{ background: "linear-gradient(135deg,#FF6600,#F59E0B)" }}
        >
          <i className="fa-solid fa-person text-4xl text-white" />
        </div>
        <h2 className="text-3xl font-black mb-2" style={{ color: "var(--indigo)" }}>
          नमस्ते! 🙏
        </h2>
        <p className="text-sm font-medium mb-10" style={{ color: "#6B7280" }}>
          Property management शुरू करते हैं
        </p>
      </motion.div>

      <motion.form
        variants={fadeUp}
        custom={0.12}
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onNext(name.trim());
        }}
      >
        <Field label="आपका नाम क्या है?">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ramesh Sharma"
            required
          />
        </Field>
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full py-4 text-white font-black rounded-2xl text-lg flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-40"
          style={{
            background:  "linear-gradient(135deg,#FF6600,#F59E0B)",
            boxShadow:   "0 8px 28px rgba(255,102,0,0.35)",
            border: "none", cursor: "pointer",
          }}
        >
          <i className="fa-solid fa-arrow-right" /> आगे बढ़ें
        </button>
      </motion.form>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════
// STEP 2 — Building count
// ════════════════════════════════════════════════════════════
function Step2({ ownerFirstName, onNext, onBack }) {
  const [count, setCount] = useState(null);
  const options = [1, 2, 3, 4];

  return (
    <motion.div
      key="step2"
      variants={slideIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="w-full max-w-sm mx-auto text-center"
    >
      <motion.div variants={fadeUp} custom={0.05}>
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl"
          style={{ background: "linear-gradient(135deg,#7C3AED,#EC4899)" }}
        >
          <i className="fa-solid fa-building text-4xl text-white" />
        </div>
        <h2 className="text-3xl font-black mb-2" style={{ color: "var(--indigo)" }}>
          बढ़िया, <span style={{ color: "var(--saffron)" }}>{ownerFirstName}</span>!
        </h2>
        <p className="text-sm font-medium mb-10" style={{ color: "#6B7280" }}>
          कितनी buildings हैं?
        </p>
      </motion.div>

      <motion.div variants={fadeUp} custom={0.12} className="space-y-6">
        <div className="grid grid-cols-4 gap-3">
          {options.map((n) => {
            const isActive = count === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className="p-4 rounded-2xl font-bold text-xl transition-all border-2 active:scale-95"
                style={{
                  background:   isActive ? "linear-gradient(135deg,#7C3AED,#EC4899)" : "#F3E8D0",
                  borderColor:  isActive ? "#7C3AED" : "transparent",
                  color:        isActive ? "white" : "var(--indigo)",
                  boxShadow:    isActive ? "0 6px 18px rgba(124,58,237,0.3)" : "none",
                  cursor: "pointer",
                }}
              >
                {n === 4 ? "4+" : n}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => count && onNext(count)}
          disabled={!count}
          className="w-full py-4 text-white font-black rounded-2xl text-lg flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-40"
          style={{
            background:  "linear-gradient(135deg,#7C3AED,#EC4899)",
            boxShadow:   "0 8px 28px rgba(124,58,237,0.3)",
            border: "none", cursor: "pointer",
          }}
        >
          <i className="fa-solid fa-arrow-right" /> Continue
        </button>

        <button
          type="button"
          onClick={onBack}
          className="font-bold text-sm"
          style={{ color: "var(--saffron)", background: "none", border: "none", cursor: "pointer" }}
        >
          <i className="fa-solid fa-arrow-left mr-1" /> वापस
        </button>
      </motion.div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════
// STEP 3 — Add building + rooms (loops per building)
// ════════════════════════════════════════════════════════════
function Step3({ currentIdx, totalBuildings, authUid, onFinish, onBack }) {
  const [bName,   setBName]   = useState("");
  const [rCount,  setRCount]  = useState("");
  const [rStart,  setRStart]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const count = parseInt(rCount, 10);
    if (!bName.trim() || !count || count < 1) return;

    setLoading(true);
    try {
      // Create building
      const bRef = await addDoc(collection(db, "buildings"), {
        ownerId:   authUid,
        name:      bName.trim(),
        createdAt: new Date(),
      });

      // Create rooms
      const startNum = parseInt(rStart, 10) || 1;
      const promises = Array.from({ length: count }, (_, i) =>
        addDoc(collection(db, "rooms"), {
          buildingId:      bRef.id,
          ownerId:         authUid,
          roomNo:          (startNum + i).toString(),
          tenantName:      "",
          rent:            0,
          status:          "pending",
          connectionCode:  genConnectionCode(),
          createdAt:       new Date(),
        })
      );
      await Promise.all(promises);

      setBName(""); setRCount(""); setRStart("");
      onFinish();            // parent decides: next building or done
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      key={`step3-${currentIdx}`}
      variants={slideIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="w-full flex flex-col h-full"
    >
      {/* Green header */}
      <div
        className="text-white px-6 py-6 shrink-0"
        style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
      >
        <h2 className="text-2xl font-black">Property जोड़ें 🏠</h2>
        <p className="text-emerald-100 text-sm mt-1">
          Step {currentIdx + 1} of {totalBuildings}
        </p>
        {/* mini progress bar */}
        <div
          className="mt-3 overflow-hidden"
          style={{ height: 3, borderRadius: 99, background: "rgba(255,255,255,0.2)" }}
        >
          <div
            className="h-full transition-all duration-500"
            style={{
              borderRadius: 99,
              background: "white",
              width: `${((currentIdx) / totalBuildings) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-6 pt-8 pb-24">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <Field label="Building का नाम">
            <TextInput
              value={bName}
              onChange={(e) => setBName(e.target.value)}
              placeholder="जैसे: Sunrise Apartments"
              required
            />
          </Field>
          <Field label="कितने कमरे?">
            <TextInput
              type="number"
              value={rCount}
              onChange={(e) => setRCount(e.target.value)}
              placeholder="5"
              required
              min="1"
              max="50"
            />
          </Field>
          <Field label="Room नंबर शुरू (Optional)">
            <TextInput
              value={rStart}
              onChange={(e) => setRStart(e.target.value)}
              placeholder="जैसे 101 → 101, 102, 103…"
            />
          </Field>

          {error && (
            <div
              className="rounded-2xl px-4 py-3 text-sm font-semibold"
              style={{ background: "#FEE2E2", color: "#991B1B", border: "1.5px solid #FECACA" }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !bName.trim() || !rCount}
            className="w-full py-4 text-white font-black rounded-2xl text-lg flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-40"
            style={{
              background:  "linear-gradient(135deg,#059669,#047857)",
              boxShadow:   "0 8px 28px rgba(5,150,105,0.3)",
              border: "none", cursor: "pointer",
            }}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="3" />
                  <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Saving…
              </>
            ) : (
              <><i className="fa-solid fa-check" /> Rooms जोड़ें</>
            )}
          </button>
        </form>
      </div>

      {/* Back + Skip footer */}
      <div
        className="absolute bottom-0 left-0 right-0 flex gap-3 px-6 pb-8 pt-4"
        style={{ background: "linear-gradient(0deg, var(--cream) 70%, transparent)" }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 rounded-xl font-bold transition-all active:scale-95"
          style={{ background: "#F3E8D0", color: "var(--indigo)", border: "none", cursor: "pointer" }}
        >
          वापस
        </button>
        <button
          type="button"
          onClick={onFinish}
          className="flex-1 py-3 rounded-xl font-bold transition-all active:scale-95"
          style={{ background: "#FEF3C7", color: "var(--gold2)", border: "none", cursor: "pointer" }}
        >
          Skip
        </button>
      </div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════
// ROOT — OnboardingView
// ════════════════════════════════════════════════════════════
export default function OnboardingView() {
  const { authUser, setUserRole } = useApp();
  const navigate = useNavigate();

  const [step,          setStep]          = useState(1);  // 1 | 2 | 3
  const [ownerName,     setOwnerName]     = useState("");
  const [buildingCount, setBuildingCount] = useState(1);
  const [buildingIdx,   setBuildingIdx]   = useState(0);

  const goToOwnerDash = useCallback(() => {
    setUserRole("owner");
    navigate("/owner", { replace: true });
  }, [navigate, setUserRole]);

  const handleStep1 = (name) => { setOwnerName(name); setStep(2); };
  const handleStep2 = (count) => { setBuildingCount(count); setStep(3); };

  // Called after each building is saved (or skipped)
  const handleBuildingDone = useCallback(() => {
    const nextIdx = buildingIdx + 1;
    if (nextIdx < buildingCount) {
      setBuildingIdx(nextIdx);
      // Re-render Step3 with new key via state update
    } else {
      goToOwnerDash();
    }
    setBuildingIdx(nextIdx < buildingCount ? nextIdx : buildingIdx);
    if (nextIdx >= buildingCount) goToOwnerDash();
  }, [buildingIdx, buildingCount, goToOwnerDash]);

  return (
    <div
      className="flex flex-col h-full overflow-hidden relative"
      style={{ background: "linear-gradient(160deg,#FFFBF5 0%,#FEF3C7 100%)" }}
    >
      {/* Progress dots — only on step 1 & 2 */}
      {step < 3 && (
        <div className="pt-12 px-6">
          <ProgressDots total={3} current={step - 1} />
        </div>
      )}

      <div className={`flex-1 overflow-y-auto ${step < 3 ? "px-6 pb-12" : ""} flex flex-col justify-center`}>
        <AnimatePresence mode="wait">
          {step === 1 && <Step1 key="s1" onNext={handleStep1} />}
          {step === 2 && (
            <Step2
              key="s2"
              ownerFirstName={ownerName.split(" ")[0]}
              onNext={handleStep2}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <Step3
              key={`s3-${buildingIdx}`}
              currentIdx={buildingIdx}
              totalBuildings={buildingCount}
              authUid={authUser?.uid}
              onFinish={handleBuildingDone}
              onBack={() => setStep(2)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
