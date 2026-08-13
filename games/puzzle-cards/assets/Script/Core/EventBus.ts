// cocos/assets/Script/Core/EventBus.ts
// 轻量事件总线，用于场景/系统间解耦通信。
type Handler = (...args: any[]) => void;

export class EventBus {
  private map = new Map<string, Handler[]>();

  on(event: string, handler: Handler): void {
    const arr = this.map.get(event) || [];
    arr.push(handler);
    this.map.set(event, arr);
  }

  off(event: string, handler: Handler): void {
    const arr = this.map.get(event);
    if (arr) this.map.set(event, arr.filter((h) => h !== handler));
  }

  emit(event: string, ...args: any[]): void {
    (this.map.get(event) || []).forEach((h) => h(...args));
  }
}

export const bus = new EventBus();
