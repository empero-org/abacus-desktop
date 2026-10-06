<p align="center">
  <img src="packages/desktop/build/icon.png" alt="Abacus" width="128" />
</p>

# Abacus Desktop

A desktop app for [abacus](https://github.com/empero-org/abacus), the coding
agent. It drives the abacus CLI you already have, in a window: your projects
and their sessions in a sidebar, a conversation that streams the agent's
reasoning, tool calls and answers, approvals and questions where you can see
them, the changes a turn made, and a terminal.

The agent itself is the CLI. The app runs `abacus app-server` for the project
you open and talks to it over JSON-RPC, so everything the agent does (models,
providers, tools, skills, plugins, sessions, Abacus Sync) is the CLI's, and a
change made in the app is the change the terminal UI would make.

## Features

- **Projects and sessions.** Every project you have used abacus in, with its
  sessions, including sessions synced from your other devices with Abacus Sync.
  Open one to continue it, or start a new thread.
- **The conversation.** Streaming answers in markdown with highlighted code,
  math and diagrams; reasoning you can fold away; each tool call as one line
  you can open.
- **The composer.** `/` completes commands, skills and plugin commands, `@`
  completes files in the project. Paste, drop or attach images and text files.
  Type while the agent works to steer it, or stop it with Esc.
- **Approvals and questions.** Allow a command or an edit once or for the
  session, or answer the agent's question, right above the composer.
- **Changes.** The diff of the working tree after a turn.
- **Terminal.** Shells in the project, in tabs, under the conversation
  (Ctrl+`).
- **Settings.** Theme, model, reasoning effort, mode, approvals, and your sync
  status.

## Requirements

The app needs the abacus CLI, version 0.6.6 or newer:

```sh
curl -fsSL https://abacus.empero.org/install.sh | sh
```

On Windows, download it from the
[releases](https://github.com/empero-org/abacus/releases/latest). The app looks
for `abacus` in `~/.local/bin`, `~/.cargo/bin`, the usual system locations and
your `PATH`; `ABACUS_BIN` points it at a specific binary.

## Development

You need Node 24.14 or newer and pnpm 10 (`mise install` sets up both).

```sh
pnpm install
pnpm dev                    # the app with hot reload
pnpm dev -- ~/my-project    # ...opened straight into a project
pnpm typecheck
pnpm test
pnpm lint
pnpm package                # installers for this platform, in packages/desktop/dist
```

The repository has two packages:

- `packages/desktop`: the Electron main process (one `abacus app-server` per
  window, the terminals) and the preload bridge.
- `packages/ui`: the window itself, in React. `src/abacus` is the app;
  `src/components` holds the UI primitives it is built from.

## License

Apache License 2.0; see [LICENSE](LICENSE). Abacus Desktop started from
[ZCode](https://github.com/zai-org/ZCode) by Z.ai; see [NOTICE](NOTICE) and
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
