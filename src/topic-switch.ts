export interface TopicSwitchOption {
  code: string;
  title: string;
  disabled: boolean;
}

/**
 * 右上角「切换zk话题」下拉。作为视图根容器之外的平级元素绝对定位，
 * 不参与画布 translate/scale 变换，位置固定、不支持缩放。
 */
export class TopicSwitch {
  readonly el: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private options: TopicSwitchOption[] = [];
  private selectedCode: string | null = null;
  private selectHandler: (code: string) => void = () => {};
  private readonly pointerDownHandler: (ev: PointerEvent) => void;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "zk-show-topic-switch";

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "zk-show-topic-switch-trigger";
    this.button.textContent = "切换zk话题";
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

    this.pointerDownHandler = (ev) => ev.stopPropagation();
    this.el.addEventListener("pointerdown", this.pointerDownHandler);
  }

  setOptions(options: TopicSwitchOption[]): void {
    this.options = options;
    this.render();
  }

  setSelected(code: string | null): void {
    this.selectedCode = code;
    this.render();
  }

  onChange(handler: (code: string) => void): void {
    this.selectHandler = handler;
  }

  close(): void {
    this.panel.classList.remove("is-open");
    this.button.setAttribute("aria-expanded", "false");
  }

  private toggle(): void {
    const isOpen = this.panel.classList.toggle("is-open");
    this.button.setAttribute("aria-expanded", String(isOpen));
  }

  private render(): void {
    this.panel.innerHTML = "";
    for (const option of this.options) {
      const item = document.createElement("div");
      item.className = "zk-show-topic-switch-item";
      item.setAttribute("role", "option");
      if (option.code === this.selectedCode) item.classList.add("is-selected");
      if (option.disabled) {
        item.classList.add("is-ghost");
        item.setAttribute("aria-disabled", "true");
      }
      const code = document.createElement("span");
      code.className = "zk-show-topic-switch-code";
      code.textContent = option.code;
      const title = document.createElement("span");
      title.className = "zk-show-topic-switch-title";
      title.textContent = option.title;
      item.appendChild(code);
      item.appendChild(title);
      if (!option.disabled) {
        item.setAttribute("tabindex", "0");
        item.addEventListener("click", () => {
          this.selectedCode = option.code;
          this.selectHandler(option.code);
          this.close();
        });
        item.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            item.click();
          }
        });
      }
      this.panel.appendChild(item);
    }
  }

  destroy(): void {
    this.el.removeEventListener("pointerdown", this.pointerDownHandler);
    this.el.remove();
  }
}