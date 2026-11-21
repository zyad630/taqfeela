import { useRef, useState, useCallback, useEffect } from 'react';
import { SingleFlightController } from './singleFlightController.js';

export const DEFAULT_FLIGHT_TIMEOUT_MS = 30000;
export const FLIGHT_TIMEOUT_MESSAGE = 'العملية تأخرت، تأكد من حالتها قبل ما تعيد';

/**
 * useSingleFlight
 * Prevents concurrent/spam double-clicks on critical operations (checkout, bar ticket, shift close, etc.)
 * Uses an immediate synchronous ref lock with a safe 30s timeout to prevent perpetual UI lockups.
 * 
 * If the operation hangs beyond defaultTimeoutMs (30,000ms), the lock is released and an Arabic warning
 * is emitted ("العملية تأخرت، تأكد من حالتها قبل ما تعيد"), without auto-retrying.
 */
export function useSingleFlight(defaultTimeoutMs = DEFAULT_FLIGHT_TIMEOUT_MS, onTimeoutCallback) {
  const [pending, setPending] = useState(false);
  const controllerRef = useRef(null);

  if (!controllerRef.current) {
    controllerRef.current = new SingleFlightController({
      defaultTimeoutMs,
      onTimeout: onTimeoutCallback
    });
  }

  useEffect(() => {
    const ctrl = controllerRef.current;
    const unsub = ctrl.subscribe(setPending);
    return () => {
      unsub();
      ctrl.dispose();
    };
  }, []);

  const run = useCallback(async (fn, options) => {
    const outcome = await controllerRef.current.run(fn, options);
    if (outcome && outcome.executed) {
      return outcome.result;
    }
    return undefined;
  }, []);

  return [run, pending];
}

export default useSingleFlight;
