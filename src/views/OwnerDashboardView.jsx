// src/views/OwnerDashboardView.jsx
// ─────────────────────────────────────────────────────────────
//  PREMIUM OWNER DASHBOARD — Fintech aesthetic
//
//  Design direction: Apple Wallet × CRED × deep-space dark header
//  overlaid on a clean cream body. The header is the hero —
//  a cinematic gradient with a glassmorphic finance widget.
//  Body = crisp room cards on a warm cream surface.
//
//  Motion: framer-motion only. Zero CSS bounce/pulse keyframes.
//  Data:   Firestore onSnapshot (live) for rooms + one-shot
//          getDocs for buildings and ownerProfile.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import {
  collection, query, where,
  onSnapshot, getDocs,
  updateDoc, doc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../firebase/config";
import { useApp } from "../context/AppContext";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const fmt = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function initials(name) {
  if (!name?.trim()) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return ["Good Night",    "🌙"];
  if (h < 12) return ["Good Morning",  "🌅"];
  if (h < 17) return ["Good Afternoon","☀️"];
  if (h < 21) return ["Good Evening",  "🌆"];
  return             ["Good Night",    "✨"];
}

// ─────────────────────────────────────────────────────────────
// MOTION VARIANTS  — all framer-motion, zero CSS keyframes
// ─────────────────────────────────────────────────────────────
const ease = [0.22, 1, 0.36, 1]; // custom ease-out-expo

const V = {
  // Container that staggers its children
  stagger: (staggerAmt = 0.07) => ({
    hidden:  {},
    visible: { transition: { staggerChildren: staggerAmt, delayChildren: 0 } },
  }),

  // Generic fade-up child
  fadeUp: {
    hidden:  { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0,  transition: { duration: 0.52, ease } },
  },

  // Slide down from above (header elements)
  slideDown: {
    hidden:  { opacity: 0, y: -14 },
    visible: { opacity: 1, y: 0,   transition: { duration: 0.45, ease } },
  },

  // Scale up from slightly smaller
  scaleUp: {
    hidden:  { opacity: 0, scale: 0.93 },
    visible: { opacity: 1, scale: 1,    transition: { duration: 0.48, ease } },
  },

  // Fade in only — for stat numbers
  fade: {
    hidden:  { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.4, ease: "easeOut" } },
  },
};

// ─────────────────────────────────────────────────────────────
// ANIMATED COUNTER  — counts up on mount
// ─────────────────────────────────────────────────────────────
function AnimatedNumber({ value, prefix = "₹" }) {
  const ref = useRef(null);
  const mv  = useMotionValue(0);

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        if (ref.current)
          ref.current.textContent =
            prefix +
            Math.round(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
      },
    });
    return controls.stop;
  }, [value]);

  return (
    <span
      ref={ref}
      style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.03em" }}
    >
      {prefix}0
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// SKELETON CARD
// ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div
      className="rounded-[18px] overflow-hidden p-3 space-y-2"
      style={{ background: "white", border: "1.5px solid #ECEEF4" }}
    >
      <div className="w-full rounded-xl skeleton" style={{ aspectRatio: "1" }} />
      <div className="h-3 rounded-lg skeleton w-3/4 mx-auto" />
      <div className="h-2.5 rounded-lg skeleton w-1/2 mx-auto" />
      <div className="h-7 rounded-xl skeleton" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────
function Toast({ toasts, dismiss }) {
  return (
    <div className="fixed inset-x-0 bottom-24 flex flex-col items-center gap-2 z-50 pointer-events-none px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: -8,  scale: 0.95 }}
            transition={{ duration: 0.32, ease }}
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto px-4 py-3 rounded-2xl text-sm font-semibold text-white cursor-pointer shadow-lg"
            style={{
              background: t.type === "error"
                ? "linear-gradient(135deg,#E11D48,#BE123C)"
                : "linear-gradient(135deg,#059669,#047857)",
              maxWidth: 320,
            }}
          >
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PREMIUM FINANCE HEADER
// ─────────────────────────────────────────────────────────────
function FinanceHeader({ ownerName, rooms, loading }) {
  // ── Derived stats ────────────────────────────────────────
  const totalRevenue = useMemo(
    () => rooms.reduce((s, r) => s + (r.amountPaid || 0), 0),
    [rooms]
  );
  const pendingDues = useMemo(
    () =>
      rooms
        .filter((r) => ["pending", "partial"].includes(r.status) && r.tenantName?.trim())
        .reduce((s, r) => s + (r.balanceDue || r.rent || 0), 0),
    [rooms]
  );
  const totalExpected = useMemo(
    () => rooms.filter((r) => r.tenantName?.trim()).reduce((s, r) => s + (r.rent || 0), 0),
    [rooms]
  );
  const collectionPct = totalExpected > 0 ? Math.round((totalRevenue / totalExpected) * 100) : 0;

  const [greet, greetEmoji] = greeting();
  const name = ownerName || "Dashboard";

  return (
    <motion.header
      variants={V.stagger(0.09)}
      initial="hidden"
      animate="visible"
      className="relative overflow-hidden shrink-0"
      style={{
        background:
          "linear-gradient(155deg, #0A0818 0%, #160F35 30%, #2D1B69 62%, #160F35 100%)",
        paddingTop: "max(44px, env(safe-area-inset-top))",
      }}
    >
      {/* ── Ambient orbs — static, no CSS animation ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: -80, right: -50,
          width: 240, height: 240,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,102,0,0.22) 0%, transparent 68%)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: -40, left: -30,
          width: 200, height: 200,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(109,40,217,0.25) 0%, transparent 68%)",
        }}
      />

      {/* ── Top accent line (shimmer via framer-motion x) ── */}
      <motion.div
        className="absolute inset-x-0 top-0 h-0.5 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,102,0,0.7) 30%, rgba(245,158,11,0.9) 50%, rgba(255,102,0,0.7) 70%, transparent 100%)",
        }}
        animate={{ backgroundPosition: ["0% 0%", "200% 0%"] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
      />

      <div className="relative z-10 px-5 pb-5">

        {/* ── Row 1: brand pill + bell ── */}
        <motion.div variants={V.slideDown} className="flex justify-between items-center mb-5">
          {/* Brand pill */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-2xl"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.11)",
            }}
          >
            <div
              className="w-5 h-5 rounded-md flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#FF6600,#F59E0B)" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10L12 3l9 7" />
                <path d="M5 10v11a2 2 0 002 2h10a2 2 0 002-2V10" />
              </svg>
            </div>
            <span className="text-[10px] font-black tracking-wide" style={{ color: "#F59E0B" }}>
              RoomKhata&nbsp;
              <span style={{ color: "rgba(255,255,255,0.38)", fontWeight: 600 }}>PRO</span>
            </span>
          </div>

          {/* Bell */}
          <button
            className="relative flex items-center justify-center rounded-full transition-all active:scale-90"
            style={{
              width: 40, height: 40,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <i className="fa-regular fa-bell text-base" style={{ color: "rgba(255,255,255,0.72)" }} />
            <span
              className="absolute rounded-full"
              style={{ top: 8, right: 8, width: 7, height: 7, background: "#FF6600" }}
            />
          </button>
        </motion.div>

        {/* ── Row 2: greeting + name ── */}
        <motion.div variants={V.fadeUp} className="mb-5">
          <p
            className="font-bold uppercase mb-1"
            style={{ fontSize: 10, letterSpacing: "0.15em", color: "rgba(255,255,255,0.42)" }}
          >
            {greet} {greetEmoji}
          </p>
          <h2
            className="font-black leading-none"
            style={{
              fontSize: "clamp(1.8rem, 8vw, 2.25rem)",
              letterSpacing: "-0.03em",
              color: "#fff",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            {name}
          </h2>
        </motion.div>

        {/* ── Finance widget card ── */}
        <motion.div
          variants={V.scaleUp}
          className="overflow-hidden relative"
          style={{
            borderRadius: 22,
            background: "rgba(255,255,255,0.058)",
            border: "1px solid rgba(255,255,255,0.11)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
          }}
        >
          {/* Top-edge shine */}
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.20) 50%, transparent 95%)",
            }}
          />

          {/* ── Two stat columns ── */}
          <div className="flex">
            {/* Revenue */}
            <div
              className="flex-1 px-5 pt-5 pb-4"
              style={{ borderRight: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-2 mb-2.5">
                <div
                  className="flex items-center justify-center rounded-md"
                  style={{ width: 16, height: 16, background: "rgba(255,102,0,0.20)" }}
                >
                  <i className="fa-solid fa-arrow-trend-up" style={{ fontSize: 7, color: "#FB923C" }} />
                </div>
                <span
                  className="font-bold uppercase tracking-widest"
                  style={{ fontSize: 9, color: "rgba(255,255,255,0.40)" }}
                >
                  Total Revenue
                </span>
              </div>

              <motion.div
                variants={V.fade}
                className="font-bold leading-none"
                style={{
                  fontSize: "clamp(1.4rem, 5.5vw, 1.75rem)",
                  color: "#F59E0B",
                }}
              >
                {loading ? (
                  <div className="h-8 w-28 rounded-lg skeleton" />
                ) : (
                  <AnimatedNumber value={totalRevenue} />
                )}
              </motion.div>

              <p
                className="mt-2 font-semibold"
                style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", letterSpacing: "0.04em" }}
              >
                This month
              </p>
            </div>

            {/* Pending */}
            <div className="flex-1 px-5 pt-5 pb-4">
              <div className="flex items-center gap-2 mb-2.5">
                <div
                  className="flex items-center justify-center rounded-md"
                  style={{ width: 16, height: 16, background: "rgba(225,29,72,0.16)" }}
                >
                  <i className="fa-solid fa-clock" style={{ fontSize: 7, color: "#FB7185" }} />
                </div>
                <span
                  className="font-bold uppercase tracking-widest"
                  style={{ fontSize: 9, color: "rgba(255,255,255,0.40)" }}
                >
                  Pending Dues
                </span>
              </div>

              <motion.div
                variants={V.fade}
                className="font-bold leading-none"
                style={{
                  fontSize: "clamp(1.4rem, 5.5vw, 1.75rem)",
                  color: "#FB7185",
                }}
              >
                {loading ? (
                  <div className="h-8 w-28 rounded-lg skeleton" />
                ) : (
                  <AnimatedNumber value={pendingDues} />
                )}
              </motion.div>

              <p
                className="mt-2 font-semibold"
                style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", letterSpacing: "0.04em" }}
              >
                Urgent
              </p>
            </div>
          </div>

          {/* ── Collection progress bar ── */}
          <motion.div
            variants={V.fadeUp}
            className="px-5 pb-4"
          >
            <div
              className="mb-3"
              style={{ height: 1, background: "rgba(255,255,255,0.06)" }}
            />
            <div className="flex justify-between items-center mb-2">
              <span
                className="font-semibold"
                style={{ fontSize: 9, color: "rgba(255,255,255,0.32)", letterSpacing: "0.06em" }}
              >
                Collection progress
              </span>
              <span
                style={{
                  fontSize: 10, fontWeight: 700,
                  color: "rgba(255,255,255,0.58)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {collectionPct}%
              </span>
            </div>

            {/* Track */}
            <div
              className="overflow-hidden"
              style={{ height: 3, borderRadius: 99, background: "rgba(255,255,255,0.07)" }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${collectionPct}%` }}
                transition={{ duration: 1.0, delay: 0.6, ease: [0.4, 0, 0.2, 1] }}
                style={{
                  height: "100%",
                  borderRadius: 99,
                  background: "linear-gradient(90deg, #FF6600, #F59E0B)",
                }}
              />
            </div>
          </motion.div>
        </motion.div>

      </div>
    </motion.header>
  );
}

// ─────────────────────────────────────────────────────────────
// QUICK ACTION TILES
// ─────────────────────────────────────────────────────────────
const TILES = [
  { icon: "fa-solid fa-plus",       label: "Add",     grad: "linear-gradient(135deg,#FF6600,#F59E0B)", accent: "#FF6600" },
  { icon: "fa-solid fa-chart-line", label: "Analytics",grad: "linear-gradient(135deg,#7C3AED,#6D28D9)", accent: "#7C3AED" },
  { icon: "fa-solid fa-receipt",    label: "Expenses", grad: "linear-gradient(135deg,#E11D48,#BE123C)", accent: "#E11D48" },
  { icon: "fa-solid fa-file-pdf",   label: "Report",   grad: "linear-gradient(135deg,#059669,#047857)", accent: "#059669" },
];

function QuickActions() {
  return (
    <div className="mb-6">
      <p className="sec-label mb-3">Quick Actions</p>
      <motion.div
        variants={V.stagger(0.055)}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-4 gap-2.5"
      >
        {TILES.map((t) => (
          <motion.button
            key={t.label}
            variants={V.scaleUp}
            whileTap={{ scale: 0.88 }}
            className="flex flex-col items-center py-3.5 px-1 cursor-pointer"
            style={{
              background: "white",
              border: "1.5px solid var(--border)",
              borderRadius: 18,
              boxShadow: "0 2px 8px rgba(30,27,75,0.06)",
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center mb-2"
              style={{ background: t.grad }}
            >
              <i className={`${t.icon} text-white text-sm`} />
            </div>
            <span className="font-bold" style={{ fontSize: 10, color: t.accent }}>
              {t.label}
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STATUS CONFIG  — single source of truth for all status styles
// ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  paid: {
    label: "✓ Paid",
    border: "#BBF7D0",
    badgeBg: "#DCFCE7",
    badgeColor: "#15803D",
    btnGrad: "linear-gradient(135deg,#F59E0B,#D97706)",
    btnLabel: "⏳ Undo",
    avatarGrad: "linear-gradient(135deg,#3B82F6,#4F46E5)",
  },
  partial: {
    label: "⟳ Partial",
    border: "#BFDBFE",
    badgeBg: "#DBEAFE",
    badgeColor: "#1D4ED8",
    btnGrad: "linear-gradient(135deg,#22C55E,#16A34A)",
    btnLabel: "₹ Receive",
    avatarGrad: "linear-gradient(135deg,#3B82F6,#4F46E5)",
  },
  pending_verification: {
    label: "👀 Verify",
    border: "#DDD6FE",
    badgeBg: "#F3E8FF",
    badgeColor: "#7C3AED",
    btnGrad: "linear-gradient(135deg,#7C3AED,#6D28D9)",
    btnLabel: "✓ Verify",
    avatarGrad: "linear-gradient(135deg,#7C3AED,#6D28D9)",
  },
  pending: {
    label: "⏳ Pending",
    border: "#FED7AA",
    badgeBg: "#FEF3C7",
    badgeColor: "#B45309",
    btnGrad: "linear-gradient(135deg,#22C55E,#16A34A)",
    btnLabel: "₹ Receive",
    avatarGrad: "linear-gradient(135deg,#3B82F6,#4F46E5)",
  },
  vacant: {
    label: "Vacant",
    border: "#ECEEF4",
    badgeBg: "#F1F5F9",
    badgeColor: "#64748B",
    avatarGrad: "linear-gradient(135deg,#CBD5E1,#94A3B8)",
  },
};

// ─────────────────────────────────────────────────────────────
// ROOM CARD
// ─────────────────────────────────────────────────────────────
function RoomCard({ room, onToggle }) {
  const { roomNo, tenantName, rent = 0, electricityBill = 0,
    status = "pending", balanceDue = 0, securityDeposit = 0,
    paymentApp, amountPaid = 0 } = room;

  const isVacant   = !tenantName?.trim();
  const statusKey  = isVacant ? "vacant" : (status || "pending");
  const cfg        = STATUS_CONFIG[statusKey] || STATUS_CONFIG.pending;
  const totalDue   = rent + (electricityBill || 0);
  const abbrev     = isVacant ? null : initials(tenantName);

  return (
    <motion.div
      variants={V.fadeUp}
      layout
      className="relative overflow-hidden flex flex-col"
      style={{
        background: "white",
        border: `1.5px solid ${cfg.border}`,
        borderRadius: 18,
        padding: "10px 10px 12px",
        boxShadow: "0 2px 10px rgba(30,27,75,0.06)",
      }}
    >
      {/* Edit icon */}
      <button
        className="absolute top-2 right-2 flex items-center justify-center rounded-lg active:scale-90 transition-all z-10"
        style={{ width: 22, height: 22, background: "var(--surface2)" }}
      >
        <i className="fa-solid fa-pencil" style={{ fontSize: 7, color: "var(--text-secondary)" }} />
      </button>

      {/* Avatar square */}
      <div
        className="w-full flex items-center justify-center font-black text-white mb-2.5"
        style={{
          aspectRatio: "1",
          borderRadius: 12,
          background: cfg.avatarGrad,
          fontSize: isVacant ? 20 : 16,
        }}
      >
        {isVacant
          ? <i className="fa-solid fa-door-open" style={{ fontSize: 18, opacity: 0.5 }} />
          : abbrev}
      </div>

      {/* Room + tenant info */}
      <p className="text-center font-black text-sm mb-0.5" style={{ color: "var(--text-primary)" }}>
        Room {roomNo}
      </p>
      <p
        className="text-center font-semibold truncate mb-2"
        style={{ fontSize: 11, color: "var(--text-muted)" }}
      >
        {isVacant ? "Vacant" : tenantName}
      </p>

      {/* Badges */}
      {securityDeposit > 0 && (
        <div className="text-center mb-1">
          <span className="font-bold rounded-md px-1.5 py-0.5 text-center"
            style={{ fontSize: 9, background: "#F3E8FF", color: "#7C3AED" }}>
            🔒 {fmt(securityDeposit)}
          </span>
        </div>
      )}
      {(electricityBill || 0) > 0 && (
        <div className="text-center mb-1">
          <span className="font-bold rounded-md px-1.5 py-0.5"
            style={{ fontSize: 9, background: "#FEFCE8", color: "#CA8A04" }}>
            ⚡ +{fmt(electricityBill)}
          </span>
        </div>
      )}

      {/* Rent divider row */}
      <div
        className="text-center py-1.5 mb-1.5"
        style={{ borderBottom: "1.5px solid var(--border)" }}
      >
        <p style={{ fontSize: 10, color: "var(--text-muted)" }}>
          Rent{(electricityBill || 0) > 0 ? "+Elec" : ""}
        </p>
        <p className="font-black text-sm" style={{ color: "var(--text-primary)" }}>
          {fmt(totalDue)}
        </p>
      </div>

      {/* Balance due (partial) */}
      {status === "partial" && balanceDue > 0 && (
        <div className="text-center mb-1">
          <span className="font-bold rounded-md px-1.5 py-0.5"
            style={{ fontSize: 9, background: "#FEE2E2", color: "#991B1B" }}>
            Due {fmt(balanceDue)}
          </span>
        </div>
      )}

      {/* Payment app (pending_verification) */}
      {status === "pending_verification" && paymentApp && (
        <div className="text-center mb-1">
          <span className="font-bold rounded-md px-1.5 py-0.5"
            style={{ fontSize: 9, background: "#F3E8FF", color: "#7C3AED" }}>
            via {paymentApp}
          </span>
        </div>
      )}

      {/* ── STATUS BADGE ── */}
      <div className="text-center mb-2 mt-auto">
        <span
          className="font-bold rounded-lg px-2 py-0.5 inline-block"
          style={{ fontSize: 10, background: cfg.badgeBg, color: cfg.badgeColor }}
        >
          {cfg.label}
        </span>
      </div>

      {/* ── ACTION BUTTONS ── */}
      {!isVacant ? (
        <div className="flex flex-col gap-1">
          {status === "pending_verification" ? (
            <>
              <button
                className="w-full py-1.5 text-white font-black rounded-xl active:scale-95 transition-all"
                style={{ fontSize: 10, background: cfg.btnGrad }}
              >
                ✓ Verify
              </button>
              <button
                className="w-full py-1.5 font-bold rounded-xl active:scale-95 transition-all"
                style={{ fontSize: 10, background: "var(--surface2)", color: "var(--text-secondary)" }}
              >
                ✗ Reject
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onToggle(room.id, status)}
                className="w-full py-1.5 text-white font-black rounded-xl active:scale-95 transition-all"
                style={{ fontSize: 10, background: cfg.btnGrad }}
              >
                {cfg.btnLabel}
              </button>
              <button
                className="w-full py-1.5 font-bold rounded-xl active:scale-95 transition-all"
                style={{ fontSize: 10, background: "#FEFCE8", color: "#CA8A04", border: "1.5px solid #FEF08A" }}
              >
                ⚡ Bill
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex gap-1">
          <button
            className="flex-1 py-1.5 font-bold rounded-xl active:scale-95 transition-all"
            style={{ fontSize: 10, background: "rgba(45,27,105,0.08)", color: "var(--indigo)" }}
          >
            + Assign
          </button>
          <button
            className="flex-1 py-1.5 text-white font-black rounded-xl active:scale-95 transition-all"
            style={{ fontSize: 10, background: "linear-gradient(135deg,#FF6600,#F59E0B)" }}
          >
            🔗 Invite
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// BUILDING GROUP
// ─────────────────────────────────────────────────────────────
function BuildingGroup({ buildingId, buildingName, rooms, onToggle }) {
  const occupied = rooms.filter((r) => r.tenantName?.trim()).length;
  const vacant   = rooms.length - occupied;

  return (
    <div className="mb-7">
      {/* Header pill */}
      <div
        className="p-4 mb-3 rounded-[20px]"
        style={{
          background: "white",
          border: "1.5px solid var(--border)",
          boxShadow: "0 2px 8px rgba(30,27,75,0.07)",
        }}
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg,#2D1B69,#6D28D9)" }}
            >
              <i className="fa-solid fa-building text-white text-base" />
            </div>
            <div className="min-w-0">
              <p
                className="font-bold uppercase tracking-wider"
                style={{ fontSize: 10, color: "var(--text-muted)" }}
              >
                Building
              </p>
              <h3 className="text-lg font-black truncate" style={{ color: "var(--text-primary)" }}>
                {buildingName}
              </h3>
            </div>
          </div>

          {buildingId !== "no-building" && (
            <button
              className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-white font-black active:scale-90 transition-all shrink-0"
              style={{
                fontSize: 10,
                background: "linear-gradient(135deg,#FF6600,#F59E0B)",
                boxShadow: "0 3px 10px rgba(255,102,0,0.25)",
              }}
            >
              <i className="fa-solid fa-plus" style={{ fontSize: 8 }} /> Room
            </button>
          )}
        </div>

        {/* Stats strip */}
        <div
          className="flex gap-4 mt-3 pt-3"
          style={{ borderTop: "1.5px solid var(--border)" }}
        >
          {[
            { icon: "fa-solid fa-door-closed", bg: "#F0FDF4", ic: "#16A34A", label: "Occupied", val: occupied },
            { icon: "fa-solid fa-door-open",   bg: "#FFF7ED", ic: "#FF6600", label: "Vacant",   val: vacant   },
            { icon: "fa-solid fa-layer-group", bg: "rgba(45,27,105,0.10)", ic: "#2D1B69", label: "Total", val: rooms.length },
          ].map((s) => (
            <div key={s.label} className={`flex items-center gap-1.5 ${s.label === "Total" ? "ml-auto" : ""}`}>
              <div
                className="flex items-center justify-center rounded-lg"
                style={{ width: 18, height: 18, background: s.bg }}
              >
                <i className={s.icon} style={{ fontSize: 7, color: s.ic }} />
              </div>
              <div>
                <p className="font-bold uppercase tracking-wider" style={{ fontSize: 9, color: "var(--text-muted)" }}>
                  {s.label}
                </p>
                <p className="font-black text-sm" style={{ color: "var(--text-primary)" }}>
                  {s.val}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Staggered room cards grid */}
      <motion.div
        variants={V.stagger(0.045)}
        initial="hidden"
        animate="visible"
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}
      >
        {rooms.map((room) => (
          <RoomCard key={room.id} room={room} onToggle={onToggle} />
        ))}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BOTTOM NAV
// ─────────────────────────────────────────────────────────────
const NAV = [
  { key: "home",     icon: "fa-solid fa-house",  label: "Home"     },
  { key: "tenants",  icon: "fa-solid fa-users",  label: "Tenants"  },
  { key: "payments", icon: "fa-solid fa-wallet", label: "Payments" },
  { key: "settings", icon: "fa-solid fa-gear",   label: "Settings" },
];

function BottomNav({ active, onNav }) {
  return (
    <nav
      className="absolute bottom-0 inset-x-0 flex justify-around items-end px-4 z-20"
      style={{
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "1.5px solid var(--border)",
        boxShadow: "0 -4px 24px rgba(30,27,75,0.07)",
        paddingTop: 12,
        paddingBottom: "max(20px, env(safe-area-inset-bottom))",
      }}
    >
      {NAV.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onNav(item.key)}
            className="flex flex-col items-center gap-1 flex-1 text-center"
            style={{
              color: isActive ? "var(--saffron)" : "#9CA3AF",
              transform: isActive ? "scale(1.16) translateY(-2px)" : "scale(1)",
              transition: "all 0.28s cubic-bezier(0.34,1.56,0.64,1)",
              border: "none",
              background: "none",
              cursor: "pointer",
            }}
          >
            <i className={`${item.icon} text-xl`} />
            <span className="font-black" style={{ fontSize: 9 }}>{item.label}</span>
            <span
              style={{
                display: "block",
                width: 4, height: 4,
                borderRadius: "50%",
                background: "var(--saffron)",
                opacity: isActive ? 1 : 0,
                transition: "opacity 0.2s",
              }}
            />
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
    { key: "all",     label: "All Rooms",  inactiveBg: "var(--surface2)",  inactiveColor: "var(--text-primary)" },
    { key: "pending", label: "⏳ Pending", inactiveBg: "#FFF7ED",           inactiveColor: "#FF6600" },
    { key: "paid",    label: "✓ Paid",     inactiveBg: "#F0FDF4",           inactiveColor: "#059669" },
  ];

  return (
    <div
      className="flex gap-2 mb-5 overflow-x-auto pb-1"
      style={{ scrollbarWidth: "none" }}
    >
      {chips.map((c) => {
        const isActive = active === c.key;
        return (
          <button
            key={c.key}
            onClick={() => onChange(c.key)}
            className="px-4 py-2 rounded-xl font-bold whitespace-nowrap active:scale-95 transition-all"
            style={{
              fontSize: 12,
              border: "none",
              cursor: "pointer",
              background: isActive
                ? "linear-gradient(135deg,#FF6600,#F59E0B)"
                : c.inactiveBg,
              color:      isActive ? "white" : c.inactiveColor,
              boxShadow:  isActive ? "0 4px 14px rgba(255,102,0,0.25)" : "none",
              transform:  isActive ? "scale(1.04)" : "scale(1)",
              transition: "all 0.22s ease",
            }}
          >
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
function EmptyState({ hasFilter }) {
  return (
    <motion.div
      variants={V.scaleUp}
      initial="hidden"
      animate="visible"
      className="text-center py-16"
    >
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4"
        style={{ background: "linear-gradient(135deg,#F4F6FB,#ECEEF4)" }}
      >
        <i
          className={hasFilter ? "fa-solid fa-filter text-4xl" : "fa-regular fa-building text-4xl"}
          style={{ color: "var(--text-muted)" }}
        />
      </div>
      <p className="font-black text-lg mb-1" style={{ color: "var(--text-primary)" }}>
        {hasFilter ? "No matching rooms" : "No buildings yet"}
      </p>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {hasFilter ? "Try changing the filter or search" : 'Tap "Add Building" to get started'}
      </p>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOT — OwnerDashboardView
// ─────────────────────────────────────────────────────────────
export default function OwnerDashboardView() {
  const { authUser, setUserRole } = useApp();
  const navigate = useNavigate();

  // ── State ─────────────────────────────────────────────────
  const [rooms,       setRooms]       = useState([]);
  const [buildings,   setBuildings]   = useState({});   // { id: { name } }
  const [ownerName,   setOwnerName]   = useState("");
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState("all");
  const [search,      setSearch]      = useState("");
  const [activeNav,   setActiveNav]   = useState("home");
  const [toasts,      setToasts]      = useState([]);

  const unsubRef = useRef(null);

  // ── Toast helpers ──────────────────────────────────────────
  const toast = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3200);
  }, []);

  const dismissToast = useCallback(
    (id) => setToasts((p) => p.filter((t) => t.id !== id)),
    []
  );

  // ── Load owner profile ─────────────────────────────────────
  useEffect(() => {
    if (!authUser) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "ownerProfiles"), where("uid", "==", authUser.uid))
        );
        if (!snap.empty) setOwnerName(snap.docs[0].data().name || "");
      } catch { /* silent */ }
    })();
  }, [authUser]);

  // ── Live rooms subscription (onSnapshot) ──────────────────
  useEffect(() => {
    if (!authUser) return;
    setLoading(true);

    // Rooms — live
    unsubRef.current = onSnapshot(
      query(collection(db, "rooms"), where("ownerId", "==", authUser.uid)),
      (snap) => {
        setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );

    // Buildings — one-shot (rarely change)
    getDocs(
      query(collection(db, "buildings"), where("ownerId", "==", authUser.uid))
    ).then((snap) => {
      const m = {};
      snap.docs.forEach((d) => { m[d.id] = { id: d.id, ...d.data() }; });
      setBuildings(m);
    }).catch(() => {});

    return () => unsubRef.current?.();
  }, [authUser]);

  // ── Toggle payment status ──────────────────────────────────
  const handleToggle = useCallback(async (roomId, currentStatus) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;

    try {
      if (currentStatus === "paid") {
        // Revert to pending
        await updateDoc(doc(db, "rooms", roomId), {
          status:     "pending",
          amountPaid: 0,
          balanceDue: room.rent || 0,
          paidDate:   null,
        });
        toast("⏳ Marked as pending");
      } else {
        // Mark fully paid
        const total = (room.rent || 0) + (room.electricityBill || 0);
        await updateDoc(doc(db, "rooms", roomId), {
          status:     "paid",
          amountPaid: total,
          balanceDue: 0,
          paidDate:   new Date().toISOString(),
        });
        toast("✓ Payment received!");
      }
    } catch (err) {
      toast(err.message, "error");
    }
  }, [rooms, toast]);

  // ── Nav handler ────────────────────────────────────────────
  // ── Nav handler ────────────────────────────────────────────
  const handleNav = useCallback(async (key) => {
    setActiveNav(key);
    if (key === "settings") {
       // navigate("/settings"); // Abhi settings page banna baki hai
       alert("⚙️ Settings page and Logout will be added here!");
    }
  }, [navigate]);

  // ── Filtered + grouped rooms ───────────────────────────────
  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((r) => {
      const matchFilter =
        filter === "all"     ? true :
        filter === "paid"    ? r.status === "paid" :
        filter === "pending" ? ["pending", "partial"].includes(r.status) :
        true;

      const matchSearch = !q ||
        r.roomNo?.toString().toLowerCase().includes(q) ||
        r.tenantName?.toLowerCase().includes(q);

      return matchFilter && matchSearch;
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
    <div
      className="flex flex-col h-full overflow-hidden relative"
      style={{ background: "var(--cream)" }}
    >
      {/* ── Premium fintech header ── */}
      <FinanceHeader ownerName={ownerName} rooms={rooms} loading={loading} />

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto pb-28" style={{ background: "var(--cream)" }}>
        <div className="px-4 pt-5">

          <QuickActions />

          {/* Section heading + Add Building */}
          <motion.div
            variants={V.fadeUp}
            initial="hidden"
            animate="visible"
            className="flex justify-between items-center mb-4"
          >
            <h3 className="font-black text-base" style={{ color: "var(--text-primary)" }}>
              Your Buildings
            </h3>
            <button
              className="flex items-center gap-1.5 font-black text-xs text-white px-3.5 py-2 rounded-xl active:scale-95 transition-all"
              style={{
                background:  "linear-gradient(135deg,#FF6600,#F59E0B)",
                boxShadow:   "0 4px 14px rgba(255,102,0,0.25)",
                border: "none",
                cursor: "pointer",
              }}
            >
              <i className="fa-solid fa-plus text-[10px]" /> Add Building
            </button>
          </motion.div>

          {/* Search */}
          <motion.div
            variants={V.fadeUp}
            initial="hidden"
            animate="visible"
            className="relative mb-4"
          >
            <i
              className="fa-solid fa-magnifying-glass absolute top-1/2 -translate-y-1/2 text-sm"
              style={{ left: 16, color: "var(--text-muted)" }}
            />
            <input
              type="text"
              placeholder="Room no. या tenant का नाम…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-10 py-3 rounded-2xl font-medium text-sm outline-none transition-all"
              style={{
                background: "white",
                border: "1.5px solid var(--border)",
                color: "var(--text-primary)",
                fontFamily: "'Poppins', sans-serif",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "var(--saffron)";
                e.target.style.boxShadow   = "0 0 0 3px rgba(255,102,0,0.09)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "var(--border)";
                e.target.style.boxShadow   = "none";
              }}
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{    opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ right: 12, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                >
                  <i className="fa-solid fa-xmark text-lg" />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Filter chips */}
          <FilterChips active={filter} onChange={setFilter} />

          {/* Loading skeleton */}
          {loading && (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}
            >
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          )}

          {/* Empty state */}
          {!loading && grouped.length === 0 && (
            <EmptyState hasFilter={hasFilter} />
          )}

          {/* Buildings + room cards */}
          <AnimatePresence mode="popLayout">
            {!loading && grouped.map(([buildingId, buildingRooms]) => (
              <motion.div
                key={buildingId}
                variants={V.fadeUp}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
              >
                <BuildingGroup
                  buildingId={buildingId}
                  buildingName={
                    buildingId === "no-building"
                      ? "Uncategorized"
                      : buildings[buildingId]?.name || "Building"
                  }
                  rooms={buildingRooms}
                  onToggle={handleToggle}
                />
              </motion.div>
            ))}
          </AnimatePresence>

        </div>
      </div>

      {/* ── Bottom nav ── */}
      <BottomNav active={activeNav} onNav={handleNav} />

      {/* ── Toast stack ── */}
      <Toast toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}


