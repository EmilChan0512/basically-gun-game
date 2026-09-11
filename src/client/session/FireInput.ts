/** Preserve short mouse press/release edges between 30Hz input samples. */
export class FireInput {
  private edges: { down: boolean; at: number }[] = [];
  edge(down: boolean, now: number) {
    if (this.edges.at(-1)?.down !== down) this.edges.push({ down, at: now });
    if (this.edges.length > 8) this.edges.shift();
  }
  sample(held: boolean, now: number) {
    this.edges = this.edges.filter(edge => now - edge.at <= 200);
    return this.edges.shift()?.down ?? held;
  }
  clear() { this.edges = []; }
}
