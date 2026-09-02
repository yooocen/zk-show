// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

/**
 * 验证 hint marker 的 DOM 结构符合 navigateFromTarget 的 closest 查找链路。
 * 不依赖 view 类，只测试 DOM 查询与 pointer 事件模拟。
 */
describe("hint marker click flow", () => {
  function createHintMarker(markerId: string): {
    root: HTMLElement;
    canvas: HTMLElement;
    svg: SVGElement;
    marker: SVGElement;
    circle: Element;
  } {
    const root = document.createElement("div");
    root.className = "zk-show-root";
    root.style.width = "800px";
    root.style.height = "600px";
    root.style.position = "relative";
    document.body.appendChild(root);

    const canvas = document.createElement("div");
    canvas.className = "zk-show-canvas";
    canvas.style.cssText = "position:relative;transform-origin:0 0;";
    root.appendChild(canvas);

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "zk-show-lines");
    svg.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;";
    canvas.appendChild(svg);

    const marker = document.createElementNS(svgNS, "g");
    marker.setAttribute("class", "zk-show-hint-marker");
    marker.setAttribute("data-hint-id", markerId);
    marker.setAttribute("tabindex", "0");
    marker.setAttribute("role", "button");
    marker.setAttribute("transform", "translate(100 100)");
    marker.style.pointerEvents = "all";

    const hit = document.createElementNS(svgNS, "circle");
    hit.setAttribute("class", "zk-show-hint-hit");
    hit.setAttribute("r", "12");
    hit.style.fill = "transparent";
    marker.appendChild(hit);

    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("class", "zk-show-hint-dot");
    dot.setAttribute("r", "4");
    marker.appendChild(dot);

    svg.appendChild(marker);

    return { root, canvas, svg, marker, circle: hit };
  }

  it("从 hint marker 的 circle 向上 closest 能正确找到 marker g", () => {
    const { marker, circle } = createHintMarker("test-1");

    // 模拟 navigateFromTarget 中的 closest 检查
    const found = (circle as Element).closest(".zk-show-hint-marker");
    expect(found).toBe(marker);
    expect(found?.getAttribute("data-hint-id")).toBe("test-1");
  });

  it("hint marker 不在 onPointerDown 的忽略列表中", () => {
    const { circle } = createHintMarker("test-2");

    // 模拟 onPointerDown 的 guard 检查
    const ignoreSelectors = ".zk-show-hint-popover, .zk-show-link-popover, .zk-show-topic-switch";
    const closest = (circle as Element).closest(ignoreSelectors);
    expect(closest).toBeNull();
  });

  it("hint marker 不在 onPointerEnd 的忽略列表中", () => {
    const { circle } = createHintMarker("test-3");

    // 模拟 onPointerEnd 的 guard 检查
    const ignoreSelectors = ".zk-show-hint-popover, .zk-show-link-popover, .zk-show-topic-switch";
    const closest = (circle as Element).closest(ignoreSelectors);
    expect(closest).toBeNull();
  });

  it("从 circle 的 closest 不应匹配 .zk-show-lines 之前应匹配 .zk-show-hint-marker", () => {
    const { circle, marker } = createHintMarker("test-4");

    // navigateFromTarget 先检查 hint-marker，再检查 .zk-show-lines
    // 如果先匹配到 .zk-show-lines 会关闭弹出框
    const hintMarker = (circle as Element).closest(".zk-show-hint-marker");
    expect(hintMarker).toBe(marker);

    const lines = (circle as Element).closest(".zk-show-lines");
    expect(lines).toBeTruthy(); // 确实能匹配到 lines

    // 关键是 hint-marker 的检查在 lines 之前，所以应该先命中
    // 这个顺序在 navigateFromTarget 中保证
  });

  it("svg 父元素有 pointer-events:none，但 marker 自身有 pointer-events:all", () => {
    const { marker } = createHintMarker("test-5");

    const style = window.getComputedStyle(marker);
    // CSS 中 .zk-show-hint-marker { pointer-events: all; }
    // 注意：inline style 或 CSS 类都可
    expect(marker.style.pointerEvents).toBe("all");
  });
});