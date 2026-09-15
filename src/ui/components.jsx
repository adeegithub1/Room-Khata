// src/ui/components.jsx
// ─────────────────────────────────────────────────────────────
//  Shared primitives for the ledger-book design system.
//  Every screen should build from these rather than reaching
//  for one-off inline styles, so the app reads as one product.
// ─────────────────────────────────────────────────────────────
import { useState } from "react";

/* ─── Field: a ruled-paper input ──────────────────────────── */
export function Field({
  label, type = "text", value, onChange, placeholder,
  required, min, max, autoComplete, prefix, mono, hint,
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="mb-4">
      {label && (
        <label className="block text-[11px] font-semibold text-ink-soft tracking-wide mb-1.5">
          {label}{required ? " *" : ""}
        </label>
      )}
      <div className="relative">
        {prefix && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-stamp pointer-events-none select-none">
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          required={required}
          minLength={type === "text" ? min : undefined}
          min={type === "number" ? min : undefined}
          max={max}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={[
            "w-full rounded-md text-[15px] text-ink outline-none transition-colors",
            "placeholder:text-ink-soft/50",
            prefix ? "pl-10 pr-3.5 py-3" : "px-3.5 py-3",
            mono ? "font-mono tracking-wider" : "font-sans",
            focused ? "bg-paper-light border-stamp" : "bg-paper-light/60 border-rule",
            "border-[1.5px]",
          ].join(" ")}
          style={{ boxShadow: focused ? "0 0 0 3px rgba(140,47,30,.08)" : "none" }}
        />
      </div>
      {hint && <p className="text-[11px] text-ink-soft mt-1">{hint}</p>}
    </div>
  );
}

/* ─── Buttons ──────────────────────────────────────────────── */
export function Button({
  children, onClick, type = "button", loading, disabled,
  variant = "stamp", full = true,
}) {
  const styles = {
    stamp:     "bg-stamp text-paper-light border-stamp hover:bg-stamp-2",
    brass:     "bg-brass text-paper-light border-brass hover:bg-brass-2",
    ink:       "bg-ink text-paper-light border-ink",
    outline:   "bg-transparent text-ink border-rule hover:border-ink",
    ghost:     "bg-transparent text-ink-soft border-transparent",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        full ? "w-full" : "",
        "tap inline-flex items-center justify-center gap-2",
        "rounded-md border-[1.5px] px-5 py-3 text-[15px] font-semibold",
        "transition-opacity disabled:opacity-50",
        styles[variant],
      ].join(" ")}
    >
      {loading && (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
            strokeDasharray="32" strokeDashoffset="12" opacity="0.9" />
        </svg>
      )}
      {loading ? "कृपया रुकें…" : children}
    </button>
  );
}

export function TextLink({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-stamp font-semibold text-sm underline decoration-stamp/30 underline-offset-4 hover:decoration-stamp"
    >
      {children}
    </button>
  );
}

export function BackLink({ onClick, children = "वापस जाएं" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-ink-soft font-medium text-[13px] mb-5"
    >
      <i className="fa-solid fa-arrow-left text-[11px]" />
      {children}
    </button>
  );
}

/* ─── Error note: a torn-off correction slip, not a red bubble ── */
export function ErrorNote({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 border-l-[3px] border-stamp bg-stamp/[0.06] rounded-r-md px-3 py-2.5 mb-3">
      <i className="fa-solid fa-circle-exclamation text-stamp text-[13px] mt-0.5 shrink-0" />
      <span className="text-[13px] font-medium text-stamp-2 leading-snug">{message}</span>
    </div>
  );
}

/* ─── Stamp badge: rotated ink-stamp status indicator ─────── */
const STAMP_COLORS = {
  paid:    "text-sage",
  due:     "text-rust",
  verify:  "text-brass",
  partial: "text-brass",
  neutral: "text-ink-soft",
};
export function StampBadge({ label, tone = "neutral", icon }) {
  return (
    <span className={`stamp-badge ${STAMP_COLORS[tone] || STAMP_COLORS.neutral}`}>
      {icon && <i className={`fa-solid ${icon} text-[10px]`} />}
      {label}
    </span>
  );
}

/* ─── LedgerRow: label ... leader ... value, the core layout atom ── */
export function LedgerRow({ label, value, valueClass = "" }) {
  return (
    <div className="ledger-row py-1">
      <span className="text-[13px] text-ink-soft shrink-0">{label}</span>
      <span className="leader" />
      <span className={`text-[14px] font-semibold text-ink shrink-0 ${valueClass}`}>{value}</span>
    </div>
  );
}

/* ─── ReceiptCard: the primary content container ───────────── */
export function ReceiptCard({ children, className = "" }) {
  return (
    <div className={`receipt-slip px-4 pt-4 pb-4 ${className}`}>
      {children}
    </div>
  );
}

/* ─── Big serif figure — the one bold typographic moment ──── */
export function LedgerFigure({ amount, label, tone = "ink" }) {
  const colors = { ink: "text-ink", stamp: "text-stamp", sage: "text-sage" };
  return (
    <div>
      {label && <p className="text-[11px] font-semibold text-ink-soft tracking-wide mb-0.5">{label}</p>}
      <p className={`font-serif font-semibold text-[38px] leading-none ${colors[tone]}`}>
        ₹{amount}
      </p>
    </div>
  );
}

/* ─── EmptyState: an invitation to act, in the interface's voice ── */
export function EmptyState({ icon = "fa-book", title, body, action }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      <div className="w-14 h-14 rounded-full border-[1.5px] border-dashed border-rule flex items-center justify-center mb-4">
        <i className={`fa-solid ${icon} text-ink-soft text-xl`} />
      </div>
      <p className="font-serif font-semibold text-ink text-lg mb-1.5">{title}</p>
      {body && <p className="text-ink-soft text-[13px] max-w-[240px] mb-4">{body}</p>}
      {action}
    </div>
  );
}
