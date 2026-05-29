import { motion } from 'framer-motion';

export default function StatCard({ label, value, tone = 'gold' }) {
  const tones = {
    gold: 'from-gold/30 to-white/8 text-gold',
    mint: 'from-mint/25 to-white/8 text-mint',
    coral: 'from-coral/25 to-white/8 text-coral'
  };

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className={`rounded-3xl border border-white/12 bg-gradient-to-br ${tones[tone]} p-4 shadow-glass backdrop-blur-xl`}
    >
      <p className="text-xs font-medium text-white/62">{label}</p>
      <p className="money mt-2 text-xl font-bold text-white">{value}</p>
    </motion.div>
  );
}
