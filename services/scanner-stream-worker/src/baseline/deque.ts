export type Candidate = { d: string; v: number };

function cloneCandidates(items: Candidate[]): Candidate[] {
  return items.map((c) => ({ d: c.d, v: c.v }));
}

export class MonotonicMaxDeque {
  private readonly items: Candidate[] = [];

  push(d: string, v: number): void {
    while (this.items.length > 0 && this.items[this.items.length - 1].v <= v) {
      this.items.pop();
    }
    this.items.push({ d, v });
  }

  expire(periodStart: string): void {
    while (this.items.length > 0 && this.items[0].d < periodStart) {
      this.items.shift();
    }
  }

  front(): Candidate | undefined {
    return this.items[0];
  }

  toArray(): Candidate[] {
    return cloneCandidates(this.items);
  }
}

export class MonotonicMinDeque {
  private readonly items: Candidate[] = [];

  push(d: string, v: number): void {
    while (this.items.length > 0 && this.items[this.items.length - 1].v >= v) {
      this.items.pop();
    }
    this.items.push({ d, v });
  }

  expire(periodStart: string): void {
    while (this.items.length > 0 && this.items[0].d < periodStart) {
      this.items.shift();
    }
  }

  front(): Candidate | undefined {
    return this.items[0];
  }

  toArray(): Candidate[] {
    return cloneCandidates(this.items);
  }
}
