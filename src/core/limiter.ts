// Runs at most `limit` tasks at once; the rest wait their turn. Pure, no timers.
// Used to load only a few images at a time so scrolling stays smooth.

export class Limiter {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private limit: number) {}

  setLimit(limit: number): void {
    this.limit = Math.max(1, limit);
    this.drain();
  }

  /**
   * Resolves with a release function once there is a free slot. Call `release` exactly once when the work
   * is done. Calling `cancel` before the slot arrives removes the request and returns true; once the slot
   * has been given it returns false.
   */
  acquire(): { slot: Promise<() => void>; cancel: () => boolean } {
    let start: () => void = () => undefined;
    const slot = new Promise<() => void>((resolve) => {
      start = () => {
        this.running++;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.running--;
          this.drain();
        });
      };
    });
    this.waiting.push(start);
    this.drain();
    return {
      slot,
      cancel: () => {
        const at = this.waiting.indexOf(start);
        if (at < 0) return false;
        this.waiting.splice(at, 1);
        return true;
      },
    };
  }

  get active(): number {
    return this.running;
  }

  get queued(): number {
    return this.waiting.length;
  }

  private drain(): void {
    while (this.running < this.limit && this.waiting.length > 0) this.waiting.shift()?.();
  }
}
