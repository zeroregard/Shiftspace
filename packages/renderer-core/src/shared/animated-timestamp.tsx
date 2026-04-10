import { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface AnimatedTimestampProps {
  value: string | null;
}

/**
 * Renders a compact relative-time label (e.g. "3s", "2m") with a crossfade
 * transition when the displayed value changes.
 */
export const AnimatedTimestamp = memo(function AnimatedTimestamp({
  value,
}: AnimatedTimestampProps) {
  if (!value) return null;

  return (
    <span className="text-text-faint inline-flex overflow-hidden">
      <span className="whitespace-pre">· </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
});
