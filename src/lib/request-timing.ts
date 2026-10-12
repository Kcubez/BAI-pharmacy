/** Server-Timing separates auth, full data loading, and cold-cache DB work. */
export class RequestTiming {
  private started = performance.now();
  private entries: string[] = [];
  async measure<T>(name: string, work: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try { return await work(); }
    finally { this.entries.push(`${name};dur=${(performance.now()-start).toFixed(1)}`); }
  }
  header() {
    return [...this.entries, `total;dur=${(performance.now()-this.started).toFixed(1)}`].join(", ");
  }
}
