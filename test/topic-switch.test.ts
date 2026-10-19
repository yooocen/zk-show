// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { TopicSwitch } from "../src/topic-switch";

describe("TopicSwitch", () => {
  it("渲染所有选项，包含编码与标题", () => {
    const sw = new TopicSwitch();
    document.body.appendChild(sw.el);
    sw.setOptions([
      { code: "1", title: "数学" },
      { code: "2", title: "编程" },
    ]);
    const items = sw.el.querySelectorAll(".zk-show-topic-switch-item");
    expect(items.length).toBe(2);
    expect(items[0].querySelector(".zk-show-topic-switch-code")?.textContent).toBe("1");
    expect(items[0].querySelector(".zk-show-topic-switch-title")?.textContent).toBe("数学");
    sw.destroy();
  });

  it("选项一律可点击", () => {
    const sw = new TopicSwitch();
    const handler = vi.fn();
    sw.onChange(handler);
    document.body.appendChild(sw.el);
    sw.setOptions([
      { code: "1", title: "数学" },
      { code: "3", title: "3" },
    ]);
    const items = sw.el.querySelectorAll<HTMLElement>(".zk-show-topic-switch-item");
    expect(items.length).toBe(2);
    expect(sw.el.querySelector(".is-ghost")).toBeNull();
    items[1].click();
    expect(handler).toHaveBeenCalledWith("3");
    sw.destroy();
  });

  it("展开时按可用高度限制面板并标记宿主，收起时解除", () => {
    const host = document.createElement("div");
    host.className = "zk-show-root";
    document.body.appendChild(host);
    const sw = new TopicSwitch();
    host.appendChild(sw.el);
    sw.setOptions([
      { code: "1", title: "数学" },
      { code: "2", title: "编程" },
    ]);
    const trigger = sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-trigger")!;
    trigger.click();
    const panel = sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-panel")!;
    expect(panel.style.maxHeight).toBe("64px");
    expect(host.classList.contains("zk-show-dropdown-open")).toBe(true);
    trigger.click();
    expect(host.classList.contains("zk-show-dropdown-open")).toBe(false);
    sw.destroy();
    host.remove();
  });

  it("点击可用选项回调并关闭面板", () => {
    const sw = new TopicSwitch();
    const handler = vi.fn();
    sw.onChange(handler);
    document.body.appendChild(sw.el);
    sw.setOptions([{ code: "2", title: "编程" }]);
    sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-item")!.click();
    expect(handler).toHaveBeenCalledWith("2");
    expect(sw.el.querySelector(".zk-show-topic-switch-panel")?.classList.contains("is-open")).toBe(false);
    sw.destroy();
  });

  it("点击组件外部时收起面板", () => {
    const sw = new TopicSwitch();
    document.body.appendChild(sw.el);
    sw.setOptions([{ code: "1", title: "数学" }]);
    sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-trigger")!.click();
    expect(sw.el.querySelector(".zk-show-topic-switch-panel")?.classList.contains("is-open")).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(sw.el.querySelector(".zk-show-topic-switch-panel")?.classList.contains("is-open")).toBe(false);
    sw.destroy();
  });

  it("destroy 后不再响应外部点击", () => {
    const sw = new TopicSwitch();
    document.body.appendChild(sw.el);
    sw.setOptions([{ code: "1", title: "数学" }]);
    sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-trigger")!.click();
    sw.destroy();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(sw.el.isConnected).toBe(false);
  });

  it("多次 setOptions 刷新后触发按钮仍能立即展开面板", () => {
    const sw = new TopicSwitch();
    document.body.appendChild(sw.el);
    sw.setOptions([{ code: "1", title: "数学" }]);
    sw.setSelected("1");
    sw.setOptions([
      { code: "1", title: "数学" },
      { code: "2", title: "编程" },
    ]);
    sw.setSelected("2");
    const trigger = sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-trigger")!;
    trigger.click();
    expect(sw.el.querySelector(".zk-show-topic-switch-panel")?.classList.contains("is-open")).toBe(true);
    trigger.click();
    expect(sw.el.querySelector(".zk-show-topic-switch-panel")?.classList.contains("is-open")).toBe(false);
    sw.destroy();
  });
});
