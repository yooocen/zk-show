import type { TopicGraph } from "./topic-graph";

export interface ZkNoSwitchOption {
  rootCode: string;
  rootTitle: string;
  /** 该文件在此根话题下对应的 zkNo（首个）。 */
  zkNo: string;
}

/** 跨窗口（popout）安全的 Node 判定：不依赖构造函数（各窗口 realm 不同），
 *  用 DOM 固有属性 nodeType 判断，任何窗口都成立。 */
function isNodeLike(target: EventTarget | null | undefined): target is Node {
  return target !== null && target !== undefined && typeof (target as Node).nodeType === "number";
}

/** 按编码出现顺序去重根话题，生成下拉选项。 */
export function deriveZkNoSwitchOptions(codes: string[], graph: TopicGraph): ZkNoSwitchOption[] {
  const seen = new Set<string>();
  const out: ZkNoSwitchOption[] = [];
  for (const code of codes) {
    const root = graph.rootOf(code);
    if (seen.has(root)) continue;
    seen.add(root);
    const rootNode = graph.node(root);
    out.push({
      rootCode: root,
      rootTitle: rootNode && !rootNode.isGhost ? rootNode.title : root,
      zkNo: code,
    });
  }
  return out;
}

/**
 * 右上角「笔记话题」下拉：仅当当前笔记有多个 zkNo 时显示，
 * 列出其涉及的去重根话题，选中后切换图谱聚焦（不切换当前笔记）。
 * 内部元素复用 .zk-show-topic-switch-* 样式。
 */
export class ZkNoSwitch {
  readonly el: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private options: ZkNoSwitchOption[] = [];
  private selectedZkNo: string | null = null;
  private selectHandler: (zkNo: string) => void = () => {};
  private readonly outsidePointerHandler: (ev: PointerEvent) => void;
  private unbindOutside: (() => void) | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "zk-show-zkno-switch";
    this.el.style.display = "none";

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "zk-show-topic-switch-trigger";
    this.button.textContent = "笔记话题";
    this.button.setAttribute("aria-haspopup", "listbox");
    this.button.addEventListener("click", () => this.toggle());
    this.button.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") this.close();
    });

    this.panel = document.createElement("div");
    this.panel.className = "zk-show-topic-switch-panel";
    this.panel.setAttribute("role", "listbox");

    this.el.appendChild(this.button);
    this.el.appendChild(this.panel);

    this.outsidePointerHandler = (ev) => {
      if (isNodeLike(ev.target) && !this.el.contains(ev.target)) this.close();
    };
    this.bindOutside();
    // 视图被拖到新窗口（popout）后，把外部点击监听重挂到该窗口的 document 上
    if (typeof this.el.onWindowMigrated === "function") {
      this.el.onWindowMigrated(() => this.bindOutside());
    }
  }

  private bindOutside(): void {
    this.unbindOutside?.();
    const doc = this.el.ownerDocument ?? document;
    const handler = this.outsidePointerHandler;
    doc.addEventListener("pointerdown", handler);
    this.unbindOutside = () => doc.removeEventListener("pointerdown", handler);
  }

  /** 每次 refresh 调用：少于 2 个选项时隐藏。 */
  render(options: ZkNoSwitchOption[], selectedZkNo: string | null): void {
    this.options = options;
    this.selectedZkNo = selectedZkNo;
    if (options.length < 2) {
      this.el.style.display = "none";
      this.close();
      return;
    }
    this.el.style.display = "block";
    this.renderPanel();
  }

  onChange(handler: (zkNo: string) => void): void {
    this.selectHandler = handler;
  }

  close(): void {
    this.panel.classList.remove("is-open");
    this.button.setAttribute("aria-expanded", "false");
  }

  destroy(): void {
    this.unbindOutside?.();
    this.el.remove();
  }

  private toggle(): void {
    const isOpen = this.panel.classList.toggle("is-open");
    this.button.setAttribute("aria-expanded", String(isOpen));
  }

  private renderPanel(): void {
    this.panel.innerHTML = "";
    const selectedRoot = this.selectedZkNo ? this.selectedZkNo.split("/")[0] : null;
    for (const option of this.options) {
      const item = document.createElement("div");
      item.className = "zk-show-topic-switch-item";
      item.setAttribute("role", "option");
      if (option.rootCode === selectedRoot) item.classList.add("is-selected");
      const code = document.createElement("span");
      code.className = "zk-show-topic-switch-code";
      code.textContent = option.rootCode;
      const title = document.createElement("span");
      title.className = "zk-show-topic-switch-title";
      title.textContent = `${option.rootTitle}（${option.zkNo}）`;
      item.appendChild(code);
      item.appendChild(title);
      item.setAttribute("tabindex", "0");
      item.addEventListener("click", () => {
        this.selectedZkNo = option.zkNo;
        this.selectHandler(option.zkNo);
        this.close();
      });
      item.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          item.click();
        }
      });
      this.panel.appendChild(item);
    }
  }
}
