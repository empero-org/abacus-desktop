import { describe, expect, it } from "vitest";
import { toUrl } from "./browser.js";
import { BROWSER_TOOLS, isBrowserTool } from "./browserTools.js";

describe("the address bar", () => {
  it("keeps a URL, gives a host a scheme, and searches anything else", () => {
    expect(toUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(toUrl("example.com")).toBe("https://example.com");
    expect(toUrl("docs.rs/serde/latest")).toBe("https://docs.rs/serde/latest");
    expect(toUrl("localhost:5173")).toBe("http://localhost:5173");
    expect(toUrl("127.0.0.1:8080/health")).toBe("http://127.0.0.1:8080/health");
    expect(toUrl("rust borrow checker")).toBe("https://duckduckgo.com/?q=rust%20borrow%20checker");
    expect(toUrl("  ")).toBe("about:blank");
    expect(toUrl("about:blank")).toBe("about:blank");
  });
});

describe("the browser tools", () => {
  it("are named for the browser and ask before acting on a page", () => {
    expect(BROWSER_TOOLS.every((tool) => tool.name.startsWith("browser_"))).toBe(true);
    const asks = BROWSER_TOOLS.filter((tool) => tool.needsApproval).map((tool) => tool.name);
    expect(asks).toEqual(["browser_click", "browser_type", "browser_press_key"]);
    expect(isBrowserTool("browser_read_page")).toBe(true);
    expect(isBrowserTool("read_file")).toBe(false);
    expect(isBrowserTool(undefined)).toBe(false);
  });
});
