# 入链出链标题 Ctrl 悬停预览设计

## 背景

入链/出链弹窗目前支持点击标题打开笔记，但普通悬停没有预览能力。目标是在按住 Ctrl 的鼠标悬停期间，直接调用 Obsidian 原生 Page Preview 预览对应笔记，同时保留现有点击和键盘交互。

## 目标

- 仅在入链/出链弹窗中的已解析笔记标题上启用预览。
- 只有鼠标指针并按住 Ctrl 时触发预览。
- 使用 Obsidian 原生 `hover-link` 事件和 Page Preview，复用主题、定位和生命周期。
- 移动到另一个标题时切换预览，普通悬停不触发预览。
- 未解析出链、画布卡片标题和现有点击/键盘行为保持不变。

## 非目标

- 不自行渲染 Markdown 预览浮层。
- 不改变链接弹窗的布局、点击导航或入链/出链数据来源。
- 不为移动端触摸交互增加预览手势。

## 设计

### Page Preview 注册

在 `ZkShowPlugin.onload` 中注册 `zk-show` hover-link 来源，显示名称使用插件名称，并将 `defaultMod` 设为 `true`。这样 Page Preview 核心插件知道该来源使用修饰键触发。

### 标题事件

在 `ZkShowView` 中增加一个绑定辅助函数，为已解析条目的标题 `span.zk-show-link-item-label` 监听 `pointerover`、`pointermove` 和 `pointerout`：

- `pointerover`/`pointermove` 仅接受 `pointerType === "mouse" && ctrlKey`；
- 同一标题和路径只触发一次 `workspace.trigger("hover-link", ...)`；
- 事件载荷包含 `source: "zk-show"`、标题元素、目标路径、当前活动笔记路径和视图作为 `hoverParent`；
- `pointerout` 清除去重状态，让下一次进入或切换标题可以重新触发。

视图提供 `hoverPopover: HoverPopover | null` 属性，以满足 Obsidian `HoverParent` 约定并复用同一个预览生命周期。

### 条目接入

出链条目使用 `link.path`；入链条目使用 `backlink.path`。标题元素与条目点击容器分开绑定，因此预览只作用于标题文字，不改变整行点击打开笔记的行为。未解析出链不绑定事件。

## 验证

1. 增加纯逻辑测试，确认只有鼠标 + Ctrl 才满足触发条件，触摸、普通鼠标和未按 Ctrl 均不触发。
2. 运行完整 Vitest 测试。
3. 运行生产构建，确认 `registerHoverLinkSource` 和 `workspace.trigger` 类型检查通过。
4. 在 Obsidian 中检查普通 hover、Ctrl+hover、切换标题、离开标题、未解析出链和点击打开路径。

## 风险与处理

若用户关闭 Page Preview 核心插件，`hover-link` 事件仍会被触发，但不会出现预览窗口；链接弹窗本身仍可正常使用。事件去重避免鼠标移动造成重复触发，切换标题时通过目标元素和路径变化重新触发。
