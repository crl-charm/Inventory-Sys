// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Modal } from "./modal";

let root: Root;
let trigger: HTMLButtonElement;
const press = (key: string, shiftKey = false) => document.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // jsdom has focus semantics but no layout. Treat rendered controls as visible.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{ width: 10, height: 10 }] as unknown as DOMRectList);
  trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  document.body.style.overflow = "auto";
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  document.body.style.overflow = "";
  vi.restoreAllMocks();
});

it("keeps keyboard focus inside, preserves input focus on rerenders, and restores focus when closed", () => {
  const initialClose = vi.fn();
  const latestClose = vi.fn();
  const render = (open: boolean, onClose = initialClose) => act(() => root.render(createElement(
    Modal,
    { open, title: "Stock in", onClose, footer: createElement("button", null, "Save") },
    createElement("input", { "aria-label": "Quantity" }),
  )));
  render(true);
  const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const input = panel.querySelector("input")!;
  const close = panel.querySelector("button")!;
  const save = panel.querySelectorAll("button")[1]!;
  expect(document.activeElement).toBe(panel);
  expect(document.body.style.overflow).toBe("hidden");
  press("Tab", true);
  expect(document.activeElement).toBe(save);
  press("Tab");
  expect(document.activeElement).toBe(close);
  press("Tab", true);
  expect(document.activeElement).toBe(save);
  trigger.focus();
  expect(document.activeElement).toBe(panel);
  input.focus();
  render(true, latestClose);
  expect(document.activeElement).toBe(input);
  press("Escape");
  expect(latestClose).toHaveBeenCalledOnce();
  expect(initialClose).not.toHaveBeenCalled();
  render(false, latestClose);
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe("auto");
});

it("retains focus on the dialog when no controls can receive focus", () => {
  act(() => root.render(createElement(Modal, { open: true, title: "Waiting", onClose: vi.fn() })));
  const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
  panel.querySelector("button")!.disabled = true;
  expect(press("Tab")).toBe(false);
  expect(document.activeElement).toBe(panel);
});
