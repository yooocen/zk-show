// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { TopicSwitch } from "../src/topic-switch";

describe("TopicSwitch", () => {
  it("渲染所有选项，包含编码与标题", () => {
    const sw = new TopicSwitch();
    document.body.appendChild(sw.el);
    sw.setOptions([
      { code: "1", title: "数学", disabled: false },
      { code: "2", title: "编程", disabled: false },
    ]);
    const items = sw.el.querySelectorAll(".zk-show-topic-switch-item");
    expect(items.length).toBe(2);
    expect(items[0].querySelector(".zk-show-topic-switch-code")?.textContent).toBe("1");
    expect(items[0].querySelector(".zk-show-topic-switch-title")?.textContent).toBe("数学");
    sw.destroy();
  });

  it("幽灵选项置灰且点击不触发选择", () => {
    const sw = new TopicSwitch();
    const handler = vi.fn();
    sw.onChange(handler);
    document.body.appendChild(sw.el);
    sw.setOptions([
      { code: "1", title: "数学", disabled: false },
      { code: "3", title: "3", disabled: true },
    ]);
    const ghost = sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-item.is-ghost")!;
    expect(ghost).toBeTruthy();
    ghost.click();
    expect(handler).not.toHaveBeenCalled();
    sw.destroy();
  });

  it("点击可用选项回调并关闭面板", () => {
    const sw = new TopicSwitch();
    const handler = vi.fn();
    sw.onChange(handler);
    document.body.appendChild(sw.el);
    sw.setOptions([{ code: "2", title: "编程", disabled: false }]);
    sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-item")!.click();
    expect(handler).toHaveBeenCalledWith("2");
    expect(sw.el.querySelector(".zk-show-topic-switch-panel")?.classList.contains("is-open")).toBe(false);
    sw.destroy();
  });
});