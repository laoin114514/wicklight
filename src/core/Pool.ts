export interface Poolable {
  active: boolean;
}

export class Pool<T extends Poolable> {
  private items: T[] = [];
  private readonly factory: () => T;
  private cursor = 0;

  constructor(factory: () => T, initial = 64) {
    this.factory = factory;
    for (let i = 0; i < initial; i += 1) {
      const item = factory();
      item.active = false;
      this.items.push(item);
    }
  }

  acquire(): T {
    const size = this.items.length;
    for (let i = 0; i < size; i += 1) {
      const idx = (this.cursor + i) % size;
      const item = this.items[idx];
      if (!item.active) {
        this.cursor = (idx + 1) % size;
        item.active = true;
        return item;
      }
    }
    const item = this.factory();
    item.active = true;
    this.items.push(item);
    this.cursor = 0;
    return item;
  }

  get all(): readonly T[] {
    return this.items;
  }

  active(): T[] {
    return this.items.filter((it) => it.active);
  }

  clear(): void {
    for (const item of this.items) item.active = false;
  }

  get activeCount(): number {
    let n = 0;
    for (const item of this.items) if (item.active) n += 1;
    return n;
  }
}
