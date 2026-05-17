// src/views/TenantDashboardView.jsx
// ─────────────────────────────────────────────────────────────
//  Tenant Dashboard — real-time onSnapshot on their room doc
//
//  Sections:
//    • Hero header — deep navy gradient, room + rent due card
//    • Action grid  — Pay Rent (UPI sheet) · Raise Complaint
//    • Tenancy details — move-in date, security deposit, building
//    • Payment history — from room.paymentHistory array
//    • Active complaints — from room.complaints sub-collection
//
//  UPI sheet is a framer-motion bottom-sheet modal (no extra deps)
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  doc, onSnapshot,
  collection, addDoc, getDocs,
  query, orderBy, where,
  updateDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../firebase/config";
import { useApp } from "../context/AppContext";

// ─────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────
const fmt = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const ease = [0.22, 1, 0.36, 1];

const V = {
  fadeUp: {
    hidden:  { opacity: 0, y: 20 },
    visible: (d = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: d, ease } }),
  },
  sheet: {
    hidden:  { y: "100%" },
    visible: { y: 0,      transition: { duration: 0.42, ease } },
    exit:    { y: "100%", transition: { duration: 0.28, ease: [0.4, 0, 1, 1] } },
  },
  fade: {
    hidden:  { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.3 } },
    exit:    { opacity: 0, transition: { duration: 0.2 } },
  },
};

// ─────────────────────────────────────────────────────────────
// Status colours
// ─────────────────────────────────────────────────────────────
const STATUS = {
  paid:    { label: "✓ PAID",    bg: "rgba(34,197,94,.28)",   color: "#86EFAC" },
  partial: { label: "◑ PARTIAL", bg: "rgba(245,158,11,.28)",  color: "#FCD34D" },
  pending: { label: "⏳ PENDING", bg: "rgba(255,102,0,.22)",   color: "#FED7AA" },
  pending_verification: { label: "👀 VERIFYING", bg: "rgba(124,58,237,.25)", color: "#DDD6FE" },
};

// ─────────────────────────────────────────────────────────────
// UPI BOTTOM SHEET
// ─────────────────────────────────────────────────────────────
function UpiSheet({ amount, upiId, onClose }) {
  const openUpiApp = (app) => {
    const upiString = `upi://pay?pa=${upiId || "owner@upi"}&am=${amount}&cu=INR`;
    const urls = {
      gpay:    `gpay://upi/pay?pa=${upiId}&am=${amount}&cu=INR`,
      phonepe: `phonepe://pay?pa=${upiId}&am=${amount}&cu=INR`,
      paytm:   `paytmmp://upi/pay?pa=${upiId}&am=${amount}&cu=INR`,
    };
    window.open(urls[app] || upiString, "_blank");
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      variants={V.fade}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.55)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        variants={V.sheet}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="relative z-10 rounded-t-3xl px-6 pt-5 pb-8 overflow-hidden"
        style={{
          background:  "linear-gradient(160deg, #1E1B4B 0%, #312E81 100%)",
          borderTop:   "1.5px solid rgba(255,255,255,0.10)",
        }}
      >
        {/* Handle */}
        <div
          className="w-12 h-1 rounded-full mx-auto mb-5"
          style={{ background: "rgba(255,255,255,0.22)" }}
        />

        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black text-white">Pay Rent</h3>
          <span
            className="text-xl font-black"
            style={{ color: "#4ADE80", fontFamily: "'JetBrains Mono', monospace" }}
          >
            {fmt(amount)}
          </span>
        </div>

        {/* Mock QR */}
        <div className="flex justify-center mb-5">
          <div
            className="w-44 h-44 rounded-2xl flex items-center justify-center shadow-inner overflow-hidden"
            style={{ background: "#F9FAFB" }}
          >
            <svg width="160" height="160" viewBox="0 0 160 160" fill="none">
              <rect width="160" height="160" fill="white"/>
              <rect x="10" y="10" width="50" height="50" rx="4" fill="#1E1B4B"/>
              <rect x="16" y="16" width="38" height="38" rx="2" fill="white"/>
              <rect x="22" y="22" width="26" height="26" rx="1" fill="#1E1B4B"/>
              <rect x="100" y="10" width="50" height="50" rx="4" fill="#1E1B4B"/>
              <rect x="106" y="16" width="38" height="38" rx="2" fill="white"/>
              <rect x="112" y="22" width="26" height="26" rx="1" fill="#1E1B4B"/>
              <rect x="10" y="100" width="50" height="50" rx="4" fill="#1E1B4B"/>
              <rect x="16" y="106" width="38" height="38" rx="2" fill="white"/>
              <rect x="22" y="112" width="26" height="26" rx="1" fill="#1E1B4B"/>
              <rect x="70" y="10" width="8" height="8" fill="#1E1B4B"/>
              <rect x="82" y="10" width="8" height="8" fill="#1E1B4B"/>
              <rect x="70" y="22" width="8" height="8" fill="#1E1B4B"/>
              <rect x="82" y="34" width="8" height="8" fill="#1E1B4B"/>
              <rect x="70" y="46" width="8" height="8" fill="#1E1B4B"/>
              <rect x="70" y="70" width="8" height="8" fill="#1E1B4B"/>
              <rect x="82" y="70" width="8" height="8" fill="#1E1B4B"/>
              <rect x="70" y="82" width="8" height="8" fill="#1E1B4B"/>
              <rect x="100" y="70" width="8" height="8" fill="#1E1B4B"/>
              <rect x="112" y="70" width="8" height="8" fill="#1E1B4B"/>
              <rect x="124" y="70" width="8" height="8" fill="#1E1B4B"/>
              <text x="80" y="158" textAnchor="middle" fontSize="6" fill="#999" fontFamily="monospace">SCAN TO PAY</text>
            </svg>
          </div>
        </div>

        <p className="text-center text-xs font-bold mb-1" style={{ color: "rgba(255,255,255,0.45)" }}>
          Scan with any UPI app
        </p>
        <p className="text-center font-black text-sm mb-5" style={{ color: "white" }}>
          {upiId || "owner@upi"}
        </p>

        <p className="font-bold uppercase tracking-widest text-center mb-3" style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
          Or pay with
        </p>

        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { key: "gpay",    emoji: "🅖", label: "GPay"    },
            { key: "phonepe", emoji: "📱", label: "PhonePe" },
            { key: "paytm",   emoji: "💳", label: "Paytm"   },
          ].map((app) => (
            <button
              key={app.key}
              onClick={() => openUpiApp(app.key)}
              className="flex flex-col items-center py-4 rounded-2xl active:scale-90 transition-all"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer" }}
            >
              <span className="text-2xl mb-1">{app.emoji}</span>
              <span className="text-white text-xs font-bold">{app.label}</span>
            </button>
          ))}
        </div>

        <div
          className="rounded-2xl p-3 mb-4 text-center"
          style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.2)" }}
        >
          <p className="text-xs font-medium" style={{ color: "#93C5FD" }}>
            <i className="fa-solid fa-circle-info mr-1" />
            After payment, your landlord will confirm &amp; update your status.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3.5 font-bold rounded-2xl transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.10)", color: "white", border: "none", cursor: "pointer" }}
        >
          Done
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPLAINT MODAL (bottom sheet)
// ─────────────────────────────────────────────────────────────
const COMPLAINT_TYPES = [
  { key: "water",       emoji: "💧", label: "Water Issue"   },
  { key: "electricity", emoji: "⚡", label: "Electricity"   },
  { key: "maintenance", emoji: "🔧", label: "Maintenance"   },
  { key: "noise",       emoji: "🔊", label: "Noise"         },
  { key: "other",       emoji: "📝", label: "Other"         },
];
const PRIORITIES = [
  { key: "low",    label: "Low",    color: "#4ADE80" },
  { key: "medium", label: "Medium", color: "#FCD34D" },
  { key: "high",   label: "High",   color: "#F87171" },
];

function ComplaintSheet({ roomId, ownerId, onClose, onSent }) {
  const [type,     setType]     = useState("maintenance");
  const [priority, setPriority] = useState("medium");
  const [desc,     setDesc]     = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async () => {
    if (!desc.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db, "complaints"), {
        roomId, ownerId,
        type, priority,
        description: desc.trim(),
        status:      "open",
        createdAt:   new Date().toISOString(),
      });
      onSent();
      onClose();
    } catch {
      setLoading(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col justify-end" variants={V.fade} initial="hidden" animate="visible" exit="exit">
      <motion.div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose} />
      <motion.div
        variants={V.sheet} initial="hidden" animate="visible" exit="exit"
        className="relative z-10 bg-white rounded-t-3xl px-6 pt-5 pb-8 overflow-y-auto"
        style={{ maxHeight: "88vh", border: "1.5px solid var(--border)" }}
      >
        <div className="w-12 h-1 rounded-full mx-auto mb-5" style={{ background: "var(--border)" }} />
        <h3 className="text-xl font-black mb-1" style={{ color: "var(--indigo)" }}>Raise Complaint</h3>
        <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>Problem report करें</p>

        {/* Type grid */}
        <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Issue Type</p>
        <div className="grid grid-cols-5 gap-2 mb-5">
          {COMPLAINT_TYPES.map((c) => (
            <button
              key={c.key}
              onClick={() => setType(c.key)}
              className="flex flex-col items-center py-3 rounded-2xl transition-all active:scale-90"
              style={{
                background:  type === c.key ? "linear-gradient(135deg,#FF6600,#F59E0B)" : "var(--surface2)",
                border:      `1.5px solid ${type === c.key ? "transparent" : "var(--border)"}`,
                cursor: "pointer",
              }}
            >
              <span className="text-lg mb-1">{c.emoji}</span>
              <span className="font-bold" style={{ fontSize: 8, color: type === c.key ? "white" : "var(--text-secondary)" }}>
                {c.label}
              </span>
            </button>
          ))}
        </div>

        {/* Priority */}
        <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Priority</p>
        <div className="flex gap-2 mb-5">
          {PRIORITIES.map((p) => (
            <button
              key={p.key}
              onClick={() => setPriority(p.key)}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-90"
              style={{
                background:  priority === p.key ? p.color : "var(--surface2)",
                color:       priority === p.key ? "#1A1D2E" : "var(--text-secondary)",
                border:      `1.5px solid ${priority === p.key ? "transparent" : "var(--border)"}`,
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Description */}
        <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Description</p>
        <textarea
          rows={3}
          placeholder="Problem briefly describe करें…"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl font-medium text-sm outline-none resize-none transition-all mb-5"
          style={{
            background: "var(--surface2)",
            border: "1.5px solid var(--border)",
            fontFamily: "'Poppins', sans-serif",
            color: "var(--text-primary)",
          }}
          onFocus={(e) => { e.target.style.borderColor = "var(--saffron)"; e.target.style.background = "#fff"; }}
          onBlur={(e)  => { e.target.style.borderColor = "var(--border)";  e.target.style.background = "var(--surface2)"; }}
        />

        <button
          onClick={handleSubmit}
          disabled={loading || !desc.trim()}
          className="w-full py-4 text-white font-black rounded-2xl text-base flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg,#FF6600,#DC2626)",
            boxShadow:  "0 8px 24px rgba(255,102,0,0.3)",
            border: "none", cursor: "pointer",
          }}
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="3" />
              <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <><i className="fa-solid fa-triangle-exclamation" /> Submit Complaint</>
          )}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAYMENT HISTORY ROW
// ─────────────────────────────────────────────────────────────
function HistoryRow({ record, index }) {
  const isPaid = record.status === "paid";
  return (
    <motion.div
      variants={V.fadeUp}
      custom={index * 0.04}
      className="flex items-center justify-between py-3"
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        opacity: isPaid ? 1 : 0.65,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: isPaid ? "rgba(34,197,94,0.20)" : "rgba(255,102,0,0.18)" }}
        >
          <i
            className={isPaid ? "fa-solid fa-check text-xs" : "fa-solid fa-clock text-xs"}
            style={{ color: isPaid ? "#86EFAC" : "#FED7AA" }}
          />
        </div>
        <div>
          <p className="font-bold text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
            {record.month || new Date(record.paidDate || record.date || Date.now()).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
          </p>
          <p className="font-medium" style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            {isPaid ? "Full Payment" : "Partial / Pending"}
          </p>
        </div>
      </div>
      <p
        className="font-black"
        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: isPaid ? "#86EFAC" : "#FCD34D" }}
      >
        {fmt(record.amount || record.amountPaid || record.rent)}
      </p>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOT — TenantDashboardView
// ─────────────────────────────────────────────────────────────
export default function TenantDashboardView() {
  const { authUser, setUserRole } = useApp();
  const navigate = useNavigate();

  const [room,         setRoom]         = useState(null);
  const [buildingName, setBuildingName] = useState("");
  const [ownerUpiId,   setOwnerUpiId]   = useState("");
  const [history,      setHistory]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showUpi,      setShowUpi]      = useState(false);
  const [showComplaint,setShowComplaint]= useState(false);
  const [toastMsg,     setToastMsg]     = useState("");

  const unsubRef = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  }, []);

  // ── Find tenant's room then subscribe ─────────────────────
  useEffect(() => {
    if (!authUser) return;
    let unsubRoom = null;

    const init = async () => {
      try {
        // Find room linked to this tenant's UID
        const snap = await (
          getDocs(query(collection(db, "rooms"), where("tenantUid", "==", authUser.uid)))
        );
        if (snap.empty) { setLoading(false); return; }

        const roomId = snap.docs[0].id;

        // Live subscription
        unsubRoom = onSnapshot(doc(db, "rooms", roomId), async (rSnap) => {
          if (!rSnap.exists()) return;
          const data = { id: rSnap.id, ...rSnap.data() };
          setRoom(data);
          setLoading(false);

          // Load building name
          if (data.buildingId) {
            try {
              const { getDoc } = await import("firebase/firestore");
              const bSnap = await getDoc(doc(db, "buildings", data.buildingId));
              if (bSnap.exists()) setBuildingName(bSnap.data().name || "");
            } catch { /* silent */ }
          }

          // Load owner UPI id
          if (data.ownerId) {
            try {
              const { getDocs: gd, collection: col, query: q, where: wh } = await import("firebase/firestore");
              const oSnap = await gd(q(col(db, "ownerProfiles"), wh("uid", "==", data.ownerId)));
              if (!oSnap.empty) setOwnerUpiId(oSnap.docs[0].data().upiId || "");
            } catch { /* silent */ }
          }
        });

        unsubRef.current = unsubRoom;

        // One-shot payment history
        try {
          const hSnap = await getDocs(
            query(collection(db, "paymentHistory"), where("roomId", "==", roomId), orderBy("createdAt", "desc"))
          );
          setHistory(hSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch { /* silent — collection may not exist yet */ }

      } catch { setLoading(false); }
    };

    init();
    return () => { unsubRoom?.(); };
  }, [authUser]);

  const handleLogout = async () => {
    await signOut(auth);
    setUserRole(null);
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: "linear-gradient(135deg,#1E1B4B,#312E81)" }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background: "linear-gradient(135deg,#FF6600,#F59E0B)" }}>
            <span className="text-xl text-white font-black">₹</span>
          </div>
          <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Loading your room…</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex items-center justify-center h-full px-6 text-center" style={{ background: "var(--cream)" }}>
        <div>
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "#FEF3C7" }}>
            <i className="fa-solid fa-house text-2xl" style={{ color: "var(--saffron)" }} />
          </div>
          <p className="font-black text-lg mb-1" style={{ color: "var(--indigo)" }}>Room not found</p>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            Your landlord needs to link you to a room.
          </p>
          <button onClick={handleLogout} className="font-bold text-sm" style={{ color: "var(--saffron)", background: "none", border: "none", cursor: "pointer" }}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const { tenantName, roomNo, rent = 0, electricityBill = 0, balanceDue, status = "pending",
    securityDeposit = 0, ownerId, createdAt } = room;

  const totalDue     = rent + (electricityBill || 0);
  const amountDue    = balanceDue != null ? balanceDue : totalDue;
  const statusCfg    = STATUS[status] || STATUS.pending;
  const isPaid       = status === "paid";

  const moveInDate   = createdAt
    ? (createdAt.toDate ? createdAt.toDate() : new Date(createdAt))
        .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--cream)" }}>

        {/* ── HERO HEADER ── */}
        <motion.div
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.09 } } }}
          initial="hidden"
          animate="visible"
          className="text-white px-5 pt-12 pb-6 relative shrink-0 overflow-hidden"
          style={{
            background: "linear-gradient(155deg,#0F0C29 0%,#1E1B4B 45%,#302B63 80%,#1E1B4B 100%)",
          }}
        >
          {/* Ambient blob */}
          <div
            className="absolute pointer-events-none"
            style={{ top: -40, right: -40, width: 180, height: 180, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,102,0,0.18) 0%, transparent 70%)" }}
          />

          {/* Brand bar */}
          <motion.div variants={V.fadeUp} custom={0} className="flex items-center justify-between mb-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.14)" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 10L12 3l9 7"/><path d="M5 10v11a2 2 0 002 2h10a2 2 0 002-2V10"/>
                  </svg>
                </div>
                <span className="font-black text-sm">
                  Room<span style={{ color: "#FDA4AF" }}>Khata</span>
                </span>
              </div>
              <p className="font-bold leading-none mt-1 ml-9" style={{ fontSize: 7, letterSpacing: "0.2em", color: "rgba(255,255,255,0.38)" }}>
                RENT. TRACK. RELAX.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" style={{ boxShadow: "0 0 0 2px rgba(74,222,128,.3)" }} />
                <span className="text-[9px] font-bold" style={{ color: "#86EFAC" }}>LIVE</span>
              </div>
              <button
                onClick={handleLogout}
                className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all"
                style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer" }}
              >
                <i className="fa-solid fa-sign-out text-sm" />
              </button>
            </div>
          </motion.div>

          {/* Tenant name + room */}
          <motion.div variants={V.fadeUp} custom={0.08} className="mb-5">
            <p className="font-bold uppercase tracking-widest mb-1" style={{ fontSize: 10, color: "rgba(255,255,255,0.50)" }}>
              Welcome back,
            </p>
            <h2 className="font-black tracking-tight leading-none" style={{ fontSize: "clamp(1.75rem,7vw,2.2rem)" }}>
              {tenantName || "Tenant"}
            </h2>
            <p className="font-medium mt-1" style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
              Room <span className="font-black" style={{ color: "rgba(255,255,255,0.78)" }}>{roomNo}</span>
            </p>
          </motion.div>

          {/* Due card */}
          <motion.div
            variants={V.fadeUp}
            custom={0.16}
            className="rounded-2xl p-5 overflow-hidden relative"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(16px)",
            }}
          >
            {/* Top shine */}
            <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg,transparent 10%,rgba(255,255,255,0.18) 50%,transparent 90%)" }} />

            <div className="flex items-center justify-between mb-3">
              <p className="font-bold uppercase tracking-widest" style={{ fontSize: 10, color: "rgba(255,255,255,0.50)" }}>
                Total Due This Month
              </p>
              <span className="font-black px-2.5 py-1 rounded-lg text-[10px]" style={{ background: statusCfg.bg, color: statusCfg.label.includes("PAID") ? "#86EFAC" : statusCfg.color }}>
                {statusCfg.label}
              </span>
            </div>

            <p
              className="font-black tracking-tight leading-none mb-3"
              style={{
                fontSize: "clamp(2.5rem,10vw,3rem)",
                fontFamily: "'JetBrains Mono', monospace",
                color: isPaid ? "#86EFAC" : "white",
              }}
            >
              {fmt(amountDue)}
            </p>

            <div className="flex items-center gap-5 flex-wrap">
              <div>
                <p className="font-bold uppercase" style={{ fontSize: 9, color: "rgba(255,255,255,0.32)" }}>Base Rent</p>
                <p className="font-bold text-sm" style={{ color: "rgba(255,255,255,0.75)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmt(rent)}
                </p>
              </div>
              {(electricityBill || 0) > 0 && (
                <div>
                  <p className="font-bold uppercase" style={{ fontSize: 9, color: "rgba(255,255,255,0.32)" }}>+ Electricity</p>
                  <p className="font-bold text-sm" style={{ color: "#FCD34D", fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmt(electricityBill)}
                  </p>
                </div>
              )}
              {balanceDue != null && balanceDue < totalDue && balanceDue > 0 && (
                <div className="ml-auto">
                  <p className="font-bold uppercase" style={{ fontSize: 9, color: "rgba(255,255,255,0.32)" }}>Balance Due</p>
                  <p className="font-bold text-sm" style={{ color: "#F87171", fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmt(balanceDue)}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 space-y-4" style={{ background: "var(--cream)" }}>

          {/* Action grid */}
          <motion.div
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 gap-3"
          >
            {/* Pay Rent */}
            <motion.button
              variants={V.fadeUp}
              custom={0}
              onClick={() => setShowUpi(true)}
              className="flex flex-col items-center justify-center py-6 rounded-2xl active:scale-95 transition-all"
              style={{
                background:  "linear-gradient(135deg,#2563EB,#1D4ED8)",
                boxShadow:   "0 8px 24px rgba(37,99,235,0.35)",
                border: "none", cursor: "pointer",
              }}
            >
              <i className="fa-solid fa-qrcode text-2xl text-white mb-2" />
              <span className="text-sm font-black text-white">Pay Rent</span>
              <span className="font-semibold mt-0.5" style={{ fontSize: 9, color: "#BFDBFE" }}>UPI / QR Code</span>
            </motion.button>

            {/* Raise Complaint */}
            <motion.button
              variants={V.fadeUp}
              custom={0.04}
              onClick={() => setShowComplaint(true)}
              className="flex flex-col items-center justify-center py-6 rounded-2xl active:scale-95 transition-all"
              style={{
                background:  "linear-gradient(135deg,#FF6600,#DC2626)",
                boxShadow:   "0 8px 24px rgba(255,102,0,0.35)",
                border: "none", cursor: "pointer",
              }}
            >
              <i className="fa-solid fa-triangle-exclamation text-2xl text-white mb-2" />
              <span className="text-sm font-black text-white">Raise Complaint</span>
              <span className="font-semibold mt-0.5" style={{ fontSize: 9, color: "#FED7AA" }}>Report an issue</span>
            </motion.button>
          </motion.div>

          {/* Tenancy details card */}
          <motion.div
            variants={V.fadeUp}
            custom={0.1}
            initial="hidden"
            animate="visible"
            className="rounded-2xl p-5 overflow-hidden relative"
            style={{
              background: "linear-gradient(135deg,#1E1B4B 0%,#2D2065 100%)",
              boxShadow: "0 8px 24px rgba(30,27,75,0.20)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg,transparent 10%,rgba(255,255,255,0.14) 50%,transparent 90%)" }} />
            <p className="font-black uppercase tracking-widest mb-4" style={{ fontSize: 10, color: "rgba(255,255,255,0.40)" }}>
              Your Tenancy Details
            </p>
            {[
              { label: "Move-in Date",     value: moveInDate,               color: "rgba(255,255,255,0.75)" },
              { label: "Security Deposit", value: fmt(securityDeposit),      color: "#86EFAC" },
              { label: "Building",         value: buildingName || "—",       color: "rgba(255,255,255,0.75)", small: true },
              { label: "Room No.",         value: `Room ${roomNo}`,          color: "rgba(255,255,255,0.75)" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-2.5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>{row.label}</span>
                <span className={`font-bold text-right ${row.small ? "max-w-[55%]" : ""}`}
                  style={{ fontSize: 13, color: row.color, fontFamily: row.label === "Security Deposit" ? "'JetBrains Mono', monospace" : "inherit" }}>
                  {row.value}
                </span>
              </div>
            ))}
          </motion.div>

          {/* Payment history card */}
          <motion.div
            variants={V.fadeUp}
            custom={0.18}
            initial="hidden"
            animate="visible"
            className="rounded-2xl p-5 overflow-hidden relative"
            style={{
              background: "linear-gradient(135deg,#1E1B4B 0%,#2D2065 100%)",
              boxShadow: "0 8px 24px rgba(30,27,75,0.20)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg,transparent 10%,rgba(255,255,255,0.14) 50%,transparent 90%)" }} />
            <div className="flex items-center justify-between mb-4">
              <p className="font-black uppercase tracking-widest" style={{ fontSize: 10, color: "rgba(255,255,255,0.40)" }}>
                Payment History
              </p>
              <span
                className="font-bold px-2 py-0.5 rounded-lg"
                style={{ fontSize: 10, background: "rgba(37,99,235,0.25)", color: "#93C5FD" }}
              >
                {history.length} records
              </span>
            </div>
            {history.length === 0 ? (
              <div className="text-center py-6" style={{ color: "rgba(255,255,255,0.22)" }}>
                <i className="fa-solid fa-clock-rotate-left text-3xl mb-2 block" />
                <p className="text-sm">No payment history yet</p>
              </div>
            ) : (
              <motion.div
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
                initial="hidden"
                animate="visible"
              >
                {history.slice(0, 6).map((h, i) => <HistoryRow key={h.id} record={h} index={i} />)}
              </motion.div>
            )}
          </motion.div>

        </div>
      </div>

      {/* ── Overlays ── */}
      <AnimatePresence>
        {showUpi && (
          <UpiSheet
            key="upi"
            amount={amountDue}
            upiId={ownerUpiId}
            onClose={() => setShowUpi(false)}
          />
        )}
        {showComplaint && (
          <ComplaintSheet
            key="complaint"
            roomId={room.id}
            ownerId={ownerId}
            onClose={() => setShowComplaint(false)}
            onSent={() => toast("✓ Complaint submitted!")}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{    opacity: 0, y: -8 }}
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
