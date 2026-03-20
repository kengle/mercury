type Work<T> = () => Promise<T>;

interface Pending {
  run: () => void;
}

export class AgentQueue {
  private pending: Pending[] = [];
  private active = false;

  enqueue<T>(work: Work<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        run: async () => {
          this.active = true;
          try {
            resolve(await work());
          } catch (error) {
            reject(error);
          } finally {
            this.active = false;
            this.startNext();
          }
        },
      });
      if (!this.active) this.startNext();
    });
  }

  cancelPending(): number {
    const count = this.pending.length;
    this.pending = [];
    return count;
  }

  get isActive(): boolean {
    return this.active;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  waitForActive(timeoutMs: number): Promise<boolean> {
    if (!this.active) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const check = setInterval(() => {
        if (!this.active) {
          clearInterval(check);
          resolve(true);
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        resolve(!this.active);
      }, timeoutMs);
    });
  }

  private startNext(): void {
    if (this.active) return;
    const next = this.pending.shift();
    if (next) next.run();
  }
}
