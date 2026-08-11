import { useEffect, useRef, useState } from 'react';

/**
 * Ticks a countdown down to 0 once a second. Used to mirror the backend's
 * 30s OTP resend cooldown (src/utils/otp.js) in the UI, so Resend visibly
 * disables instead of letting a rapid second tap silently invalidate the
 * code the user is about to type.
 */
export function useCountdown() {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  function start(from: number) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSeconds(from);
    intervalRef.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  return { seconds, start };
}
