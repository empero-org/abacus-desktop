// The agent's markdown: code with highlighting, math, mermaid, tables. Links
// to the web open in the browser; anything else stays plain text, because a
// model-written href is not something to follow blindly. A shell block can
// be run in the terminal pane (runCommand).

import {
  isValidElement,
  memo,
  useMemo,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from "react";
import { PlayIcon } from "lucide-react";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import {
  CodeBlock,
  CodeBlockCopyButton,
  defaultComponents,
  defaultRemarkPlugins,
  Streamdown,
  useIsCodeFenceIncomplete,
} from "streamdown";
import type { Pluggable } from "unified";
import { cn } from "@/components/lib/utils.js";
import { runnable, useRunCommand } from "../runCommand.js";

// Math only between `$$`: a coding agent writes "$0 and $8/month" and "$HOME
// or $PATH" far more often than `$x$`, and single dollars turned those into
// formulas.
const plugins = { code, math: createMathPlugin({ singleDollarTextMath: false }), mermaid };

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

type CodeProps = ComponentProps<"code"> & { node?: unknown; "data-block"?: unknown };

const DefaultCode = defaultComponents.code as ComponentType<CodeProps>;

/** A fenced block in a shell's language, where there is a terminal, gets Run; the rest render as ever. */
function Code(props: CodeProps) {
  const run = useRunCommand();
  const language = /language-(\S+)/.exec(props.className ?? "")?.[1] ?? "";
  if (!run || !("data-block" in props) || !runnable(language)) return <DefaultCode {...props} />;
  return (
    <ShellBlock
      language={language}
      className={props.className}
      run={run}
      text={codeText(props.children)}
    />
  );
}

function ShellBlock({
  language,
  className,
  run,
  text,
}: {
  language: string;
  className: string | undefined;
  run: (command: string) => void;
  text: string;
}) {
  // Half a command is not one to run.
  const incomplete = useIsCodeFenceIncomplete();
  return (
    <CodeBlock
      className={className}
      code={text}
      language={language}
      isIncomplete={incomplete}
      lineNumbers={false}
    >
      <button
        type="button"
        onClick={() => run(text)}
        disabled={incomplete}
        title="Run in the terminal"
        aria-label="Run in the terminal"
        className="cursor-pointer p-1 text-muted-foreground transition-all hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlayIcon aria-hidden="true" size={14} />
      </button>
      <CodeBlockCopyButton />
    </CodeBlock>
  );
}

/** The text of a block, as Streamdown hands it over: a string, or one element holding it. */
function codeText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (
    isValidElement<{ children?: unknown }>(children) &&
    typeof children.props.children === "string"
  ) {
    return children.props.children;
  }
  return "";
}

const components = { a: Link, code: Code };

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
        // A long URL, path or identifier breaks rather than pushing the whole
        // conversation sideways in a narrow window. A table scrolls on its
        // own, so its cells keep their words whole.
        "abacus-markdown text-ui-base leading-[1.7] [overflow-wrap:anywhere] [&_table]:[overflow-wrap:normal] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
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
