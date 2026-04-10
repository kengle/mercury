/**
 * Queue for bridging callback-based chunk delivery with async generator consumption.
 * 
 * Used to stream agent output in real-time:
 * - agent.run() calls onChunk(chunk) as it produces output
 * - ChunkQueue buffers chunks and makes them available to async generator
 * - async generator yields chunks to adapter.stream()
 */
export class ChunkQueue {
  private chunks: string[] = [];
  private waiter: (() => void) | null = null;
  private finished = false;

  /**
   * Push a chunk to the queue and notify waiting consumers.
   */
  push(chunk: string) {
    this.chunks.push(chunk);
    // Notify waiting consumer
    if (this.waiter) {
      this.waiter();
      this.waiter = null;
    }
  }

  /**
   * Get the next chunk, waiting if queue is empty.
   * Returns null when queue is finished and empty.
   */
  async next(): Promise<string | null> {
    // Wait for chunks if queue is empty
    while (this.chunks.length === 0 && !this.finished) {
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
    
    // Return null if finished and no more chunks
    if (this.chunks.length === 0) {
      return null;
    }
    
    return this.chunks.shift()!;
  }

  /**
   * Mark the queue as finished, signaling no more chunks will arrive.
   */
  end() {
    this.finished = true;
    // Wake up any waiting consumer
    if (this.waiter) {
      this.waiter();
      this.waiter = null;
    }
  }

  /**
   * Check if the queue is finished.
   */
  isFinished(): boolean {
    return this.finished;
  }

  /**
   * Get the current number of chunks in the queue.
   */
  size(): number {
    return this.chunks.length;
  }
}
