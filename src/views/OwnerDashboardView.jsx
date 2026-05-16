// src/views/OwnerDashboardView.jsx
// ─────────────────────────────────────────────────────────────
//  FIXES applied in this version:
//  1. Duplicate "Add" buttons removed — single "+ Add Building" flow
//     via modal sheet. Per-building "+ Room" button adds a room only.
//  2. Buildings now use onSnapshot (live) so new buildings appear
//     immediately without any page reload.
//  3. Bottom nav is position:fixed relative to the app-container
//     so it stays visible no matter how far the user scrolls.
//  4. "Settings" tab → "You" tab with mini profile hub:
//     Edit Profile · Analytics · Language · Logout inside a sheet.
//  5. New brand colour palette — deep violet-to-indigo header,
//     amber-gold accents, richer gradients throughout.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  motion, AnimatePresence,
  useMotionValue, useTransform, animate,
} from "framer-motion";
import {
  collection, query, where,
  onSnapshot, getDocs, addDoc,
  updateDoc, doc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase/config";
import { useApp } from "../context/AppContext";

// ─────────────────────────────────────────────────────────────
// BRAND TOKENS (single source of truth)
// ─────────────────────────────────────────────────────────────
const B = {
  hdrTop:    "#07050F",          // darkest navy
  hdrMid:    "#130D2E",
  hdrBot:    "#2A1860",
  accent1:   "#C850C0",          // magenta-violet
  accent2:   "#4158D0",          // royal blue
  gold:      "#F5A623",          // warm amber
  goldLight: "#FFD97D",
  saffron:   "#FF6B35",          // orange
  emerald:   "#00C9A7",
  cardBg:    "#FFFFFF",
  cream:     "#F6F4FF",          // very light violet tint
  border:    "#E8E4F8",
};
const GRAD_BRAND   = `linear-gradient(135deg, ${B.saffron}, ${B.gold})`;
const GRAD_VIOLET  = `linear-gradient(135deg, #4158D0, #C850C0)`;
const GRAD_EMERALD = `linear-gradient(135deg, #00C9A7, #00B4D8)`;
const GRAD_DANGER  = `linear-gradient(135deg, #E11D48, #BE123C)`;
const GRAD_HDR     = `linear-gradient(160deg, ${B.hdrTop} 0%, ${B.hdrMid} 35%, ${B.hdrBot} 70%, ${B.hdrMid} 100%)`;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const fmt = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function initials(name) {
  if (!name?.trim()) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return ["Good Night",     "🌙"];
  if (h < 12) return ["Good Morning",   "🌅"];
  if (h < 17) return ["Good Afternoon", "☀️"];
  if (h < 21) return ["Good Evening",   "🌆"];
  return             ["Good Night",     "✨"];
}

function genCode() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "RK-" + Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

// ─────────────────────────────────────────────────────────────
// MOTION VARIANTS
// ─────────────────────────────────────────────────────────────
const E = [0.22, 1, 0.36, 1];

const V = {
  stagger: (s = 0.06) => ({ hidden: {}, visible: { transition: { staggerChildren: s } } }),
  fadeUp:  { hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: E } } },
  scaleUp: { hidden: { opacity: 0, scale: 0.92 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.44, ease: E } } },
  fade:    { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.35 } } },
  sheet:   { hidden: { y: "100%" }, visible: { y: 0, transition: { duration: 0.42, ease: E } }, exit: { y: "100%", transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } } },
};

// ─────────────────────────────────────────────────────────────
// ANIMATED COUNTER
// ─────────────────────────────────────────────────────────────
function AnimCount({ value }) {
  const ref = useRef(null);
  const mv  = useMotionValue(0);
  useEffect(() => {
    const c = animate(mv, value, {
      duration: 1.2, ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current)
          ref.current.textContent = "₹" + Math.round(v).toLocaleString("en-IN");
      },
    });
    return c.stop;
  }, [value]);
  return (
    <span ref={ref} style={{ fontFamily: "'JetBrains Mono',monospace", letterSpacing: "-0.03em" }}>
      ₹0
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="rounded-[18px] p-3 space-y-2" style={{ background: "white", border: `1.5px solid ${B.border}` }}>
      <div className="w-full rounded-xl skeleton" style={{ aspectRatio: "1" }} />
      <div className="h-3 rounded-lg skeleton w-3/4 mx-auto" />
      <div className="h-2.5 rounded-lg skeleton w-1/2 mx-auto" />
      <div className="h-7 rounded-xl skeleton" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TOAST STACK
// ─────────────────────────────────────────────────────────────
function ToastStack({ toasts, dismiss }) {
  return (
    <div className="fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} layout
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: -8,  scale: 0.95 }}
            transition={{ duration: 0.3, ease: E }}
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto px-4 py-3 rounded-2xl text-sm font-bold text-white cursor-pointer shadow-lg"
            style={{ background: t.type === "error" ? GRAD_DANGER : GRAD_EMERALD, maxWidth: 320 }}
          >
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ADD BUILDING SHEET  (single place to create a building+rooms)
// ─────────────────────────────────────────────────────────────
function AddBuildingSheet({ ownerId, onClose, onCreated }) {
  const [name,    setName]    = useState("");
  const [count,   setCount]   = useState("");
  const [start,   setStart]   = useState("");
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    const n = parseInt(count, 10);
    if (!name.trim() || !n || n < 1) { setErr("Name and room count are required."); return; }
    setLoading(true);
    try {
      const bRef = await addDoc(collection(db, "buildings"), {
        ownerId, name: name.trim(), createdAt: new Date(),
      });
      const startNum = parseInt(start, 10) || 1;
      await Promise.all(Array.from({ length: n }, (_, i) =>
        addDoc(collection(db, "rooms"), {
          buildingId: bRef.id, ownerId,
          roomNo: (startNum + i).toString(),
          tenantName: "", rent: 0,
          status: "pending",
          connectionCode: genCode(),
          createdAt: new Date(),
        })
      ));
      onCreated(`✓ ${name.trim()} added with ${n} rooms!`);
      onClose();
    } catch (e) { setErr(e.message || "Error creating building."); }
    finally { setLoading(false); }
  };

  return (
    <BottomSheet onClose={onClose} title="Add Building 🏠">
      <form onSubmit={handleSubmit} className="space-y-4">
        <SheetInput label="Building Name" value={name} onChange={setName} placeholder="e.g. Sharma Niwas" required />
        <SheetInput label="Number of Rooms" type="number" value={count} onChange={setCount} placeholder="e.g. 6" min="1" max="50" required />
        <SheetInput label="Starting Room No. (optional)" value={start} onChange={setStart} placeholder="e.g. 101 → 101, 102…" />
        {err && <ErrBanner msg={err} />}
        <SheetCTA loading={loading} label="Create Building" grad={GRAD_BRAND} />
      </form>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────
// ADD ROOM SHEET  (adds one room to an existing building)
// ─────────────────────────────────────────────────────────────
function AddRoomSheet({ buildingId, ownerId, onClose, onCreated }) {
  const [roomNo,  setRoomNo]  = useState("");
  const [rent,    setRent]    = useState("");
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roomNo.trim()) { setErr("Room number is required."); return; }
    setLoading(true);
    try {
      await addDoc(collection(db, "rooms"), {
        buildingId, ownerId,
        roomNo: roomNo.trim(),
        rent: parseInt(rent, 10) || 0,
        tenantName: "", status: "pending",
        connectionCode: genCode(),
        createdAt: new Date(),
      });
      onCreated(`✓ Room ${roomNo.trim()} added!`);
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <BottomSheet onClose={onClose} title="Add Room">
      <form onSubmit={handleSubmit} className="space-y-4">
        <SheetInput label="Room Number" value={roomNo} onChange={setRoomNo} placeholder="e.g. 201" required />
        <SheetInput label="Monthly Rent (₹)" type="number" value={rent} onChange={setRent} placeholder="e.g. 8000" min="0" />
        {err && <ErrBanner msg={err} />}
        <SheetCTA loading={loading} label="Add Room" grad={GRAD_VIOLET} />
      </form>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────
// "YOU" PROFILE HUB SHEET
// ─────────────────────────────────────────────────────────────
function YouSheet({ ownerName, authUser, onClose, onNav }) {
  const { language, setLanguage } = useApp();
  const initial = ownerName ? ownerName.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  const handleLogout = async () => {
    await signOut(auth);
    onClose();
    onNav("logout");
  };

  const Row = ({ icon, iconGrad, label, sub, right, onClick, danger }) => (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 px-1 py-3 active:scale-[0.98] transition-all"
      style={{ background: "none", border: "none", borderBottom: `1px solid ${B.border}`, cursor: "pointer" }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: iconGrad }}>
        <i className={`${icon} text-sm text-white`} />
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="font-bold text-sm truncate" style={{ color: danger ? "#E11D48" : "var(--text-primary)" }}>{label}</p>
        {sub && <p className="font-medium truncate" style={{ fontSize: 11, color: "var(--text-muted)" }}>{sub}</p>}
      </div>
      {right || <i className="fa-solid fa-chevron-right text-sm shrink-0" style={{ color: "#CBD5E1" }} />}
    </button>
  );

  return (
    <BottomSheet onClose={onClose} title="">
      {/* Profile card */}
      <div className="flex items-center gap-4 p-4 rounded-2xl mb-5"
        style={{ background: B.cream, border: `1.5px solid ${B.border}` }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-white shrink-0"
          style={{ background: GRAD_BRAND, fontSize: 18 }}>
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-base truncate" style={{ color: "var(--text-primary)" }}>
            {ownerName || "Owner"}
          </p>
          <p className="font-medium truncate" style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {authUser?.email || ""}
          </p>
        </div>
        <button onClick={() => { onClose(); onNav("profile"); }}
          className="px-3 py-1.5 rounded-xl font-bold text-xs active:scale-90 transition-all"
          style={{ background: B.cream, color: B.saffron, border: `1.5px solid ${B.border}`, cursor: "pointer" }}>
          Edit
        </button>
      </div>

      {/* Action rows */}
      <Row icon="fa-solid fa-chart-line"  iconGrad={GRAD_VIOLET}  label="Analytics"     sub="Revenue trends & occupancy" onClick={() => { onClose(); onNav("analytics"); }} />
      <Row icon="fa-solid fa-user-pen"    iconGrad={GRAD_BRAND}   label="Edit Profile"  sub="Name, address, UPI ID"      onClick={() => { onClose(); onNav("profile"); }} />
      <Row icon="fa-solid fa-cloud-arrow-down" iconGrad={GRAD_EMERALD} label="Backup Data" sub="Download JSON snapshot"  onClick={() => { onClose(); onNav("backup"); }} />
      <Row
        icon="fa-solid fa-language"
        iconGrad={GRAD_VIOLET}
        label="Language"
        sub={language === "hi" ? "हिंदी चालू है" : "English is on"}
        right={
          <div
            onClick={(ev) => { ev.stopPropagation(); setLanguage(language === "hi" ? "en" : "hi"); }}
            className="flex items-center rounded-full transition-all cursor-pointer"
            style={{ width: 56, height: 26, background: language === "hi" ? GRAD_BRAND : B.border, padding: 3, position: "relative" }}
          >
            <div className="absolute rounded-full flex items-center justify-center text-white font-black"
              style={{
                width: 20, height: 20, fontSize: 7,
                background: "white",
                color: language === "hi" ? B.saffron : "#94A3B8",
                left: language === "hi" ? "calc(100% - 23px)" : 3,
                transition: "left 0.28s cubic-bezier(0.34,1.56,0.64,1)",
              }}>
              {language === "hi" ? "HI" : "EN"}
            </div>
          </div>
        }
      />

      <div className="mt-2">
        <Row icon="fa-solid fa-sign-out" iconGrad={GRAD_DANGER} label="Logout" sub="Sign out of your account" onClick={handleLogout} danger />
      </div>

      <p className="text-center font-medium mt-4" style={{ fontSize: 11, color: "#CBD5E1" }}>
        Room Khata Pro · v2.0 🏠
      </p>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────
// SHARED SHEET PRIMITIVES
// ─────────────────────────────────────────────────────────────
function BottomSheet({ onClose, title, children }) {
  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col justify-end"
      variants={V.fade} initial="hidden" animate="visible" exit="exit">
      <motion.div className="absolute inset-0" style={{ background: "rgba(7,5,15,0.65)" }} onClick={onClose} />
      <motion.div variants={V.sheet} initial="hidden" animate="visible" exit="exit"
        className="relative z-10 bg-white rounded-t-3xl px-6 pt-5 pb-10 overflow-y-auto"
        style={{ maxHeight: "90vh", border: `1.5px solid ${B.border}` }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: B.border }} />
        {title && <h3 className="text-xl font-black mb-5" style={{ color: "var(--indigo)" }}>{title}</h3>}
        {children}
      </motion.div>
    </motion.div>
  );
}

function SheetInput({ label, value, onChange, placeholder, type = "text", required, min, max }) {
  const [f, setF] = useState(false);
  return (
    <div>
      <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--indigo)" }}>
        {label}{required ? " *" : ""}
      </label>
      <input
        type={type} value={value} placeholder={placeholder}
        required={required} min={min} max={max}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        className="w-full px-4 py-3.5 rounded-2xl font-medium text-sm outline-none transition-all"
        style={{
          background: f ? "#fff" : "var(--surface2)",
          border: `1.5px solid ${f ? B.saffron : B.border}`,
          boxShadow: f ? `0 0 0 3px rgba(255,107,53,0.10)` : "none",
          fontFamily: "'Poppins',sans-serif", color: "var(--text-primary)",
        }}
      />
    </div>
  );
}

function SheetCTA({ loading, label, grad }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full py-4 text-white font-black rounded-2xl text-base flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-40"
      style={{ background: grad, boxShadow: "0 6px 20px rgba(255,107,53,0.28)", border: "none", cursor: "pointer" }}>
      {loading
        ? <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="3"/><path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
        : <><i className="fa-solid fa-check" /> {label}</>}
    </button>
  );
}

function ErrBanner({ msg }) {
  return (
    <div className="rounded-2xl px-4 py-3 text-sm font-semibold flex items-start gap-2"
      style={{ background: "#FEE2E2", color: "#991B1B", border: "1.5px solid #FECACA" }}>
      <i className="fa-solid fa-circle-exclamation mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NOTIFICATION BELL + DROPDOWN
// ─────────────────────────────────────────────────────────────
function NotificationBell({ authUid, rooms }) {
  const [open,    setOpen]    = useState(false);
  const [notifs,  setNotifs]  = useState([]);
  const bellRef               = useRef(null);
  const dropRef               = useRef(null);

  // ── Build notifications from live rooms data ──────────────
  useEffect(() => {
    const list = [];

    // Payments pending verification
    rooms
      .filter((r) => r.status === "pending_verification" && r.tenantName?.trim())
      .forEach((r) =>
        list.push({
          id:    `pv-${r.id}`,
          icon:  "fa-solid fa-eye",
          color: "#C850C0",
          bg:    "rgba(200,80,192,0.12)",
          title: `Payment verify करें`,
          sub:   `Room ${r.roomNo} — ${r.tenantName}`,
          time:  "Now",
        })
      );

    // Pending rooms (overdue reminder)
    rooms
      .filter((r) => r.status === "pending" && r.tenantName?.trim())
      .slice(0, 3)                         // max 3 pending alerts
      .forEach((r) =>
        list.push({
          id:    `pd-${r.id}`,
          icon:  "fa-solid fa-clock",
          color: "#FB7185",
          bg:    "rgba(251,113,133,0.12)",
          title: `Rent due`,
          sub:   `Room ${r.roomNo} — ${r.tenantName} · ${r.rent ? "₹" + r.rent.toLocaleString("en-IN") : ""}`,
          time:  "This month",
        })
      );

    setNotifs(list);
  }, [rooms]);

  const unreadCount = notifs.length;

  // ── Close on outside click ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        bellRef.current && !bellRef.current.contains(e.target) &&
        dropRef.current  && !dropRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  return (
    <div className="relative" style={{ zIndex: 40 }}>
      {/* Bell button */}
      <motion.button
        ref={bellRef}
        onClick={() => setOpen((p) => !p)}
        whileTap={{ scale: 0.88 }}
        className="relative flex items-center justify-center rounded-full transition-all"
        style={{
          width: 40, height: 40,
          background: open ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.07)",
          border: `1px solid ${open ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.13)"}`,
          cursor: "pointer",
          outline: "none",
        }}
      >
        <motion.i
          className="fa-regular fa-bell text-base"
          style={{ color: "rgba(255,255,255,0.85)" }}
          animate={unreadCount > 0 && !open ? { rotate: [0, -18, 18, -12, 12, 0] } : {}}
          transition={{ duration: 0.55, repeat: Infinity, repeatDelay: 4 }}
        />
        {/* Red dot — only when there are notifications */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="dot"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{   scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="absolute flex items-center justify-center rounded-full font-black text-white"
              style={{
                top: -3, right: -3,
                minWidth: unreadCount > 9 ? 18 : 16,
                height: unreadCount > 9 ? 18 : 16,
                fontSize: 8,
                background: "#E11D48",
                boxShadow: "0 0 0 2px rgba(7,5,15,0.6)",
                padding: "0 3px",
              }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={dropRef}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{   opacity: 0, y: -8,  scale: 0.96 }}
            transition={{ duration: 0.22, ease: E }}
            className="absolute overflow-hidden"
            style={{
              top: 48, right: 0,
              width: 280,
              background: "rgba(15,10,30,0.92)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 20,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-bell text-xs" style={{ color: B.gold }} />
                <span className="font-black text-xs tracking-wide" style={{ color: "rgba(255,255,255,0.85)" }}>
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md font-black text-white"
                    style={{ fontSize: 9, background: "#E11D48" }}>
                    {unreadCount}
                  </span>
                )}
              </div>
              <button onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {/* Notification rows */}
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {notifs.length === 0 ? (
                <div className="text-center py-8">
                  <i className="fa-regular fa-bell-slash text-2xl mb-2 block" style={{ color: "rgba(255,255,255,0.2)" }} />
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>All caught up! ✨</p>
                </div>
              ) : (
                notifs.map((n, i) => (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.2 }}
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer"
                    style={{
                      borderBottom: i < notifs.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <div className="flex items-center justify-center rounded-xl shrink-0"
                      style={{ width: 32, height: 32, background: n.bg, marginTop: 2 }}>
                      <i className={n.icon} style={{ fontSize: 12, color: n.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate" style={{ fontSize: 12, color: "rgba(255,255,255,0.88)" }}>
                        {n.title}
                      </p>
                      <p className="truncate font-medium" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                        {n.sub}
                      </p>
                      <p className="font-semibold mt-0.5" style={{ fontSize: 10, color: "rgba(255,255,255,0.28)" }}>
                        {n.time}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Footer */}
            {notifs.length > 0 && (
              <div className="px-4 py-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <button onClick={() => setOpen(false)}
                  className="w-full text-center font-bold transition-all"
                  style={{ fontSize: 11, color: B.gold, background: "none", border: "none", cursor: "pointer" }}>
                  Mark all as read
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FINANCE HEADER  — sticky, collapses smoothly on scroll
//
// scroll = 0     → full expanded mode  (greeting + widget visible)
// scroll > 50px  → collapsed mini bar  (name + mini stats inline)
//
// scrollY is passed in as a MotionValue from the parent's
// scroll container so we can drive transforms reactively.
// ─────────────────────────────────────────────────────────────
function FinanceHeader({ ownerName, rooms, loading, scrollY, notifications }) {
  const revenue = useMemo(() => rooms.reduce((s, r) => s + (r.amountPaid || 0), 0), [rooms]);
  const pending = useMemo(() =>
    rooms.filter((r) => ["pending","partial"].includes(r.status) && r.tenantName?.trim())
         .reduce((s, r) => s + (r.balanceDue || r.rent || 0), 0), [rooms]);
  const expected = useMemo(() => rooms.filter((r) => r.tenantName?.trim()).reduce((s, r) => s + (r.rent || 0), 0), [rooms]);
  const pct = expected > 0 ? Math.round((revenue / expected) * 100) : 0;
  const [greet, emoji] = greeting();

  // ── Scroll-driven transforms ──────────────────────────────
  // The expanded section (greeting + widget) fades + slides up as user scrolls.
  // The collapsed mini-bar fades in from the top.
  const COLLAPSE_START = 30;   // px — begin collapsing
  const COLLAPSE_END   = 100;  // px — fully collapsed

  const expandedOpacity = useTransform(scrollY, [COLLAPSE_START, COLLAPSE_END], [1, 0]);
  const expandedY       = useTransform(scrollY, [COLLAPSE_START, COLLAPSE_END], [0, -20]);
  const expandedScale   = useTransform(scrollY, [COLLAPSE_START, COLLAPSE_END], [1, 0.96]);

  const miniOpacity     = useTransform(scrollY, [COLLAPSE_START + 10, COLLAPSE_END], [0, 1]);
  const miniY           = useTransform(scrollY, [COLLAPSE_START + 10, COLLAPSE_END], [8, 0]);

  // Whether fully collapsed (for pointer-events etc.)
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const unsub = scrollY.on("change", (v) => setCollapsed(v > COLLAPSE_END - 10));
    return unsub;
  }, [scrollY]);

  return (
    <header
      className="relative overflow-hidden shrink-0 z-20"
      style={{ background: GRAD_HDR, paddingTop: "max(44px,env(safe-area-inset-top))" }}
    >
      {/* Ambient orbs */}
      {[
        { top: -70, right: -50, w: 220, color: "rgba(193,80,192,0.22)" },
        { bottom: -40, left: -30, w: 180, color: "rgba(65,88,208,0.20)" },
        { top: "30%", right: "20%", w: 120, color: "rgba(245,166,35,0.12)" },
      ].map((o, i) => (
        <div key={i} className="absolute pointer-events-none" style={{
          top: o.top, bottom: o.bottom, left: o.left, right: o.right,
          width: o.w, height: o.w, borderRadius: "50%",
          background: `radial-gradient(circle, ${o.color} 0%, transparent 70%)`,
        }} />
      ))}

      {/* Shimmer accent line */}
      <motion.div
        className="absolute inset-x-0 top-0 h-0.5 pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${B.gold}, ${B.accent1}, ${B.gold}, transparent)` }}
        animate={{ backgroundPosition: ["0% 0%", "200% 0%"] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />

      <div className="relative z-10 px-5 pb-5">

        {/* ── ALWAYS-VISIBLE TOP BAR ── */}
        <div className="flex justify-between items-center mb-4">

          {/* Brand pill — morphs to mini name when collapsed */}
          <div className="relative flex items-center" style={{ height: 32 }}>
            {/* Expanded brand */}
            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-2xl pointer-events-none"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.11)",
                opacity: expandedOpacity,
                position: "absolute",
                left: 0,
                whiteSpace: "nowrap",
              }}
            >
              <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: GRAD_BRAND }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 10L12 3l9 7"/><path d="M5 10v11a2 2 0 002 2h10a2 2 0 002-2V10"/>
                </svg>
              </div>
              <span className="font-black whitespace-nowrap" style={{ fontSize: 10, color: B.gold, letterSpacing: ".04em" }}>
                RoomKhata&nbsp;<span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>PRO</span>
              </span>
            </motion.div>

            {/* Collapsed mini name */}
            <motion.div style={{ opacity: miniOpacity, y: miniY }}
              className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0" style={{ background: GRAD_BRAND }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 10L12 3l9 7"/><path d="M5 10v11a2 2 0 002 2h10a2 2 0 002-2V10"/>
                </svg>
              </div>
              <div>
                <p className="font-black leading-none" style={{ fontSize: 15, color: "#fff", letterSpacing: "-0.02em" }}>
                  {ownerName?.split(" ")[0] || "Dashboard"}
                </p>
                <p className="font-semibold leading-none mt-0.5" style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", letterSpacing: "0.04em" }}>
                  ₹{Math.round(revenue).toLocaleString("en-IN")} collected
                </p>
              </div>
            </motion.div>
          </div>

          {/* Mini stats chips (appear when collapsed) + Bell */}
          <div className="flex items-center gap-2">
            <motion.div style={{ opacity: miniOpacity, y: miniY }} className="flex items-center gap-1.5">
              <div className="px-2.5 py-1 rounded-xl flex items-center gap-1"
                style={{ background: "rgba(245,166,35,0.18)", border: "1px solid rgba(245,166,35,0.22)" }}>
                <i className="fa-solid fa-arrow-trend-up" style={{ fontSize: 8, color: B.gold }} />
                <span className="font-black" style={{ fontSize: 10, color: B.gold, fontFamily: "'JetBrains Mono',monospace" }}>
                  {fmt(revenue)}
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-xl flex items-center gap-1"
                style={{ background: "rgba(251,113,133,0.18)", border: "1px solid rgba(251,113,133,0.22)" }}>
                <i className="fa-solid fa-clock" style={{ fontSize: 8, color: "#FB7185" }} />
                <span className="font-black" style={{ fontSize: 10, color: "#FB7185", fontFamily: "'JetBrains Mono',monospace" }}>
                  {fmt(pending)}
                </span>
              </div>
            </motion.div>

            {/* Notification bell (always visible) */}
            <NotificationBell rooms={rooms} />
          </div>
        </div>

        {/* ── EXPANDABLE SECTION (greeting + widget) ── */}
        <motion.div
          style={{
            opacity: expandedOpacity,
            y: expandedY,
            scale: expandedScale,
            pointerEvents: collapsed ? "none" : "auto",
          }}
        >
          {/* Greeting */}
          <motion.div variants={V.fadeUp} initial="hidden" animate="visible" className="mb-5">
            <p className="font-bold uppercase mb-1"
              style={{ fontSize: 10, letterSpacing: "0.15em", color: "rgba(255,255,255,0.42)" }}>
              {greet} {emoji}
            </p>
            <h2 className="font-black leading-none"
              style={{ fontSize: "clamp(1.8rem,8vw,2.3rem)", letterSpacing: "-0.03em", color: "#fff", fontFamily: "'Poppins',sans-serif" }}>
              {ownerName || "Dashboard"}
            </h2>
          </motion.div>

          {/* Finance widget */}
          <motion.div variants={V.scaleUp} initial="hidden" animate="visible"
            className="overflow-hidden relative rounded-[22px]"
            style={{ background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.11)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
            <div className="absolute inset-x-0 top-0 h-px pointer-events-none"
              style={{ background: "linear-gradient(90deg,transparent 5%,rgba(255,255,255,0.20) 50%,transparent 95%)" }} />

            <div className="flex">
              {/* Revenue col */}
              <div className="flex-1 px-5 pt-5 pb-4" style={{ borderRight: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <div className="flex items-center justify-center rounded-md" style={{ width: 16, height: 16, background: "rgba(245,166,35,0.22)" }}>
                    <i className="fa-solid fa-arrow-trend-up" style={{ fontSize: 7, color: B.gold }} />
                  </div>
                  <span className="font-bold uppercase tracking-widest" style={{ fontSize: 9, color: "rgba(255,255,255,0.40)" }}>Revenue</span>
                </div>
                <div className="font-bold leading-none mb-2" style={{ fontSize: "clamp(1.4rem,5.5vw,1.75rem)", color: B.gold }}>
                  {loading ? <div className="h-7 w-28 rounded-lg skeleton" /> : <AnimCount value={revenue} />}
                </div>
                <p className="font-semibold" style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", letterSpacing: "0.04em" }}>This month</p>
              </div>
              {/* Pending col */}
              <div className="flex-1 px-5 pt-5 pb-4">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <div className="flex items-center justify-center rounded-md" style={{ width: 16, height: 16, background: "rgba(225,29,72,0.18)" }}>
                    <i className="fa-solid fa-clock" style={{ fontSize: 7, color: "#FB7185" }} />
                  </div>
                  <span className="font-bold uppercase tracking-widest" style={{ fontSize: 9, color: "rgba(255,255,255,0.40)" }}>Pending</span>
                </div>
                <div className="font-bold leading-none mb-2" style={{ fontSize: "clamp(1.4rem,5.5vw,1.75rem)", color: "#FB7185" }}>
                  {loading ? <div className="h-7 w-28 rounded-lg skeleton" /> : <AnimCount value={pending} />}
                </div>
                <p className="font-semibold" style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", letterSpacing: "0.04em" }}>Urgent</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="px-5 pb-4">
              <div className="mb-3" style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold" style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em" }}>Collection progress</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.6)", fontFamily: "'JetBrains Mono',monospace" }}>{pct}%</span>
              </div>
              <div className="overflow-hidden" style={{ height: 3, borderRadius: 99, background: "rgba(255,255,255,0.07)" }}>
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                  transition={{ duration: 1.0, delay: 0.55, ease: [0.4,0,0.2,1] }}
                  style={{ height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${B.saffron}, ${B.gold})` }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>

      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// QUICK ACTIONS  (no "Add" here — moved to header row)
// ─────────────────────────────────────────────────────────────
const TILES = [
  { icon: "fa-solid fa-chart-line", label: "Analytics", grad: GRAD_VIOLET,  accent: "#C850C0" },
  { icon: "fa-solid fa-receipt",    label: "Expenses",  grad: GRAD_DANGER,  accent: "#E11D48" },
  { icon: "fa-solid fa-file-pdf",   label: "Report",    grad: GRAD_EMERALD, accent: "#00C9A7" },
  { icon: "fa-brands fa-whatsapp",  label: "Remind",    grad: "linear-gradient(135deg,#22C55E,#16A34A)", accent: "#22C55E" },
];

function QuickActions() {
  return (
    <div className="mb-6">
      <motion.div variants={V.stagger(0.06)} initial="hidden" animate="visible"
        className="grid grid-cols-4 gap-2.5">
        {TILES.map((t) => (
          <motion.button key={t.label} variants={V.scaleUp} whileTap={{ scale: 0.88 }}
            className="flex flex-col items-center py-3.5 px-1 cursor-pointer"
            style={{ background: "white", border: `1.5px solid ${B.border}`, borderRadius: 18, boxShadow: "0 2px 8px rgba(30,27,75,0.06)" }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ background: t.grad }}>
              <i className={`${t.icon} text-white text-sm`} />
            </div>
            <span className="font-bold" style={{ fontSize: 10, color: t.accent }}>{t.label}</span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STATUS CONFIG
// ─────────────────────────────────────────────────────────────
const SC = {
  paid:                 { label: "✓ Paid",    border: "#BBF7D0", badge: ["#DCFCE7","#15803D"], btn: GRAD_EMERALD, btnL: "⏳ Undo",     av: GRAD_VIOLET },
  partial:              { label: "◑ Partial", border: "#BFDBFE", badge: ["#DBEAFE","#1D4ED8"], btn: GRAD_EMERALD, btnL: "₹ Receive", av: GRAD_VIOLET },
  pending_verification: { label: "👀 Verify", border: "#DDD6FE", badge: ["#F3E8FF","#7C3AED"], btn: GRAD_VIOLET,  btnL: "✓ Verify",  av: GRAD_VIOLET },
  pending:              { label: "⏳ Pending", border: "#FED7AA", badge: ["#FEF3C7","#B45309"], btn: GRAD_EMERALD, btnL: "₹ Receive", av: GRAD_VIOLET },
  vacant:               { label: "Vacant",    border: B.border,  badge: ["#F1F5F9","#64748B"], av: "linear-gradient(135deg,#CBD5E1,#94A3B8)" },
};

// ─────────────────────────────────────────────────────────────
// ROOM CARD
// ─────────────────────────────────────────────────────────────
function RoomCard({ room, onToggle }) {
  const { roomNo, tenantName, rent = 0, electricityBill = 0,
          status = "pending", balanceDue = 0, securityDeposit = 0, paymentApp } = room;

  const isVacant = !tenantName?.trim();
  const sk = isVacant ? "vacant" : (status || "pending");
  const cfg = SC[sk] || SC.pending;
  const total = rent + (electricityBill || 0);

  return (
    <motion.div variants={V.fadeUp} layout
      className="relative overflow-hidden flex flex-col"
      style={{ background: "white", border: `1.5px solid ${cfg.border}`, borderRadius: 18, padding: "10px 10px 12px", boxShadow: "0 2px 10px rgba(30,27,75,0.06)" }}>

      {/* Edit */}
      <button className="absolute top-2 right-2 flex items-center justify-center rounded-lg active:scale-90 transition-all z-10"
        style={{ width: 22, height: 22, background: B.cream, border: "none", cursor: "pointer" }}>
        <i className="fa-solid fa-pencil" style={{ fontSize: 7, color: "var(--text-secondary)" }} />
      </button>

      {/* Avatar */}
      <div className="w-full flex items-center justify-center font-black text-white mb-2.5"
        style={{ aspectRatio: "1", borderRadius: 12, background: cfg.av, fontSize: isVacant ? 20 : 16 }}>
        {isVacant ? <i className="fa-solid fa-door-open" style={{ fontSize: 18, opacity: 0.5 }} /> : initials(tenantName)}
      </div>

      <p className="text-center font-black text-sm mb-0.5" style={{ color: "var(--text-primary)" }}>Room {roomNo}</p>
      <p className="text-center font-semibold truncate mb-2" style={{ fontSize: 11, color: "var(--text-muted)" }}>
        {isVacant ? "Vacant" : tenantName}
      </p>

      {securityDeposit > 0 && (
        <div className="text-center mb-1">
          <span className="font-bold rounded-md px-1.5 py-0.5" style={{ fontSize: 9, background: "#F3E8FF", color: "#7C3AED" }}>🔒 {fmt(securityDeposit)}</span>
        </div>
      )}
      {(electricityBill || 0) > 0 && (
        <div className="text-center mb-1">
          <span className="font-bold rounded-md px-1.5 py-0.5" style={{ fontSize: 9, background: "#FEFCE8", color: "#CA8A04" }}>⚡ +{fmt(electricityBill)}</span>
        </div>
      )}

      <div className="text-center py-1.5 mb-1.5" style={{ borderBottom: `1.5px solid ${B.border}` }}>
        <p style={{ fontSize: 10, color: "var(--text-muted)" }}>Rent{electricityBill > 0 ? "+Elec" : ""}</p>
        <p className="font-black text-sm" style={{ color: "var(--text-primary)" }}>{fmt(total)}</p>
      </div>

      {status === "partial" && balanceDue > 0 && (
        <div className="text-center mb-1">
          <span className="font-bold rounded-md px-1.5 py-0.5" style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B" }}>Due {fmt(balanceDue)}</span>
        </div>
      )}
      {status === "pending_verification" && paymentApp && (
        <div className="text-center mb-1">
          <span className="font-bold rounded-md px-1.5 py-0.5" style={{ fontSize: 9, background: "#F3E8FF", color: "#7C3AED" }}>via {paymentApp}</span>
        </div>
      )}

      <div className="text-center mb-2 mt-auto">
        <span className="font-bold rounded-lg px-2 py-0.5 inline-block" style={{ fontSize: 10, background: cfg.badge[0], color: cfg.badge[1] }}>
          {cfg.label}
        </span>
      </div>

      {/* Buttons */}
      {!isVacant ? (
        <div className="flex flex-col gap-1">
          {status === "pending_verification" ? (
            <>
              <button className="w-full py-1.5 text-white font-black rounded-xl active:scale-95 transition-all"
                style={{ fontSize: 10, background: cfg.btn, border: "none", cursor: "pointer" }}>✓ Verify</button>
              <button className="w-full py-1.5 font-bold rounded-xl active:scale-95 transition-all"
                style={{ fontSize: 10, background: "var(--surface2)", color: "var(--text-secondary)", border: "none", cursor: "pointer" }}>✗ Reject</button>
            </>
          ) : (
            <>
              <button onClick={() => onToggle(room.id, status)}
                className="w-full py-1.5 text-white font-black rounded-xl active:scale-95 transition-all"
                style={{ fontSize: 10, background: cfg.btn, border: "none", cursor: "pointer" }}>
                {cfg.btnL}
              </button>
              <button className="w-full py-1.5 font-bold rounded-xl active:scale-95 transition-all"
                style={{ fontSize: 10, background: "#FEFCE8", color: "#CA8A04", border: "1.5px solid #FEF08A", cursor: "pointer" }}>
                ⚡ Bill
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex gap-1">
          <button className="flex-1 py-1.5 font-bold rounded-xl active:scale-95 transition-all"
            style={{ fontSize: 10, background: B.cream, color: "var(--indigo)", border: "none", cursor: "pointer" }}>
            + Assign
          </button>
          <button className="flex-1 py-1.5 text-white font-black rounded-xl active:scale-95 transition-all"
            style={{ fontSize: 10, background: GRAD_BRAND, border: "none", cursor: "pointer" }}>
            🔗 Invite
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// BUILDING GROUP  — "+ Room" is the ONLY add button inside a group
// ─────────────────────────────────────────────────────────────
function BuildingGroup({ buildingId, buildingName, rooms, onToggle, onAddRoom }) {
  const occupied = rooms.filter((r) => r.tenantName?.trim()).length;
  const vacant   = rooms.length - occupied;

  return (
    <div className="mb-7">
      {/* Header */}
      <div className="p-4 mb-3 rounded-[20px]"
        style={{ background: "white", border: `1.5px solid ${B.border}`, boxShadow: "0 2px 8px rgba(30,27,75,0.07)" }}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: GRAD_VIOLET }}>
              <i className="fa-solid fa-building text-white text-base" />
            </div>
            <div className="min-w-0">
              <p className="font-bold uppercase tracking-wider" style={{ fontSize: 10, color: "var(--text-muted)" }}>Building</p>
              <h3 className="text-lg font-black truncate" style={{ color: "var(--text-primary)" }}>{buildingName}</h3>
            </div>
          </div>
          {buildingId !== "no-building" && (
            <button
              onClick={() => onAddRoom(buildingId)}
              className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-white font-black active:scale-90 transition-all shrink-0"
              style={{ fontSize: 10, background: GRAD_BRAND, boxShadow: "0 3px 10px rgba(255,107,53,0.28)", border: "none", cursor: "pointer" }}>
              <i className="fa-solid fa-plus" style={{ fontSize: 8 }} /> Room
            </button>
          )}
        </div>

        <div className="flex gap-4 mt-3 pt-3" style={{ borderTop: `1.5px solid ${B.border}` }}>
          {[
            { icon: "fa-solid fa-door-closed", bg: "#F0FDF4", ic: "#16A34A", label: "Occupied", val: occupied },
            { icon: "fa-solid fa-door-open",   bg: "#FFF7ED", ic: B.saffron, label: "Vacant",   val: vacant },
            { icon: "fa-solid fa-layer-group", bg: B.cream,   ic: "#4158D0", label: "Total",    val: rooms.length },
          ].map((s) => (
            <div key={s.label} className={`flex items-center gap-1.5 ${s.label === "Total" ? "ml-auto" : ""}`}>
              <div className="flex items-center justify-center rounded-lg" style={{ width: 18, height: 18, background: s.bg }}>
                <i className={s.icon} style={{ fontSize: 7, color: s.ic }} />
              </div>
              <div>
                <p className="font-bold uppercase tracking-wider" style={{ fontSize: 9, color: "var(--text-muted)" }}>{s.label}</p>
                <p className="font-black text-sm" style={{ color: "var(--text-primary)" }}>{s.val}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Room cards */}
      <motion.div variants={V.stagger(0.04)} initial="hidden" animate="visible"
        className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
        {rooms.map((r) => <RoomCard key={r.id} room={r} onToggle={onToggle} />)}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BOTTOM NAV  — fixed, always visible
// ─────────────────────────────────────────────────────────────
const NAV = [
  { key: "home",     icon: "fa-solid fa-house",      label: "Home"     },
  { key: "tenants",  icon: "fa-solid fa-users",      label: "Tenants"  },
  { key: "payments", icon: "fa-solid fa-wallet",     label: "Payments" },
  { key: "you",      icon: "fa-solid fa-circle-user",label: "You"      },  // ← was Settings
];

function BottomNav({ active, onNav }) {
  return (
    <nav
      style={{
        position: "absolute",          // within the app-container which is the stacking context
        bottom: 0, left: 0, right: 0,
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: `1.5px solid ${B.border}`,
        boxShadow: "0 -4px 24px rgba(30,27,75,0.08)",
        paddingTop: 12,
        paddingBottom: "max(18px, env(safe-area-inset-bottom))",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "flex-end",
        paddingLeft: 16,
        paddingRight: 16,
        zIndex: 30,                    // above scroll content
      }}
    >
      {NAV.map((item) => {
        const isActive = active === item.key;
        return (
          <button key={item.key} onClick={() => onNav(item.key)}
            className="flex flex-col items-center gap-1 flex-1 text-center"
            style={{
              color: isActive ? B.saffron : "#9CA3AF",
              transform: isActive ? "scale(1.14) translateY(-2px)" : "scale(1)",
              transition: "all 0.28s cubic-bezier(0.34,1.56,0.64,1)",
              border: "none", background: "none", cursor: "pointer",
            }}>
            <i className={`${item.icon} text-xl`} />
            <span className="font-black" style={{ fontSize: 9 }}>{item.label}</span>
            <span style={{
              display: "block", width: 4, height: 4, borderRadius: "50%",
              background: B.saffron, opacity: isActive ? 1 : 0, transition: "opacity 0.2s",
            }} />
          </button>
        );
      })}
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────
// FILTER CHIPS
// ─────────────────────────────────────────────────────────────
function FilterChips({ active, onChange }) {
  const chips = [
    { key: "all",     label: "All Rooms",  bg: "var(--surface2)", color: "var(--text-primary)" },
    { key: "pending", label: "⏳ Pending", bg: "#FFF7ED",          color: B.saffron },
    { key: "paid",    label: "✓ Paid",     bg: "#F0FDF4",          color: "#059669" },
  ];
  return (
    <div className="flex gap-2 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {chips.map((c) => {
        const on = active === c.key;
        return (
          <button key={c.key} onClick={() => onChange(c.key)}
            className="px-4 py-2 rounded-xl font-bold whitespace-nowrap active:scale-95 transition-all"
            style={{
              fontSize: 12, border: "none", cursor: "pointer",
              background: on ? GRAD_BRAND : c.bg,
              color: on ? "white" : c.color,
              boxShadow: on ? "0 4px 14px rgba(255,107,53,0.25)" : "none",
              transform: on ? "scale(1.04)" : "scale(1)",
            }}>
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────
function EmptyState({ hasFilter, onAdd }) {
  return (
    <motion.div variants={V.scaleUp} initial="hidden" animate="visible" className="text-center py-16">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4"
        style={{ background: `linear-gradient(135deg, ${B.cream}, ${B.border})` }}>
        <i className={`${hasFilter ? "fa-solid fa-filter" : "fa-regular fa-building"} text-4xl`} style={{ color: "var(--text-muted)" }} />
      </div>
      <p className="font-black text-lg mb-1" style={{ color: "var(--text-primary)" }}>
        {hasFilter ? "No matching rooms" : "No buildings yet"}
      </p>
      <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
        {hasFilter ? "Try changing the filter or search" : "Add your first building to get started"}
      </p>
      {!hasFilter && (
        <button onClick={onAdd}
          className="px-6 py-3 text-white font-black rounded-2xl active:scale-95 transition-all text-sm"
          style={{ background: GRAD_BRAND, boxShadow: "0 6px 18px rgba(255,107,53,0.28)", border: "none", cursor: "pointer" }}>
          <i className="fa-solid fa-plus mr-2" /> Add Building
        </button>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOT — OwnerDashboardView
// ─────────────────────────────────────────────────────────────
export default function OwnerDashboardView() {
  const { authUser, setUserRole } = useApp();
  const navigate = useNavigate();

  const [rooms,       setRooms]       = useState([]);
  const [buildings,   setBuildings]   = useState({});
  const [ownerName,   setOwnerName]   = useState("");
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState("all");
  const [search,      setSearch]      = useState("");
  const [activeNav,   setActiveNav]   = useState("home");
  const [toasts,      setToasts]      = useState([]);

  // Sheet states
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [addRoomBid,      setAddRoomBid]      = useState(null); // buildingId or null
  const [showYou,         setShowYou]         = useState(false);

  const unsubRooms = useRef(null);
  const unsubBldgs = useRef(null);
  const scrollRef  = useRef(null);

  // ── Scroll-driven header collapse ────────────────────────
  const scrollY = useMotionValue(0);
  const handleScroll = useCallback((e) => {
    scrollY.set(e.currentTarget.scrollTop);
  }, [scrollY]);

  const toast = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3200);
  }, []);

  const dismissToast = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);

  // ── Owner profile (one-shot) ──────────────────────────────
  useEffect(() => {
    if (!authUser) return;
    getDocs(query(collection(db, "ownerProfiles"), where("uid", "==", authUser.uid)))
      .then((s) => { if (!s.empty) setOwnerName(s.docs[0].data().name || ""); })
      .catch(() => {});
  }, [authUser]);

  // ── LIVE rooms subscription ───────────────────────────────
  useEffect(() => {
    if (!authUser) return;
    setLoading(true);

    unsubRooms.current = onSnapshot(
      query(collection(db, "rooms"), where("ownerId", "==", authUser.uid)),
      (snap) => { setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );

    return () => unsubRooms.current?.();
  }, [authUser]);

  // ── FIX: LIVE buildings subscription (was one-shot before) ─
  useEffect(() => {
    if (!authUser) return;

    unsubBldgs.current = onSnapshot(
      query(collection(db, "buildings"), where("ownerId", "==", authUser.uid)),
      (snap) => {
        const m = {};
        snap.docs.forEach((d) => { m[d.id] = { id: d.id, ...d.data() }; });
        setBuildings(m);
      },
      () => {}
    );

    return () => unsubBldgs.current?.();
  }, [authUser]);

  // ── Toggle payment ────────────────────────────────────────
  const handleToggle = useCallback(async (roomId, currentStatus) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    try {
      if (currentStatus === "paid") {
        await updateDoc(doc(db, "rooms", roomId), { status: "pending", amountPaid: 0, balanceDue: room.rent || 0, paidDate: null });
        toast("⏳ Marked as pending");
      } else {
        const total = (room.rent || 0) + (room.electricityBill || 0);
        await updateDoc(doc(db, "rooms", roomId), { status: "paid", amountPaid: total, balanceDue: 0, paidDate: new Date().toISOString() });
        toast("✓ Payment received!");
      }
    } catch (e) { toast(e.message, "error"); }
  }, [rooms, toast]);

  // ── Nav handler ───────────────────────────────────────────
  const handleNav = useCallback((key) => {
    setActiveNav(key);
    if (key === "you") setShowYou(true);
  }, []);

  // ── "You" sheet sub-navigation ────────────────────────────
  const handleYouNav = useCallback((action) => {
    if (action === "logout") { setUserRole(null); navigate("/login", { replace: true }); }
    if (action === "profile") navigate("/settings");
    if (action === "analytics") toast("Analytics coming soon!", "success");
    if (action === "backup") {
      const blob = new Blob([JSON.stringify({ rooms, backup_date: new Date().toISOString() }, null, 2)], { type: "application/json" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "khata-backup.json" });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast("☁️ Backup downloaded!");
    }
  }, [navigate, setUserRole, rooms, toast]);

  // ── Filtered + grouped rooms ──────────────────────────────
  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((r) => {
      const mf = filter === "all" ? true
               : filter === "paid" ? r.status === "paid"
               : ["pending","partial"].includes(r.status);
      const ms = !q || r.roomNo?.toString().toLowerCase().includes(q) || r.tenantName?.toLowerCase().includes(q);
      return mf && ms;
    });
  }, [rooms, filter, search]);

  const grouped = useMemo(() => {
    const g = {};
    filteredRooms.forEach((r) => {
      const bid = r.buildingId || "no-building";
      (g[bid] = g[bid] || []).push(r);
    });
    return Object.entries(g);
  }, [filteredRooms]);

  const hasFilter = filter !== "all" || search.trim() !== "";

  // ─────────────────────────────────────────────────────────
  return (
    <>
      {/* Inject skeleton shimmer once */}
      <style>{`
        .skeleton{background:linear-gradient(90deg,#ECEEF4 25%,#E4E6EF 50%,#ECEEF4 75%);background-size:600px 100%;animation:sh 1.8s infinite}
        @keyframes sh{0%{background-position:-600px 0}100%{background-position:600px 0}}
      `}</style>

      <div className="flex flex-col h-full overflow-hidden relative" style={{ background: B.cream }}>

        {/* Premium header — sticky, collapse-on-scroll */}
        <FinanceHeader
          ownerName={ownerName}
          rooms={rooms}
          loading={loading}
          scrollY={scrollY}
        />

        {/* Scrollable body */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
          style={{ background: B.cream, paddingBottom: 88 }}
        >
          <div className="px-4 pt-5">

            <QuickActions />

            {/* Section heading — single "+ Add Building" */}
            <motion.div variants={V.fadeUp} initial="hidden" animate="visible"
              className="flex justify-between items-center mb-4">
              <h3 className="font-black text-base" style={{ color: "var(--text-primary)" }}>Your Buildings</h3>
              <button onClick={() => setShowAddBuilding(true)}
                className="flex items-center gap-1.5 font-black text-xs text-white px-3.5 py-2 rounded-xl active:scale-95 transition-all"
                style={{ background: GRAD_BRAND, boxShadow: "0 4px 14px rgba(255,107,53,0.28)", border: "none", cursor: "pointer" }}>
                <i className="fa-solid fa-plus text-[10px]" /> Add Building
              </button>
            </motion.div>

            {/* Search */}
            <motion.div variants={V.fadeUp} initial="hidden" animate="visible" className="relative mb-4">
              <i className="fa-solid fa-magnifying-glass absolute top-1/2 -translate-y-1/2 text-sm"
                style={{ left: 16, color: "var(--text-muted)" }} />
              <input type="text" placeholder="Room no. या tenant का नाम…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-10 py-3 rounded-2xl font-medium text-sm outline-none transition-all"
                style={{ background: "white", border: `1.5px solid ${B.border}`, color: "var(--text-primary)", fontFamily: "'Poppins',sans-serif" }}
                onFocus={(e) => { e.target.style.borderColor = B.saffron; e.target.style.boxShadow = "0 0 0 3px rgba(255,107,53,0.09)"; }}
                onBlur={(e)  => { e.target.style.borderColor = B.border;  e.target.style.boxShadow = "none"; }}
              />
              <AnimatePresence>
                {search && (
                  <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => setSearch("")}
                    className="absolute top-1/2 -translate-y-1/2"
                    style={{ right: 12, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>
                    <i className="fa-solid fa-xmark text-lg" />
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>

            <FilterChips active={filter} onChange={setFilter} />

            {/* Loading skeleton */}
            {loading && (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)}
              </div>
            )}

            {/* Empty state */}
            {!loading && grouped.length === 0 && (
              <EmptyState hasFilter={hasFilter} onAdd={() => setShowAddBuilding(true)} />
            )}

            {/* Building groups */}
            <AnimatePresence mode="popLayout">
              {!loading && grouped.map(([bid, bRooms]) => (
                <motion.div key={bid} variants={V.fadeUp} initial="hidden" animate="visible"
                  exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}>
                  <BuildingGroup
                    buildingId={bid}
                    buildingName={bid === "no-building" ? "Uncategorized" : buildings[bid]?.name || "Building"}
                    rooms={bRooms}
                    onToggle={handleToggle}
                    onAddRoom={(id) => setAddRoomBid(id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

          </div>
        </div>

        {/* Fixed bottom nav */}
        <BottomNav active={activeNav} onNav={handleNav} />

        {/* Toast */}
        <ToastStack toasts={toasts} dismiss={dismissToast} />
      </div>

      {/* ── Sheets ── */}
      <AnimatePresence>
        {showAddBuilding && (
          <AddBuildingSheet key="add-building"
            ownerId={authUser?.uid}
            onClose={() => setShowAddBuilding(false)}
            onCreated={(msg) => toast(msg)}
          />
        )}
        {addRoomBid && (
          <AddRoomSheet key="add-room"
            buildingId={addRoomBid}
            ownerId={authUser?.uid}
            onClose={() => setAddRoomBid(null)}
            onCreated={(msg) => toast(msg)}
          />
        )}
        {showYou && (
          <YouSheet key="you"
            ownerName={ownerName}
            authUser={authUser}
            onClose={() => { setShowYou(false); setActiveNav("home"); }}
            onNav={handleYouNav}
          />
        )}
      </AnimatePresence>
    </>
  );
}
