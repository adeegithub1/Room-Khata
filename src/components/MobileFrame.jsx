import { motion } from 'framer-motion';

export default function MobileFrame({ children }) {
  return (
    <main className="app-shell">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -18 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto min-h-[calc(100svh-32px)] w-full max-w-[480px]"
      >
        {children}
      </motion.div>
    </main>
  );
}
