import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

Object.defineProperty(window.HTMLElement.prototype, "scrollTo", {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(window, "requestAnimationFrame", {
  configurable: true,
  writable: true,
  value: (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});
