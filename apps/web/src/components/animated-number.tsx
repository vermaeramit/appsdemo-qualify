import { useEffect } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';

const indianNumber = new Intl.NumberFormat('en-IN');

interface AnimatedNumberProps {
  value: number;
  format?: (value: number) => string;
  duration?: number;
}

/** Counts up from 0 to `value`. Jumps straight to the value when reduced motion is on. */
export function AnimatedNumber({
  value,
  format = (n) => indianNumber.format(n),
  duration = 1.2,
}: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(reduceMotion ? value : 0);
  const display = useTransform(motionValue, (latest) => format(Math.round(latest)));

  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, duration, reduceMotion, motionValue]);

  return <motion.span className="tabular-nums">{display}</motion.span>;
}
