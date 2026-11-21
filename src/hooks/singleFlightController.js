/**
 * SingleFlightController
 * Core pure controller that manages lock, timeout, and state callbacks.
 */

export const DEFAULT_FLIGHT_TIMEOUT_MS = 30000;
export const FLIGHT_TIMEOUT_MESSAGE = 'العملية تأخرت، تأكد من حالتها قبل ما تعيد';

export class SingleFlightController {
  constructor({ defaultTimeoutMs = DEFAULT_FLIGHT_TIMEOUT_MS, onTimeout } = {}) {
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.onTimeout = onTimeout;
    this.busy = false;
    this.pending = false;
    this.timer = null;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.pending);
      } catch (e) {
        // ignore listener errors
      }
    }
  }

  async run(fn, options = {}) {
    if (this.busy) {
      return { executed: false, reason: 'locked' };
    }

    this.busy = true;
    this.pending = true;
    this.notify();

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    let timedOut = false;

    if (timeoutMs > 0) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        timedOut = true;
        this.busy = false;
        this.pending = false;
        this.notify();

        const warnMsg = FLIGHT_TIMEOUT_MESSAGE;
        if (typeof options.onTimeout === 'function') {
          options.onTimeout(warnMsg);
        } else if (typeof this.onTimeout === 'function') {
          this.onTimeout(warnMsg);
        } else if (typeof window !== 'undefined' && window.alert) {
          window.alert(warnMsg);
        }
      }, timeoutMs);
    }

    try {
      const res = await fn();
      return { executed: true, result: res };
    } finally {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (!timedOut) {
        this.busy = false;
        this.pending = false;
        this.notify();
      }
    }
  }

  dispose() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.listeners.clear();
  }
}

export default SingleFlightController;
