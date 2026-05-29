export default function ActionButton({ children, variant = 'primary', className = '', ...props }) {
  const styles =
    variant === 'secondary'
      ? 'bg-white/10 text-white border border-white/15'
      : 'bg-white text-royal shadow-glow';

  return (
    <button
      className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold transition active:scale-[0.98] ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
