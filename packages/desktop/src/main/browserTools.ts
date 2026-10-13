// The tools the window lends the agent to drive its browser. The app server
// lists them to the model and calls back with `tool/call`; they run here
// against the active tab, where the person can watch.

import type { WebContents } from "electron";
import type { Browser } from "./browser.js";

const LOAD_TIMEOUT_MS = 20_000;
const SCREENSHOT_WIDTH = 1280;

const element = {
  ref: { type: "integer", description: "The element's number from browser_read_page." },
  element: {
    type: "string",
    description: "What the element is, in a few words (shown to the person).",
  },
};

/** The tool definitions, as `tools/register` takes them. */
export const BROWSER_TOOLS = [
  {
    name: "browser_navigate",
    description:
      "Open a URL in the browser in the Abacus desktop app, where the person can watch. Opens a tab when none is open. Returns the page title and URL; read it with browser_read_page.",
    needsApproval: false,
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The address, e.g. https://example.com or localhost:5173.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_read_page",
    description:
      "Read the browser's current page: title, URL, scroll position, the interactive elements numbered for browser_click and browser_type, and the visible text.",
    needsApproval: false,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "browser_click",
    description:
      "Click an element by its number from browser_read_page. Read the page again afterwards: numbers change.",
    needsApproval: true,
    parameters: { type: "object", properties: element, required: ["ref"] },
  },
  {
    name: "browser_type",
    description:
      "Type text into an input, textarea or editable element by its number, replacing what is there. submit=true presses Enter afterwards.",
    needsApproval: true,
    parameters: {
      type: "object",
      properties: { ...element, text: { type: "string" }, submit: { type: "boolean" } },
      required: ["ref", "text"],
    },
  },
  {
    name: "browser_press_key",
    description:
      "Press a key in the page: Enter, Tab, Escape, Backspace, Space, the arrows, PageUp, PageDown, Home or End.",
    needsApproval: true,
    parameters: {
      type: "object",
      properties: {
        key: {
          type: "string",
          enum: [
            "Enter",
            "Tab",
            "Escape",
            "Backspace",
            "Space",
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "PageUp",
            "PageDown",
            "Home",
            "End",
          ],
        },
      },
      required: ["key"],
    },
  },
  {
    name: "browser_scroll",
    description: "Scroll the page up or down by a number of screens (default one).",
    needsApproval: false,
    parameters: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down"] },
        amount: { type: "number" },
      },
      required: ["direction"],
    },
  },
  {
    name: "browser_back",
    description: "Go back to the previous page.",
    needsApproval: false,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "browser_screenshot",
    description:
      "Take a screenshot of the visible page. It is shown to you as an image, for models that accept images.",
    needsApproval: false,
    parameters: { type: "object", properties: {} },
  },
] as const;

export function isBrowserTool(name: unknown): boolean {
  return typeof name === "string" && BROWSER_TOOLS.some((tool) => tool.name === name);
}

export interface ToolAnswer {
  content: string;
  images?: string[];
}

/** Run one browser tool; failures come back as text the model can react to. */
export async function runBrowserTool(
  browser: Browser,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolAnswer> {
  browser.setAgent(true);
  try {
    return await run(browser, name, args);
  } catch (error) {
    return { content: `Error: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    browser.setAgent(false);
  }
}

async function run(
  browser: Browser,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolAnswer> {
  switch (name) {
    case "browser_navigate": {
      const url = String(args.url ?? "");
      if (!url) throw new Error("url is required");
      const page = browser.page();
      const id = browser.state().active!;
      browser.navigate(id, url);
      await settled(page);
      return { content: where(page) };
    }
    case "browser_read_page":
      return { content: format(await browser.page().executeJavaScript(READ_PAGE)) };
    case "browser_click": {
      const page = browser.page();
      const target = await locate(page, args.ref);
      click(page, target.x, target.y);
      await settled(page, 600);
      return { content: `Clicked [${String(args.ref)}] ${target.label}. ${where(page)}` };
    }
    case "browser_type": {
      const page = browser.page();
      const target = await locate(page, args.ref);
      click(page, target.x, target.y);
      // Replace what is there, the way a person selects all and types.
      await page.executeJavaScript(`(() => {
        const el = document.querySelector('[data-abacus-ref="${Number(args.ref)}"]');
        if (el && "select" in el) el.select();
        else if (el?.isContentEditable) document.execCommand("selectAll");
      })()`);
      await page.insertText(String(args.text ?? ""));
      if (args.submit) {
        key(page, "Enter");
        await settled(page, 600);
      }
      return {
        content: `Typed into [${String(args.ref)}] ${target.label}${args.submit ? " and pressed Enter" : ""}. ${where(page)}`,
      };
    }
    case "browser_press_key": {
      const page = browser.page();
      key(page, String(args.key ?? ""));
      await settled(page, 300);
      return { content: `Pressed ${String(args.key)}. ${where(page)}` };
    }
    case "browser_scroll": {
      const sign = args.direction === "up" ? -1 : 1;
      const screens = Math.min(10, Math.max(0.1, Number(args.amount ?? 1) || 1));
      const position: { y: number; height: number; viewport: number } = await browser
        .page()
        .executeJavaScript(
          `(() => { scrollBy(0, ${sign * screens} * innerHeight * 0.85); return { y: Math.round(scrollY), height: document.documentElement.scrollHeight, viewport: innerHeight }; })()`,
        );
      return {
        content: `Scrolled ${args.direction}: at ${position.y}px of ${position.height}px (viewport ${position.viewport}px).`,
      };
    }
    case "browser_back": {
      const page = browser.page();
      if (!page.navigationHistory.canGoBack())
        return { content: `There is no page to go back to. ${where(page)}` };
      page.navigationHistory.goBack();
      await settled(page);
      return { content: where(page) };
    }
    case "browser_screenshot": {
      const page = browser.page();
      let image = await page.capturePage();
      const { width } = image.getSize();
      if (width > SCREENSHOT_WIDTH) image = image.resize({ width: SCREENSHOT_WIDTH });
      const size = image.getSize();
      return {
        content: `Screenshot of ${where(page)} (${size.width}x${size.height})`,
        images: [`data:image/jpeg;base64,${image.toJPEG(82).toString("base64")}`],
      };
    }
    default:
      throw new Error(`unknown browser tool ${name}`);
  }
}

function where(page: WebContents): string {
  const title = page.getTitle();
  return `Now at ${title ? `"${title}" ` : ""}(${page.getURL() || "about:blank"}).`;
}

/** Wait for the page to finish loading, or `quiet` ms when nothing starts loading. */
function settled(page: WebContents, quiet = 150): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(limit);
      page.removeListener("did-stop-loading", finish);
      resolve();
    };
    const limit = setTimeout(finish, LOAD_TIMEOUT_MS);
    page.on("did-stop-loading", finish);
    setTimeout(() => {
      if (!page.isLoading()) finish();
    }, quiet);
  });
}

async function locate(
  page: WebContents,
  ref: unknown,
): Promise<{ x: number; y: number; label: string }> {
  const number = Number(ref);
  if (!Number.isInteger(number))
    throw new Error("ref must be an element number from browser_read_page");
  const target = await page.executeJavaScript(`(() => {
    const el = document.querySelector('[data-abacus-ref="${number}"]');
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    const label = (el.getAttribute("aria-label") || el.innerText || el.value || el.placeholder || el.tagName).trim().replace(/\\s+/g, " ").slice(0, 60);
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), label: JSON.stringify(label) };
  })()`);
  if (!target)
    throw new Error(`no element [${number}] on this page; read the page again for current numbers`);
  return target;
}

function click(page: WebContents, x: number, y: number): void {
  page.sendInputEvent({ type: "mouseMove", x, y });
  page.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
  page.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
}

const KEY_CODES: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

function key(page: WebContents, name: string): void {
  const keyCode = KEY_CODES[name] ?? name;
  page.sendInputEvent({ type: "keyDown", keyCode });
  // Enter and Space also produce a character, which is what forms listen for.
  if (name === "Enter") page.sendInputEvent({ type: "char", keyCode: "\r" });
  if (name === "Space") page.sendInputEvent({ type: "char", keyCode: " " });
  page.sendInputEvent({ type: "keyUp", keyCode });
}

interface PageRead {
  title: string;
  url: string;
  text: string;
  truncated: boolean;
  elements: string[];
  scroll: { y: number; height: number; viewport: number };
}

function format(page: PageRead): string {
  const lines = [
    `Title: ${page.title || "(none)"}`,
    `URL: ${page.url}`,
    `Scrolled to ${page.scroll.y}px of ${page.scroll.height}px (viewport ${page.scroll.viewport}px)`,
    "",
    page.elements.length
      ? "Interactive elements (their numbers work with browser_click and browser_type):"
      : "No interactive elements in view.",
    ...page.elements,
    "",
    "Text:",
    page.text || "(no text)",
  ];
  if (page.truncated) lines.push("…(text cut short; scroll and read again for more)");
  return lines.join("\n");
}

/** Numbers the page's interactive elements and reads its text, in the page. */
const READ_PAGE = `(() => {
  const MAX_TEXT = 12000, MAX_ELEMENTS = 200;
  for (const el of document.querySelectorAll("[data-abacus-ref]")) el.removeAttribute("data-abacus-ref");
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const selector = "a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=radio], [role=switch], [contenteditable=true]";
  const elements = [];
  let n = 0;
  for (const el of document.querySelectorAll(selector)) {
    if (elements.length >= MAX_ELEMENTS) break;
    if (!visible(el) || el.disabled) continue;
    n += 1;
    el.setAttribute("data-abacus-ref", String(n));
    const tag = el.tagName.toLowerCase();
    const kind = el.getAttribute("role") || (tag === "a" ? "link" : tag === "input" ? (el.type || "text") + " input" : tag);
    const label = (el.getAttribute("aria-label") || el.innerText || el.value || el.placeholder || el.title || el.name || el.alt || "")
      .trim().replace(/\\s+/g, " ").slice(0, 80);
    const link = tag === "a" ? " -> " + (el.getAttribute("href") || "").slice(0, 100) : "";
    elements.push("[" + n + "] " + kind + ' "' + label + '"' + link);
  }
  const text = (document.body ? document.body.innerText : "").replace(/\\n{3,}/g, "\\n\\n").trim();
  return {
    title: document.title,
    url: location.href,
    text: text.slice(0, MAX_TEXT),
    truncated: text.length > MAX_TEXT,
    elements,
    scroll: { y: Math.round(scrollY), height: document.documentElement.scrollHeight, viewport: innerHeight },
  };
})()`;
