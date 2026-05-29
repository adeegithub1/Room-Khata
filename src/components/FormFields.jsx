export function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">{label}</span>
      <input
        className="h-12 w-full rounded-2xl border border-white/12 bg-white/10 px-4 text-sm text-white outline-none transition placeholder:text-white/32 focus:border-gold/60"
        {...props}
      />
    </label>
  );
}

export function SelectField({ label, children, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">{label}</span>
      <select
        className="h-12 w-full rounded-2xl border border-white/12 bg-[#1d1246] px-4 text-sm text-white outline-none focus:border-gold/60"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
