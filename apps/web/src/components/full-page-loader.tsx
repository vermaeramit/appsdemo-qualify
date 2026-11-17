import { motion } from 'motion/react';
import { BrandLogo } from './brand-logo';

export function FullPageLoader() {
  return (
    <div className="grid min-h-svh place-items-center" role="status" aria-label="Loading">
      <div className="flex flex-col items-center gap-5">
        <motion.div
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <BrandLogo />
        </motion.div>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full w-1/3 rounded-full bg-primary"
            animate={{ x: ['-100%', '300%'] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </div>
  );
}
