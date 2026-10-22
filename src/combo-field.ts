/**
 * combo-field.ts — 轻量自定义下拉：input 过滤 + 浮层面板。
 *
 * 相比原生 <select>，面板内条目可自动换行，长标题不会被截断；
 * 选中后在输入框显示「code　title」。
 *
 * 面板用 `openFixedDropdownPanel` 以浮层方式展开：不依赖宿主容器高度，
 * 因此放在弹窗（`.modal-content` 可滚动、会裁切子元素）里也不会被裁掉——被裁掉的
 * 选项既看不到滚动条也点不中。
 */
import { openFixedDropdownPanel } from "./dropdown-panel";

export interface ComboOption {
  value: string;
  code: string;
  title: string;
}

/**
 * 跨窗口（popout）安全的 Node 判定：不依赖构造函数（各窗口 realm 不同），
 * 用 DOM 固有属性 nodeType 判断，任何窗口都成立。
 */
function isNodeLike(target: EventTarget | null | undefined): target is Node {
  return target !== null && target !== undefined && typeof (target as Node).nodeType === "number";
}

export class ComboField {
  readonly el: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly panel: HTMLElement;
  private options: ComboOption[] = [];
  private selectedValue = "";
  private changeHandler: (value: string) => void = () => {};
  private blurTimer: number | null = null;
  private unbindReposition: (() => void) | null = null;

  constructor(placeholder: string) {
    this.el = document.createElement("div");
    this.el.className = "zk-show-combo";
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "zk-show-combo-input";
    this.input.placeholder = placeholder;
    this.input.setAttribute("autocomplete", "off");
    this.panel = document.createElement("div");
    this.panel.className = "zk-show-combo-panel";
    this.el.appendChild(this.input);
    this.el.appendChild(this.panel);

    this.input.addEventListener("focus", () => this.open());
    this.input.addEventListener("input", () => {
      this.selectedValue = "";
      this.changeHandler("");
      this.render(this.filter());
      this.openPanel();
    });
    this.input.addEventListener("blur", () => {
      this.blurTimer = window.setTimeout(() => this.close(), 150);
    });
    this.input.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") this.close();
    });
  }

  setDisabled(disabled: boolean): void {
    this.input.disabled = disabled;
    if (disabled) this.close();
  }

  setOptions(opts: ComboOption[]): void {
    this.options = opts;
  }

  setValue(value: string): void {
    this.selectedValue = value;
    const opt = this.options.find((o) => o.value === value);
    this.input.value = opt ? `${opt.code}　${opt.title}` : "";
  }

  clear(): void {
    this.options = [];
    this.selectedValue = "";
    this.input.value = "";
    this.close();
  }

  onChange(cb: (value: string) => void): void {
    this.changeHandler = cb;
  }

  private open(): void {
    this.render(this.options);
    this.openPanel();
  }

  /** 展开面板并按视口/锚点自适应定位；面板自身滚动不重定位，其余滚动与窗口缩放跟随锚点。 */
  private openPanel(): void {
    openFixedDropdownPanel(this.panel, this.input);
    this.bindReposition();
  }

  private bindReposition(): void {
    if (this.unbindReposition) return;
    const doc = this.el.ownerDocument ?? document;
    const reposition = (ev: Event) => {
      if (isNodeLike(ev.target) && this.panel.contains(ev.target)) return;
      openFixedDropdownPanel(this.panel, this.input);
    };
    doc.addEventListener("scroll", reposition, true);
    doc.defaultView?.addEventListener("resize", reposition);
    this.unbindReposition = () => {
      doc.removeEventListener("scroll", reposition, true);
      doc.defaultView?.removeEventListener("resize", reposition);
    };
  }

  private close(): void {
    this.panel.classList.remove("is-open");
    this.unbindReposition?.();
    this.unbindReposition = null;
    if (this.blurTimer !== null) {
      window.clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
  }

  private filter(): ComboOption[] {
    const q = this.input.value.trim().toLowerCase();
    if (!q) return this.options;
    return this.options.filter((o) => `${o.code} ${o.title}`.toLowerCase().includes(q));
  }

  private render(list: ComboOption[]): void {
    this.panel.innerHTML = "";
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "zk-show-combo-empty";
      empty.textContent = "（无匹配项）";
      this.panel.appendChild(empty);
      return;
    }
    for (const o of list) {
      const item = document.createElement("div");
      item.className = "zk-show-combo-item";
      item.setAttribute("role", "option");
      if (o.value === this.selectedValue) item.classList.add("is-selected");
      const code = document.createElement("span");
      code.className = "zk-show-combo-code";
      code.textContent = o.code;
      const title = document.createElement("span");
      title.className = "zk-show-combo-title";
      title.textContent = o.title;
      item.appendChild(code);
      item.appendChild(title);
      item.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        this.select(o);
      });
      this.panel.appendChild(item);
    }
  }

  private select(o: ComboOption): void {
    this.selectedValue = o.value;
    this.input.value = `${o.code}　${o.title}`;
    this.close();
    this.changeHandler(o.value);
  }
}
