// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComboField, type ComboOption } from "../src/combo-field";
import { PANEL_MAX_HEIGHT } from "../src/dropdown-panel";

const ROOTS: ComboOption[] = [
  { value: "1", code: "1", title: "数学" },
  { value: "2", code: "2", title: "编程" },
];

function inputOf(field: ComboField): HTMLInputElement {
  return field.el.querySelector<HTMLInputElement>(".zk-show-combo-input")!;
}

function panelOf(field: ComboField): HTMLElement {
  return field.el.querySelector<HTMLElement>(".zk-show-combo-panel")!;
}

/** 伪造锚点矩形（happy-dom 无布局，rect 恒为 0），只影响被断言的面板几何。 */
let anchorRect = { top: 0, bottom: 0, left: 12, right: 312, width: 300, height: 0 };

function anchorAt(top: number, bottom: number): void {
  anchorRect = { top, bottom, left: 12, right: 312, width: 300, height: bottom - top };
}

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", { value: 600, configurable: true });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => anchorRect as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
  anchorAt(0, 0);
});

describe("ComboField", () => {
  it("聚焦时列出全部选项（编码 + 标题）", () => {
    const field = new ComboField("选择话题根");
    document.body.appendChild(field.el);
    field.setOptions(ROOTS);
    inputOf(field).dispatchEvent(new Event("focus"));
    const items = panelOf(field).querySelectorAll<HTMLElement>(".zk-show-combo-item");
    expect(items.length).toBe(2);
    expect(items[0].querySelector(".zk-show-combo-code")?.textContent).toBe("1");
    expect(items[0].querySelector(".zk-show-combo-title")?.textContent).toBe("数学");
  });

  it("输入过滤只留下匹配项，并清掉已选项回调", () => {
    const field = new ComboField("选择话题根");
    const handler = vi.fn();
    field.onChange(handler);
    document.body.appendChild(field.el);
    field.setOptions(ROOTS);
    field.setValue("1");
    const input = inputOf(field);
    input.value = "编程";
    input.dispatchEvent(new Event("input"));
    const items = panelOf(field).querySelectorAll<HTMLElement>(".zk-show-combo-item");
    expect(items.length).toBe(1);
    expect(items[0].querySelector(".zk-show-combo-code")?.textContent).toBe("2");
    expect(handler).toHaveBeenCalledWith("");
  });

  it("没有匹配项时给出提示", () => {
    const field = new ComboField("选择话题根");
    document.body.appendChild(field.el);
    field.setOptions(ROOTS);
    const input = inputOf(field);
    input.value = "不存在";
    input.dispatchEvent(new Event("input"));
    expect(panelOf(field).querySelectorAll(".zk-show-combo-item").length).toBe(0);
    expect(panelOf(field).querySelector(".zk-show-combo-empty")?.textContent).toBe("（无匹配项）");
  });

  it("点击选项后显示「编码　标题」、回调 value 并收起面板", () => {
    const field = new ComboField("选择话题根");
    const handler = vi.fn();
    field.onChange(handler);
    document.body.appendChild(field.el);
    field.setOptions(ROOTS);
    inputOf(field).dispatchEvent(new Event("focus"));
    expect(panelOf(field).classList.contains("is-open")).toBe(true);
    panelOf(field)
      .querySelectorAll<HTMLElement>(".zk-show-combo-item")[1]
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(handler).toHaveBeenCalledWith("2");
    expect(inputOf(field).value).toBe("2　编程");
    expect(panelOf(field).classList.contains("is-open")).toBe(false);
  });

  it("禁用时收起面板并禁用输入框", () => {
    const field = new ComboField("先选话题根");
    document.body.appendChild(field.el);
    field.setOptions(ROOTS);
    inputOf(field).dispatchEvent(new Event("focus"));
    field.setDisabled(true);
    expect(inputOf(field).disabled).toBe(true);
    expect(panelOf(field).classList.contains("is-open")).toBe(false);
    field.setDisabled(false);
    expect(inputOf(field).disabled).toBe(false);
  });

  it("以视口固定定位展开，锚点贴近视口底部时翻到上方", () => {
    const field = new ComboField("选择话题根");
    document.body.appendChild(field.el);
    field.setOptions(ROOTS);

    anchorAt(100, 130);
    inputOf(field).dispatchEvent(new Event("focus"));
    const panel = panelOf(field);
    expect(panel.style.position).toBe("fixed");
    expect(panel.style.top).toBe("134px");
    expect(panel.style.maxHeight).toBe(`${PANEL_MAX_HEIGHT}px`);

    anchorAt(560, 590);
    field.setValue("");
    inputOf(field).dispatchEvent(new Event("focus"));
    expect(panel.classList.contains("is-above")).toBe(true);
    expect(panel.style.top).toBe("auto");
    expect(panel.style.bottom).toBe("44px");
  });

  it("滚动弹窗容器时面板跟随锚点，面板自身滚动不重定位", () => {
    const field = new ComboField("选择话题根");
    document.body.appendChild(field.el);
    field.setOptions(ROOTS);
    anchorAt(100, 130);
    inputOf(field).dispatchEvent(new Event("focus"));
    const panel = panelOf(field);
    expect(panel.style.top).toBe("134px");

    // 面板内部滚动：位置不变
    panel.dispatchEvent(new Event("scroll", { bubbles: false }));
    expect(panel.style.top).toBe("134px");

    // 外部容器滚动：锚点随之下移，面板跟随
    anchorAt(160, 190);
    document.body.dispatchEvent(new Event("scroll", { bubbles: true }));
    expect(panel.style.top).toBe("194px");
  });

  it("收起后不再跟随滚动", () => {
    const field = new ComboField("选择话题根");
    document.body.appendChild(field.el);
    field.setOptions(ROOTS);
    anchorAt(100, 130);
    inputOf(field).dispatchEvent(new Event("focus"));
    panelOf(field)
      .querySelector<HTMLElement>(".zk-show-combo-item")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    const topAfterSelect = panelOf(field).style.top;
    anchorAt(200, 230);
    document.body.dispatchEvent(new Event("scroll", { bubbles: true }));
    expect(panelOf(field).style.top).toBe(topAfterSelect);
  });

  it("clear 清空选项与输入值", () => {
    const field = new ComboField("选择话题根");
    document.body.appendChild(field.el);
    field.setOptions(ROOTS);
    field.setValue("1");
    field.clear();
    expect(inputOf(field).value).toBe("");
    inputOf(field).dispatchEvent(new Event("focus"));
    expect(panelOf(field).querySelectorAll(".zk-show-combo-item").length).toBe(0);
  });
});
