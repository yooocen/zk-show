export type NavDirection = "up" | "down" | "left" | "right" | "home" | "end";

/**
 * 右下角导航按钮组（上/下/左/右/Home/End）。
 * 作为 rootEl 的平级子元素绝对定位，不参与画布 translate/scale 变换，固定位置。
 */
export class NavButtons {
  readonly el: HTMLElement;
  private readonly buttons = new Map<NavDirection, HTMLButtonElement>();
  private clickHandler: (dir: NavDirection) => void = () => {};

  private static readonly LABELS: Record<NavDirection, string> = {
    up: "▲",
    down: "▼",
    left: "◀",
    right: "▶",
    home: "H",
    end: "E",
  };

  private static readonly ORDER: NavDirection[] = ["up", "down", "left", "right", "home", "end"];

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "zk-show-nav-buttons";

    for (const dir of NavButtons.ORDER) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "zk-show-nav-button";
      button.textContent = NavButtons.LABELS[dir];
      button.setAttribute("data-nav-dir", dir);
      button.addEventListener("click", () => this.clickHandler(dir));
      this.buttons.set(dir, button);
      this.el.appendChild(button);
    }
  }

  onChange(handler: (dir: NavDirection) => void): void {
    this.clickHandler = handler;
  }

  setDisabled(disabledDirs: Set<NavDirection>): void {
    for (const [dir, button] of this.buttons) {
      button.disabled = disabledDirs.has(dir);
    }
  }

  destroy(): void {
    this.el.remove();
  }
}
