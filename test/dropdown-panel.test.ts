// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  HOST_OPEN_CLASS,
  PANEL_MAX_HEIGHT,
  PANEL_MIN_HEIGHT,
  openDropdownPanel,
  panelMaxHeight,
  scrollItemIntoView,
} from "../src/dropdown-panel";

function panelWithItem(itemTop: number, itemHeight: number, scrollTop: number, clientHeight: number) {
  const panel = document.createElement("div");
  const item = document.createElement("div");
  panel.appendChild(item);
  Object.defineProperty(panel, "scrollTop", { value: scrollTop, writable: true, configurable: true });
  Object.defineProperty(panel, "clientHeight", { get: () => clientHeight, configurable: true });
  Object.defineProperty(item, "offsetTop", { get: () => itemTop, configurable: true });
  Object.defineProperty(item, "offsetHeight", { get: () => itemHeight, configurable: true });
  return { panel, item };
}

describe("panelMaxHeight", () => {
  it("可用空间充足时取上限", () => {
    expect(panelMaxHeight(900)).toBe(PANEL_MAX_HEIGHT);
    expect(panelMaxHeight(280)).toBe(280);
  });

  it("空间不足时贴合可用空间", () => {
    expect(panelMaxHeight(240.7)).toBe(240);
  });

  it("极矮视图保底", () => {
    expect(panelMaxHeight(20)).toBe(PANEL_MIN_HEIGHT);
    expect(panelMaxHeight(-12)).toBe(PANEL_MIN_HEIGHT);
  });

  it("非有限值回退上限", () => {
    expect(panelMaxHeight(Number.NaN)).toBe(PANEL_MAX_HEIGHT);
    expect(panelMaxHeight(Number.POSITIVE_INFINITY)).toBe(PANEL_MAX_HEIGHT);
  });
});

describe("scrollItemIntoView", () => {
  it("选中项在可视区上方时向上对齐", () => {
    const { panel, item } = panelWithItem(120, 40, 200, 100);
    scrollItemIntoView(panel, item);
    expect(panel.scrollTop).toBe(120);
  });

  it("选中项在可视区下方时向下对齐", () => {
    const { panel, item } = panelWithItem(240, 40, 0, 100);
    scrollItemIntoView(panel, item);
    expect(panel.scrollTop).toBe(180);
  });

  it("选中项已在可视区内时不动", () => {
    const { panel, item } = panelWithItem(140, 40, 100, 100);
    scrollItemIntoView(panel, item);
    expect(panel.scrollTop).toBe(100);
  });
});

describe("openDropdownPanel", () => {
  it("写入 maxHeight、加 is-open、给宿主加放下拉类并滚到选中项", () => {
    const host = document.createElement("div");
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const item = document.createElement("div");
    item.className = "is-selected";
    panel.appendChild(item);
    host.appendChild(anchor);
    host.appendChild(panel);
    openDropdownPanel(panel, anchor, host);
    expect(panel.classList.contains("is-open")).toBe(true);
    expect(panel.style.maxHeight).toBe(`${PANEL_MIN_HEIGHT}px`);
    expect(host.classList.contains(HOST_OPEN_CLASS)).toBe(true);
  });

  it("没有选中项时回到顶部", () => {
    const panel = document.createElement("div");
    Object.defineProperty(panel, "scrollTop", { value: 90, writable: true, configurable: true });
    openDropdownPanel(panel, document.createElement("button"), null);
    expect(panel.scrollTop).toBe(0);
    expect(panel.style.maxHeight).toBe(`${PANEL_MAX_HEIGHT}px`);
  });
});
