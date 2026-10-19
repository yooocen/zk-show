// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { deriveZkNoSwitchOptions, ZkNoSwitch } from "../src/zkno-switch";
import { TopicGraph } from "../src/topic-graph";

describe("deriveZkNoSwitchOptions", () => {
  it("按先后顺序去重根话题，标题取真实根/幽灵回退编码", () => {
    const graph = new TopicGraph([
      { path: "r1.md", basename: "数学", no: "1" },
      { path: "a.md", basename: "多主题", no: "1/4a" },
      { path: "a.md", basename: "多主题", no: "2/3b" },
      { path: "a.md", basename: "多主题", no: "1/2" },
    ]);

    expect(deriveZkNoSwitchOptions(["1/4a", "2/3b", "1/2"], graph)).toEqual([
      { rootCode: "1", rootTitle: "数学", zkNo: "1/4a" },
      { rootCode: "2", rootTitle: "2", zkNo: "2/3b" },
    ]);
  });

  it("空数组返回空选项", () => {
    const graph = new TopicGraph([{ path: "a.md", basename: "多主题", no: "1/4a" }]);
    expect(deriveZkNoSwitchOptions([], graph)).toEqual([]);
  });

  it("单个编码生成单个选项", () => {
    const graph = new TopicGraph([{ path: "a.md", basename: "多主题", no: "1/4a" }]);
    expect(deriveZkNoSwitchOptions(["1/4a"], graph)).toEqual([
      { rootCode: "1", rootTitle: "1", zkNo: "1/4a" },
    ]);
  });
});

describe("ZkNoSwitch", () => {
  it("少于 2 个选项时隐藏", () => {
    const sw = new ZkNoSwitch();
    document.body.appendChild(sw.el);
    sw.render([{ rootCode: "1", rootTitle: "数学", zkNo: "1/4a" }], "1/4a");
    expect(sw.el.style.display).toBe("none");
    sw.destroy();
  });

  it("渲染选项，点击回调返回 zkNo", () => {
    const sw = new ZkNoSwitch();
    const handler = vi.fn();
    sw.onChange(handler);
    document.body.appendChild(sw.el);
    sw.render(
      [
        { rootCode: "1", rootTitle: "数学", zkNo: "1/4a" },
        { rootCode: "2", rootTitle: "编程", zkNo: "2/3b" },
      ],
      "1/4a"
    );
    expect(sw.el.style.display).toBe("block");
    const items = sw.el.querySelectorAll(".zk-show-topic-switch-item");
    expect(items.length).toBe(2);
    expect(items[0].querySelector(".zk-show-topic-switch-code")?.textContent).toBe("1");
    expect(items[0].querySelector(".zk-show-topic-switch-title")?.textContent).toContain("数学");
    (items[1] as HTMLElement).click();
    expect(handler).toHaveBeenCalledWith("2/3b");
    sw.destroy();
  });

  it("同根多码时按根高亮非首个码", () => {
    const sw = new ZkNoSwitch();
    document.body.appendChild(sw.el);
    sw.render(
      [
        { rootCode: "2", rootTitle: "编程", zkNo: "2/3b" },
        { rootCode: "1", rootTitle: "数学", zkNo: "1/4a" },
      ],
      "2/9c"
    );
    const selected = sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-item.is-selected");
    expect(selected?.querySelector(".zk-show-topic-switch-code")?.textContent).toBe("2");
    sw.destroy();
  });

  it("外部点击收起面板", () => {
    const sw = new ZkNoSwitch();
    document.body.appendChild(sw.el);
    sw.render(
      [
        { rootCode: "1", rootTitle: "数学", zkNo: "1/4a" },
        { rootCode: "2", rootTitle: "编程", zkNo: "2/3b" },
      ],
      null
    );
    sw.el.querySelector<HTMLElement>(".zk-show-topic-switch-trigger")!.click();
    expect(sw.el.querySelector(".zk-show-topic-switch-panel")?.classList.contains("is-open")).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(sw.el.querySelector(".zk-show-topic-switch-panel")?.classList.contains("is-open")).toBe(false);
    sw.destroy();
  });

  it("展开时限制高度并标记宿主，收起时解除", () => {
    const host = document.createElement("div");
    host.className = "zk-show-root";
    document.body.appendChild(host);
    const sw = new ZkNoSwitch();
    host.appendChild(sw.el);
    sw.render(
      [
        { rootCode: "1", rootTitle: "数学", zkNo: "1/11a" },
        { rootCode: "2", rootTitle: "编程", zkNo: "2/2a" },
      ],
      "1/11a"
    );
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
});
