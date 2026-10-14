export type EventHandler<T> = (payload: T) => void;

export class EventBus<Events extends object> {
  private handlers = new Map<keyof Events, Set<EventHandler<never>>>();

  on<K extends keyof Events>(type: K, handler: EventHandler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as EventHandler<never>);
    return () => this.off(type, handler);
  }

  off<K extends keyof Events>(type: K, handler: EventHandler<Events[K]>): void {
    this.handlers.get(type)?.delete(handler as EventHandler<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of set) {
      (handler as EventHandler<Events[K]>)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export interface GameEvents {
  kill: { x: number; y: number; defId: string };
  levelUp: { level: number };
  playerHit: { amount: number };
  bossSpawn: { name: string };
  bossDefeated: { name: string };
  stageComplete: { stageId: string };
  nova: { x: number; y: number };
  oilPickup: { amount: number };
  achievement: { id: string };
  gameOver: { stats: unknown };
}
