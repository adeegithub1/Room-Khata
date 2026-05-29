import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export default function BottomSheet({ open, title, children, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.section
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 520) onClose();
            }}
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            exit={{ y: '105%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 36 }}
            className="glass mb-3 w-full max-w-[480px] rounded-t-[28px] p-5"
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/30" />
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <button className="rounded-full bg-white/10 p-2 text-white" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
