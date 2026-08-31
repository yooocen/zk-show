import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("real preview hidden hint popover payload", () => {
  it("includes marker metadata and hidden node codes for 1/11", () => {
    execFileSync(process.execPath, ["scripts/gen-real-preview.mjs"], { stdio: "ignore" });
    const html = readFileSync("preview-real.html", "utf8");
    const section = html.match(/<h2>查看 1\/11（[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(section).toContain("data-hint-id");
    expect(section).toContain("隐藏连续内容");
    expect(section).toContain("1/11a");
    expect(html).toContain("zk-show-hint-popover");
  });
});
