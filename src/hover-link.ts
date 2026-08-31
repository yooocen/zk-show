export function shouldPreviewLinkOnPointer(event: Pick<PointerEvent, "pointerType" | "ctrlKey">): boolean {
  return event.pointerType === "mouse" && event.ctrlKey;
}
