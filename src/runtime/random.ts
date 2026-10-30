/** State is serializable so retries replay the same encounter decisions. */
export class Random {
  constructor(public state = 60631) {}
  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
  between(low: number, high: number): number { return low + (high - low) * this.next(); }
}
