// The agent's markdown: code with highlighting, math, mermaid, tables. Links
// to the web open in the browser; anything else stays plain text, because a
// model-written href is not something to follow blindly.

import { memo, useMemo, type ComponentProps } from "react";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { defaultRemarkPlugins, Streamdown } from "streamdown";
import type { Pluggable } from "unified";
import { cn } from "@/components/lib/utils.js";

// `$x$` inline math is common in answers; the plugin only does `$$` by default.
const plugins = { code, math: createMathPlugin({ singleDollarTextMath: true }), mermaid };

// GFM's single-tilde strikethrough turns "~5 min to ~10 min" into struck text.
// Only `~~text~~` strikes.
const remarkPlugins = Object.entries(defaultRemarkPlugins).map(([name, plugin]): Pluggable => {
  if (name !== "gfm") return plugin;
  if (Array.isArray(plugin)) {
    const [attacher, options] = plugin;
    return [attacher, { ...(typeof options === "object" ? options : {}), singleTilde: false }];
  }
  return typeof plugin === "function" ? [plugin, { singleTilde: false }] : plugin;
});

const controls = { table: { fullscreen: false } } as const;
const linkSafety = { enabled: false } as const;

export function isWebUrl(href: string | undefined): href is string {
  if (!href) return false;
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

function Link({
  href,
  children,
  className,
  node: _node,
  ...props
}: ComponentProps<"a"> & { node?: unknown }) {
  if (!isWebUrl(href)) return <span className={className}>{children}</span>;
  return (
    <a
      {...props}
      href={href}
      title={href}
      onClick={(event) => {
        event.preventDefault();
        void window.abacus?.openExternal(href);
      }}
      className="font-medium text-brand underline decoration-brand/40 underline-offset-[3px] hover:decoration-brand"
    >
      {children}
    </a>
  );
}

const components = { a: Link };

export const Markdown = memo(function Markdown({
  children,
  streaming = false,
  className,
}: {
  children: string;
  streaming?: boolean;
  className?: string;
}) {
  const shikiTheme = useMemo(
    () => ["github-light", "github-dark-default"] as ["github-light", "github-dark-default"],
    [],
  );
  return (
    <Streamdown
      className={cn(
        "abacus-markdown text-ui-base leading-[1.7] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      // Finished text renders static: streaming mode's repair of unclosed
      // markdown misreads things like `./src/**/*` once the text is complete.
      mode={streaming ? "streaming" : "static"}
      parseIncompleteMarkdown={streaming}
      plugins={plugins}
      remarkPlugins={remarkPlugins}
      components={components}
      controls={controls}
      linkSafety={linkSafety}
      shikiTheme={shikiTheme}
      animated={false}
      isAnimating={false}
    >
      {children}
    </Streamdown>
  );
});
