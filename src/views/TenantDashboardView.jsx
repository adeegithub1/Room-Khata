// src/views/TenantDashboardView.jsx
// ─────────────────────────────────────────────────────────────
//  Tenant Dashboard — real-time onSnapshot on their room doc
//
//  Sections:
//    • Hero header — deep dark gradient, room + rent due card
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
// Design tokens — dark premium theme
// ─────────────────────────────────────────────────────────────
const T = {
  bg:      "#0D0D0D",
  card:    "#161616",
  card2:   "#1C1C1C",
  bdr:     "#2A2A2A",
  brand:   "#FF6B35",
  brand2:  "#F5A623",
  t1:      "#FFFFFF",
  t2:      "#9A9A9A",
  t3:      "#555555",
};

// ─────────────────────────────────────────────────────────────
// Status colours
// ─────────────────────────────────────────────────────────────
const STATUS = {
  paid:    { label: "✓ PAID",    bg: "rgba(34,197,94,.20)",   color: "#86EFAC" },
  partial: { label: "◑ PARTIAL", bg: "rgba(245,158,11,.18)",  color: "#FCD34D" },
  pending: { label: "⏳ PENDING", bg: "rgba(255,102,0,.18)",   color: "#FED7AA" },
  pending_verification: { label: "👀 VERIFYING", bg: "rgba(124,58,237,.20)", color: "#DDD6FE" },
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
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
      variants={V.fade}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* Backdrop */}
      <motion.div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.80)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        variants={V.sheet}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{
          position: "relative", zIndex: 10,
          borderRadius: "22px 22px 0 0",
          padding: "20px 24px 32px",
          overflow: "hidden",
          background: "#111111",
          borderTop: `1px solid ${T.bdr}`,
        }}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 9, background: T.bdr, margin: "0 auto 20px" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h3 style={{ fontSize: 20, fontWeight: 900, color: T.t1, margin: 0 }}>Pay Rent</h3>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#86EFAC", fontFamily: "'JetBrains Mono', monospace" }}>
            {fmt(amount)}
          </span>
        </div>

        {/* Mock QR */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div style={{
            width: 176, height: 176, borderRadius: 20,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "white", boxShadow: "0 4px 24px rgba(0,0,0,.5)",
          }}>
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

        <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: T.t3, marginBottom: 4 }}>
          Scan with any UPI app
        </p>
        <p style={{ textAlign: "center", fontWeight: 900, fontSize: 14, color: T.t1, marginBottom: 20 }}>
          {upiId || "owner@upi"}
        </p>

        <p style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", textAlign: "center", marginBottom: 12, fontSize: 9, color: T.t3 }}>
          Or pay with
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { key: "gpay",    emoji: "🅖", label: "GPay"    },
            { key: "phonepe", emoji: "📱", label: "PhonePe" },
            { key: "paytm",   emoji: "💳", label: "Paytm"   },
          ].map((app) => (
            <button
              key={app.key}
              onClick={() => openUpiApp(app.key)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                padding: "16px 8px", borderRadius: 16,
                background: T.card2, border: `1px solid ${T.bdr}`,
                cursor: "pointer", transition: "all .15s",
              }}
              onPointerDown={e => e.currentTarget.style.transform = "scale(.94)"}
              onPointerUp={e => e.currentTarget.style.transform = "scale(1)"}
            >
              <span style={{ fontSize: 24, marginBottom: 4 }}>{app.emoji}</span>
              <span style={{ color: T.t1, fontSize: 11, fontWeight: 700 }}>{app.label}</span>
            </button>
          ))}
        </div>

        <div style={{
          borderRadius: 16, padding: 12, marginBottom: 16, textAlign: "center",
          background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.18)",
        }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: "#93C5FD" }}>
            <i className="fa-solid fa-circle-info" style={{ marginRight: 4 }} />
            After payment, your landlord will confirm &amp; update your status.
          </p>
        </div>

        <button
          onClick={onClose}
          style={{
            width: "100%", padding: "14px", fontWeight: 700, borderRadius: 16,
            background: T.card2, color: T.t1, border: `1px solid ${T.bdr}`, cursor: "pointer",
            transition: "all .15s",
          }}
          onPointerDown={e => e.currentTarget.style.opacity = "0.7"}
          onPointerUp={e => e.currentTarget.style.opacity = "1"}
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
  { key: "low",    label: "Low",    color: "#86EFAC" },
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
    <motion.div
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
      variants={V.fade} initial="hidden" animate="visible" exit="exit"
    >
      <motion.div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.80)" }} onClick={onClose} />
      <motion.div
        variants={V.sheet} initial="hidden" animate="visible" exit="exit"
        style={{
          position: "relative", zIndex: 10,
          background: T.card, borderRadius: "22px 22px 0 0",
          padding: "20px 24px 32px",
          overflowY: "auto", maxHeight: "88vh",
          border: `1px solid ${T.bdr}`, borderBottom: "none",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 9, background: T.bdr, margin: "0 auto 20px" }} />
        <h3 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4, color: T.t1 }}>Raise Complaint</h3>
        <p style={{ fontSize: 13, marginBottom: 20, color: T.t2 }}>Problem report करें</p>

        {/* Type grid */}
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: T.t3, marginBottom: 8 }}>Issue Type</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 20 }}>
          {COMPLAINT_TYPES.map((c) => (
            <button
              key={c.key}
              onClick={() => setType(c.key)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                padding: "12px 4px", borderRadius: 16,
                background: type === c.key ? "linear-gradient(135deg,#FF6B35,#F5A623)" : T.card2,
                border: `1px solid ${type === c.key ? "transparent" : T.bdr}`,
                cursor: "pointer", transition: "all .15s",
              }}
              onPointerDown={e => e.currentTarget.style.transform = "scale(.92)"}
              onPointerUp={e => e.currentTarget.style.transform = "scale(1)"}
            >
              <span style={{ fontSize: 18, marginBottom: 4 }}>{c.emoji}</span>
              <span style={{ fontWeight: 700, fontSize: 8, color: type === c.key ? "white" : T.t2 }}>
                {c.label}
              </span>
            </button>
          ))}
        </div>

        {/* Priority */}
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: T.t3, marginBottom: 8 }}>Priority</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {PRIORITIES.map((p) => (
            <button
              key={p.key}
              onClick={() => setPriority(p.key)}
              style={{
                flex: 1, padding: "10px", borderRadius: 12, fontWeight: 700, fontSize: 13,
                background: priority === p.key ? p.color + "22" : T.card2,
                color: priority === p.key ? p.color : T.t2,
                border: `1px solid ${priority === p.key ? p.color + "44" : T.bdr}`,
                cursor: "pointer", transition: "all .15s",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Description */}
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: T.t3, marginBottom: 8 }}>Description</p>
        <textarea
          rows={3}
          placeholder="Problem briefly describe करें…"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          style={{
            width: "100%", padding: "13px 14px", borderRadius: 14,
            fontWeight: 500, fontSize: 14, outline: "none", resize: "none",
            transition: "all .2s", marginBottom: 20,
            background: T.card2,
            border: `1px solid ${T.bdr}`,
            fontFamily: "'Poppins', sans-serif",
            color: T.t1,
          }}
          onFocus={(e) => { e.target.style.borderColor = T.brand; e.target.style.background = "#1A1A1A"; }}
          onBlur={(e)  => { e.target.style.borderColor = T.bdr;   e.target.style.background = T.card2; }}
        />

        <button
          onClick={handleSubmit}
          disabled={loading || !desc.trim()}
          style={{
            width: "100%", padding: "15px", color: "white", fontWeight: 900,
            borderRadius: 16, fontSize: 15,
            display: "flex", justifyContent: "center", alignItems: "center", gap: 8,
            background: "linear-gradient(135deg,#FF6B35,#DC2626)",
            boxShadow: "0 8px 24px rgba(255,107,53,0.25)",
            border: "none", cursor: "pointer",
            opacity: loading || !desc.trim() ? 0.4 : 1,
            transition: "all .15s",
          }}
          onPointerDown={e => e.currentTarget.style.transform = "scale(.97)"}
          onPointerUp={e => e.currentTarget.style.transform = "scale(1)"}
        >
          {loading ? (
            <svg style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/>
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
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 0",
        borderBottom: `1px solid ${T.bdr}`,
        opacity: isPaid ? 1 : 0.6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 12, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isPaid ? "rgba(34,197,94,0.15)" : "rgba(255,102,0,0.12)",
        }}>
          <i
            className={isPaid ? "fa-solid fa-check" : "fa-solid fa-clock"}
            style={{ fontSize: 12, color: isPaid ? "#86EFAC" : "#FED7AA" }}
          />
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 13, color: T.t1 }}>
            {record.month || new Date(record.paidDate || record.date || Date.now()).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
          </p>
          <p style={{ fontWeight: 500, fontSize: 10, color: T.t3 }}>
            {isPaid ? "Full Payment" : "Partial / Pending"}
          </p>
        </div>
      </div>
      <p style={{
        fontWeight: 900, fontFamily: "'JetBrains Mono', monospace",
        fontSize: 14, color: isPaid ? "#86EFAC" : "#FCD34D",
      }}>
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
    const uid = authUser?.uid;
    await signOut(auth);
    if (uid) localStorage.removeItem(`rkp_role_${uid}`);
    setUserRole(null);
    navigate("/login");
  };

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", height: "100%",
        background: T.bg,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 12px",
            background: "linear-gradient(135deg,#FF6B35,#F5A623)",
          }}>
            <span style={{ fontSize: 22, color: "white", fontWeight: 900 }}>₹</span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.t3 }}>Loading your room…</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", height: "100%",
        padding: "0 24px", textAlign: "center", background: T.bg,
      }}>
        <div>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
            background: "rgba(255,107,53,.12)", border: "1px solid rgba(255,107,53,.2)",
          }}>
            <i className="fa-solid fa-house" style={{ fontSize: 24, color: T.brand }} />
          </div>
          <p style={{ fontWeight: 900, fontSize: 18, marginBottom: 4, color: T.t1 }}>Room not found</p>
          <p style={{ fontSize: 13, marginBottom: 24, color: T.t2 }}>
            Your landlord needs to link you to a room.
          </p>
          <button
            onClick={handleLogout}
            style={{ fontWeight: 700, fontSize: 13, color: T.brand, background: "none", border: "none", cursor: "pointer" }}
          >
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
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box} ::-webkit-scrollbar{width:0}`}</style>

      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: T.bg }}>

        {/* ── HERO HEADER ── */}
        <motion.div
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.09 } } }}
          initial="hidden"
          animate="visible"
          style={{
            color: "white",
            padding: "max(44px,env(safe-area-inset-top)) 20px 20px",
            position: "relative", flexShrink: 0, overflow: "hidden",
            background: "linear-gradient(160deg,#080808 0%,#111111 50%,#0F0F0F 100%)",
            borderBottom: `1px solid ${T.bdr}`,
          }}
        >
          {/* Ambient blob */}
          <div style={{
            position: "absolute", top: -50, right: -50, width: 200, height: 200,
            borderRadius: "50%", pointerEvents: "none",
            background: "radial-gradient(circle, rgba(255,107,53,0.10) 0%, transparent 70%)",
          }} />

          {/* Brand bar */}
          <motion.div variants={V.fadeUp} custom={0} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 9,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "linear-gradient(135deg,#FF6B35,#F5A623)",
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 10L12 3l9 7"/><path d="M5 10v11a2 2 0 002 2h10a2 2 0 002-2V10"/>
                  </svg>
                </div>
                <span style={{ fontWeight: 900, fontSize: 13, color: "white", letterSpacing: ".02em" }}>
                  ROOMKHATA <span style={{ color: T.brand }}>/</span> <span style={{ color: T.t3 }}>TENANT</span>
                </span>
              </div>
              <p style={{ fontWeight: 700, marginTop: 3, marginLeft: 36, fontSize: 7, letterSpacing: "0.18em", color: T.t3 }}>
                RENT. TRACK. RELAX.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 8px", borderRadius: 8,
                background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.20)",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#86EFAC", display: "inline-block",
                  boxShadow: "0 0 0 3px rgba(134,239,172,.2)",
                }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: "#86EFAC" }}>LIVE</span>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(255,255,255,.06)", border: `1px solid ${T.bdr}`, cursor: "pointer",
                }}
                onPointerDown={e => e.currentTarget.style.transform = "scale(.88)"}
                onPointerUp={e => e.currentTarget.style.transform = "scale(1)"}
              >
                <i className="fa-solid fa-sign-out" style={{ fontSize: 13, color: T.t2 }} />
              </button>
            </div>
          </motion.div>

          {/* Tenant name + room */}
          <motion.div variants={V.fadeUp} custom={0.08} style={{ marginBottom: 18 }}>
            <p style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 4, fontSize: 10, color: T.t3 }}>
              Welcome back,
            </p>
            <h2 style={{ fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1.1, margin: 0, fontSize: "clamp(1.75rem,7vw,2.2rem)", color: T.t1 }}>
              {tenantName || "Tenant"}
            </h2>
            <p style={{ fontWeight: 500, marginTop: 6, fontSize: 13, color: T.t3 }}>
              Room <span style={{ fontWeight: 900, color: T.t2 }}>{roomNo}</span>
            </p>
          </motion.div>

          {/* Due card */}
          <motion.div
            variants={V.fadeUp}
            custom={0.16}
            style={{
              borderRadius: 18, padding: 18, overflow: "hidden", position: "relative",
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${T.bdr}`,
            }}
          >
            {/* Top shine */}
            <div style={{
              position: "absolute", inset: "0 0 auto 0", height: 1,
              background: "linear-gradient(90deg,transparent 10%,rgba(255,255,255,0.10) 50%,transparent 90%)",
            }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <p style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", fontSize: 9, color: T.t3 }}>
                Total Due This Month
              </p>
              <span style={{
                fontWeight: 900, padding: "3px 10px", borderRadius: 8, fontSize: 10,
                background: statusCfg.bg, color: statusCfg.color,
              }}>
                {statusCfg.label}
              </span>
            </div>

            <p style={{
              fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1, marginBottom: 14,
              fontSize: "clamp(2.2rem,9vw,2.8rem)",
              fontFamily: "'JetBrains Mono', monospace",
              color: isPaid ? "#86EFAC" : T.t1,
            }}>
              {fmt(amountDue)}
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <div>
                <p style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 9, color: T.t3 }}>Base Rent</p>
                <p style={{ fontWeight: 700, fontSize: 13, color: T.t2, fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmt(rent)}
                </p>
              </div>
              {(electricityBill || 0) > 0 && (
                <div>
                  <p style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 9, color: T.t3 }}>+ Electricity</p>
                  <p style={{ fontWeight: 700, fontSize: 13, color: "#FCD34D", fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmt(electricityBill)}
                  </p>
                </div>
              )}
              {balanceDue != null && balanceDue < totalDue && balanceDue > 0 && (
                <div style={{ marginLeft: "auto" }}>
                  <p style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 9, color: T.t3 }}>Balance Due</p>
                  <p style={{ fontWeight: 700, fontSize: 13, color: "#F87171", fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmt(balanceDue)}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* ── SCROLLABLE BODY ── */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "16px 16px 24px",
          display: "flex", flexDirection: "column", gap: 12,
          background: T.bg, WebkitOverflowScrolling: "touch",
        }}>

          {/* Action grid */}
          <motion.div
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
            initial="hidden"
            animate="visible"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            {/* Pay Rent */}
            <motion.button
              variants={V.fadeUp}
              custom={0}
              onClick={() => setShowUpi(true)}
              style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                padding: "24px 12px", borderRadius: 20,
                background: "linear-gradient(135deg,#FF6B35,#F5A623)",
                boxShadow: "0 8px 28px rgba(255,107,53,0.30)",
                border: "none", cursor: "pointer",
              }}
              onPointerDown={e => e.currentTarget.style.transform = "scale(.96)"}
              onPointerUp={e => e.currentTarget.style.transform = "scale(1)"}
            >
              <i className="fa-solid fa-qrcode" style={{ fontSize: 26, color: "white", marginBottom: 8 }} />
              <span style={{ fontSize: 14, fontWeight: 900, color: "white" }}>Pay Rent</span>
              <span style={{ fontWeight: 600, marginTop: 3, fontSize: 10, color: "rgba(255,255,255,0.65)" }}>UPI / QR Code</span>
            </motion.button>

            {/* Raise Complaint */}
            <motion.button
              variants={V.fadeUp}
              custom={0.04}
              onClick={() => setShowComplaint(true)}
              style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                padding: "24px 12px", borderRadius: 20,
                background: T.card,
                border: `1px solid ${T.bdr}`,
                cursor: "pointer",
              }}
              onPointerDown={e => e.currentTarget.style.transform = "scale(.96)"}
              onPointerUp={e => e.currentTarget.style.transform = "scale(1)"}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 14, marginBottom: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(239,68,68,.12)",
              }}>
                <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 20, color: "#F87171" }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 900, color: T.t1 }}>Raise Complaint</span>
              <span style={{ fontWeight: 600, marginTop: 3, fontSize: 10, color: T.t3 }}>Report an issue</span>
            </motion.button>
          </motion.div>

          {/* Tenancy details card */}
          <motion.div
            variants={V.fadeUp}
            custom={0.1}
            initial="hidden"
            animate="visible"
            style={{
              borderRadius: 20, padding: 20, overflow: "hidden", position: "relative",
              background: T.card,
              border: `1px solid ${T.bdr}`,
            }}
          >
            <div style={{
              position: "absolute", inset: "0 0 auto 0", height: 1,
              background: `linear-gradient(90deg,transparent 10%,rgba(255,255,255,0.06) 50%,transparent 90%)`,
            }} />
            <p style={{
              fontWeight: 900, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 16,
              fontSize: 10, color: T.t3,
            }}>
              Your Tenancy Details
            </p>
            {[
              { label: "Move-in Date",     value: moveInDate,               color: T.t2 },
              { label: "Security Deposit", value: fmt(securityDeposit),      color: "#86EFAC" },
              { label: "Building",         value: buildingName || "—",       color: T.t2, small: true },
              { label: "Room No.",         value: `Room ${roomNo}`,          color: T.t2 },
            ].map((row) => (
              <div key={row.label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "11px 0",
                borderBottom: `1px solid ${T.bdr}`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: T.t3 }}>{row.label}</span>
                <span style={{
                  fontWeight: 700, textAlign: "right",
                  maxWidth: row.small ? "55%" : undefined,
                  fontSize: 13, color: row.color,
                  fontFamily: row.label === "Security Deposit" ? "'JetBrains Mono', monospace" : "inherit",
                }}>
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
            style={{
              borderRadius: 20, padding: 20, overflow: "hidden", position: "relative",
              background: T.card,
              border: `1px solid ${T.bdr}`,
            }}
          >
            <div style={{
              position: "absolute", inset: "0 0 auto 0", height: 1,
              background: `linear-gradient(90deg,transparent 10%,rgba(255,255,255,0.06) 50%,transparent 90%)`,
            }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <p style={{ fontWeight: 900, textTransform: "uppercase", letterSpacing: ".1em", fontSize: 10, color: T.t3 }}>
                Payment History
              </p>
              <span style={{
                fontWeight: 700, padding: "3px 8px", borderRadius: 8,
                fontSize: 10, background: "rgba(255,107,53,.12)", color: T.brand,
              }}>
                {history.length} records
              </span>
            </div>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: T.t3 }}>
                <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: 28, marginBottom: 8, display: "block" }} />
                <p style={{ fontSize: 13 }}>No payment history yet</p>
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
            style={{
              position: "fixed", bottom: 32, left: 16, right: 16,
              zIndex: 50, display: "flex", justifyContent: "center", pointerEvents: "none",
            }}
          >
            <div style={{
              padding: "12px 20px", borderRadius: 16, fontSize: 13, fontWeight: 700,
              color: "white", boxShadow: "0 8px 24px rgba(0,0,0,.5)",
              background: "linear-gradient(135deg,#059669,#047857)",
            }}>
              {toastMsg}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
