// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  HOST_OPEN_CLASS,
  PANEL_MAX_HEIGHT,
  PANEL_MIN_HEIGHT,
  fixedPanelPlacement,
  openDropdownPanel,
  openFixedDropdownPanel,
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

describe("fixedPanelPlacement", () => {
  it("下方空间充足时向下展开并贴合可用高度", () => {
    expect(fixedPanelPlacement({ top: 100, bottom: 130 }, 900)).toEqual({
      above: false,
      maxHeight: PANEL_MAX_HEIGHT,
    });
    expect(fixedPanelPlacement({ top: 600, bottom: 630 }, 900)).toEqual({
      above: false,
      maxHeight: 900 - 630 - 12,
    });
  });

  it("下方放不下保底高度、上方更宽敞时翻到上方", () => {
    expect(fixedPanelPlacement({ top: 560, bottom: 590 }, 600)).toEqual({
      above: true,
      maxHeight: PANEL_MAX_HEIGHT,
    });
  });

  it("上下都不足时向下展开并保底", () => {
    expect(fixedPanelPlacement({ top: 20, bottom: 40 }, 60)).toEqual({
      above: false,
      maxHeight: PANEL_MIN_HEIGHT,
    });
  });

  it("下方放得下整个面板时保持向下", () => {
    expect(fixedPanelPlacement({ top: 100, bottom: 130 }, 600, 400)).toEqual({
      above: false,
      maxHeight: PANEL_MAX_HEIGHT,
    });
  });

  it("下方放不下整个面板、上方更宽敞时翻到上方", () => {
    expect(fixedPanelPlacement({ top: 560, bottom: 590 }, 600, 400)).toEqual({
      above: true,
      maxHeight: PANEL_MAX_HEIGHT,
    });
  });
});

describe("openFixedDropdownPanel", () => {
  function anchorAt(top: number, bottom: number): HTMLElement {
    const anchor = document.createElement("input");
    Object.defineProperty(anchor, "getBoundingClientRect", {
      value: () => ({ top, bottom, left: 12, right: 212, width: 200, height: bottom - top }),
    });
    return anchor;
  }

  function viewportHeight(px: number): void {
    Object.defineProperty(window, "innerHeight", { value: px, configurable: true });
  }

  it("贴着锚点向下展开，并用视口可用高度限高", () => {
    viewportHeight(600);
    const panel = document.createElement("div");
    openFixedDropdownPanel(panel, anchorAt(100, 130));
    expect(panel.classList.contains("is-open")).toBe(true);
    expect(panel.classList.contains("is-above")).toBe(false);
    expect(panel.style.position).toBe("fixed");
    expect(panel.style.top).toBe("134px");
    expect(panel.style.bottom).toBe("auto");
    expect(panel.style.width).toBe("200px");
    expect(panel.style.maxHeight).toBe(`${PANEL_MAX_HEIGHT}px`);
  });

  it("锚点贴近视口底部时翻到上方，面板底边不越过锚点顶边", () => {
    viewportHeight(600);
    const panel = document.createElement("div");
    openFixedDropdownPanel(panel, anchorAt(560, 590));
    expect(panel.classList.contains("is-above")).toBe(true);
    expect(panel.style.top).toBe("auto");
    // bottom: 600 - 560 + 4 = 44 → 面板底边在 600 - 44 = 556，锚点顶边 560
    expect(panel.style.bottom).toBe("44px");
    const panelBottom = 600 - Number.parseFloat(panel.style.bottom);
    expect(panelBottom).toBeLessThanOrEqual(560);
  });

  it("展开后按内容高度决定方向：下方放不下、上方更宽敞则翻到上方", () => {
    viewportHeight(600);
    const panel = document.createElement("div");
    Object.defineProperty(panel, "scrollHeight", { value: 400, configurable: true });
    openFixedDropdownPanel(panel, anchorAt(560, 590));
    expect(panel.classList.contains("is-open")).toBe(true);
    expect(panel.classList.contains("is-above")).toBe(true);
    expect(panel.style.maxHeight).toBe(`${PANEL_MAX_HEIGHT}px`);
  });
});
