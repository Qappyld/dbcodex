import { vi } from "vitest";

/** jsdom has no layout engine; give React Flow real observer notifications and measurable nodes. */
export function setupFlowDom(): void {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(220);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(140);
  vi.stubGlobal("DOMMatrixReadOnly", class { m22 = 1; });
  vi.stubGlobal("ResizeObserver", class {
    timers = new Map<Element, ReturnType<typeof setTimeout>>();
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.timers.set(target, setTimeout(() => this.callback([{ target, contentRect: { width: 800, height: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver), 0));
    }
    unobserve(target: Element) { clearTimeout(this.timers.get(target)); }
    disconnect() { this.timers.forEach(clearTimeout); }
  });
}
