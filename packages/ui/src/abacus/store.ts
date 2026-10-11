// The window's state and the actions that change it.
//
// One window drives one `abacus app-server`. The store owns the session's
// lifecycle (no workspace, connecting, ready, crashed), the thread list, and
// the open thread, and every action goes through the bridge. Rendering never
// talks to the bridge directly.

import { create } from "zustand";
import type { AbacusBridge, ServerMessage } from "./bridge.js";
import {
  classifyRequest,
  type BackgroundTask,
  type ConfigValueResult,
  type InitializeResult,
  type Item,
  type ModelEntry,
  type ThreadSnapshot,
  type ThreadSummary,
} from "./protocol.js";
import { inputPart, isAttachableImage, readAttachment, type Attachment } from "./attachments.js";
import { mergeCommands, parseCommand, type CommandEntry } from "./completion.js";
import { addPending, applyNotification, resolvePending, threadFromSnapshot } from "./thread.js";
import { runWindowCommand } from "./windowCommands.js";

import type { AbacusState } from "./state.js";

export type { AbacusState, Notice, Phase } from "./state.js";

let noticeCounter = 0;
const INFO_NOTICE = /^(tethered|steering|noted|refine|mode) —/;
let unsubscribe: (() => void) | null = null;

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Electron prefixes errors thrown in the main process; the person needs only the reason.
  return message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, "");
}

export function createAbacusStore(bridge: AbacusBridge) {
  return create<AbacusState>((set, get) => {
    const guard = async (work: () => Promise<void>) => {
      try {
        await work();
      } catch (error) {
        get().notify(errorMessage(error), "error");
      }
    };

    const applyConfig = (result: ConfigValueResult) => {
      const thread = get().thread;
      if (!thread) return;
      set({
        thread: {
          ...thread,
          model: result.model,
          mode: result.mode,
          autoApprove: result.autoApprove,
          reasoningEffort: result.reasoningEffort,
        },
      });
    };

    const onMessage = (message: ServerMessage) => {
      if (message.kind === "exit") {
        set({ phase: "crashed", crash: { code: message.code, tail: message.tail } });
        return;
      }
      if (message.kind === "request") {
        const request = classifyRequest(message.id, message.method, message.params);
        const thread = get().thread;
        if (!request || !thread) {
          // Never leave the agent blocked on something this window cannot show.
          void bridge.respond(
            message.id,
            message.method === "tool/requestUserInput" ? { selected: [] } : { decision: "decline" },
          );
          return;
        }
        set({ thread: addPending(thread, request) });
        return;
      }
      if (message.method === "warning") {
        const text = (message.params as { message?: string }).message ?? "warning";
        // The agent's running commentary (what it took the task to be, a
        // steer or note landing) shares this channel with real warnings.
        get().notify(text, INFO_NOTICE.test(text) ? "info" : "warning");
        return;
      }
      if (message.method === "sessions/synced") {
        void get().refreshProjects();
        return;
      }
      if (message.method === "tasks/updated") {
        set({ tasks: (message.params as { tasks: BackgroundTask[] }).tasks });
        return;
      }
      const thread = get().thread;
      if (thread) set({ thread: applyNotification(thread, message.method, message.params) });
      if (message.method === "turn/completed" || message.method === "thread/name/updated") {
        void get().refreshThreads();
        void get().refreshProjects();
      }
    };

    return {
      phase: "booting",
      appInfo: null,
      cli: null,
      recent: [],
      workspace: null,
      serverVersion: null,
      capabilities: {},
      threads: [],
      projects: null,
      thread: null,
      view: "chat",
      models: [],
      notices: [],
      crash: null,
      drafts: {},
      attachments: {},
      commands: mergeCommands([]),
      tasks: [],

      async boot() {
        const [appInfo, recent, launch] = await Promise.all([
          bridge.appInfo(),
          bridge.recentWorkspaces(),
          bridge.launchWorkspace(),
        ]);
        set({ appInfo, cli: appInfo.cli, recent, phase: "welcome" });
        unsubscribe?.();
        unsubscribe = bridge.onMessage(onMessage);
        void get().refreshProjects();
        if (launch && appInfo.cli.state === "ready") await get().openWorkspace(launch);
      },

      async refreshCli() {
        set({ cli: await bridge.detectCli() });
        void get().refreshProjects();
      },

      async pickAndOpen() {
        const path = await bridge.pickWorkspace();
        if (path) await get().openWorkspace(path);
      },

      async openWorkspace(path) {
        set({
          phase: "connecting",
          crash: null,
          thread: null,
          threads: [],
          tasks: [],
          view: "chat",
        });
        try {
          const workspace = await bridge.openWorkspace(path);
          const init = await bridge.request<InitializeResult>("initialize", {
            clientInfo: { name: "abacus-desktop", version: get().appInfo?.version ?? "0.0.0" },
          });
          set({
            workspace,
            serverVersion: init.serverInfo.version,
            capabilities: init.capabilities ?? {},
            thread: threadFromSnapshot(init.thread),
            phase: "ready",
          });
          await Promise.all([
            get().refreshThreads(),
            refreshModels(),
            get().refreshProjects(),
            refreshCommands(),
            refreshTasks(),
          ]);
        } catch (error) {
          set({ phase: "welcome", recent: await bridge.recentWorkspaces() });
          get().notify(errorMessage(error), "error");
        }
      },

      async closeWorkspace() {
        await bridge.closeWorkspace();
        set({
          phase: "welcome",
          workspace: null,
          thread: null,
          threads: [],
          recent: await bridge.recentWorkspaces(),
        });
        void get().refreshProjects();
      },

      async forgetWorkspace(path) {
        set({ recent: await bridge.forgetWorkspace(path) });
        void get().refreshProjects();
      },

      async refreshProjects() {
        try {
          set({ projects: await bridge.listProjects() });
        } catch {
          set({ projects: null });
        }
      },

      async openSession(path, threadId) {
        set({ view: "chat" });
        if (get().workspace?.workspace !== path || get().phase !== "ready") {
          await get().openWorkspace(path);
          if (get().phase !== "ready") return;
        }
        await get().openThread(threadId);
      },

      async newThreadIn(path) {
        set({ view: "chat" });
        // A freshly started app server opens on a new thread already.
        if (get().workspace?.workspace !== path || get().phase !== "ready")
          return get().openWorkspace(path);
        await get().newThread();
      },

      setView(view) {
        set({ view });
      },

      newThread: () =>
        guard(async () => {
          const snapshot = await bridge.request<ThreadSnapshot>("thread/start");
          set({ thread: threadFromSnapshot(snapshot), view: "chat" });
        }),

      openThread: (threadId) =>
        guard(async () => {
          set({ view: "chat" });
          if (get().thread?.threadId === threadId) return;
          const snapshot = await bridge.request<ThreadSnapshot>("thread/resume", { threadId });
          set({ thread: threadFromSnapshot(snapshot) });
        }),

      renameThread: (name) =>
        guard(async () => void (await bridge.request("thread/name/set", { name }))),

      async refreshThreads() {
        try {
          const { threads } = await bridge.request<{ threads: ThreadSummary[] }>("thread/list");
          set({ threads });
        } catch {
          // Sessions can be off (`--no-session`); the list is then simply empty.
          set({ threads: [] });
        }
      },

      send: (text) =>
        guard(async () => {
          const thread = get().thread;
          const attached = thread ? (get().attachments[thread.threadId] ?? []) : [];
          if (!thread || (!text.trim() && attached.length === 0)) return;
          const clear = (draft: string, files: Attachment[]) =>
            set({
              drafts: { ...get().drafts, [thread.threadId]: draft },
              attachments: { ...get().attachments, [thread.threadId]: files },
            });
          // The window's own commands act here and start no turn.
          const command = attached.length === 0 ? parseCommand(text) : null;
          if (command && (await runWindowCommand(get(), command.name, command.argument))) {
            clear("", []);
            return;
          }
          clear("", []);
          const input = [
            ...(text.trim() ? [{ type: "text", text }] : []),
            ...attached.map(inputPart),
          ];
          try {
            // While a turn runs, a message steers it instead of queueing a new
            // one; the server decides which applies. Skills, plugin commands
            // and `/btw` are resolved there too.
            await bridge.request("turn/start", { threadId: thread.threadId, input });
          } catch (error) {
            // Nothing was sent: give the person back what they wrote.
            if (
              !get().drafts[thread.threadId] &&
              !(get().attachments[thread.threadId] ?? []).length
            ) {
              clear(text, attached);
            }
            throw error;
          }
        }),

      interrupt: () => guard(async () => void (await bridge.request("turn/interrupt"))),

      answerApproval: (id, decision) =>
        guard(async () => {
          await bridge.respond(id, { decision });
          const thread = get().thread;
          if (thread) set({ thread: resolvePending(thread, id) });
        }),

      answerQuestion: (id, selected, custom) =>
        guard(async () => {
          await bridge.respond(id, custom ? { selected, custom } : { selected });
          const thread = get().thread;
          if (thread) set({ thread: resolvePending(thread, id) });
        }),

      setModel: (model) =>
        guard(async () => {
          applyConfig(
            await bridge.request<ConfigValueResult>("config/value/write", {
              key: "model",
              value: model,
            }),
          );
          await refreshModels();
        }),
      setMode: (mode) =>
        guard(async () =>
          applyConfig(
            await bridge.request<ConfigValueResult>("config/value/write", {
              key: "mode",
              value: mode,
            }),
          ),
        ),
      setReasoningEffort: (effort) =>
        guard(async () =>
          applyConfig(
            await bridge.request<ConfigValueResult>("config/value/write", {
              key: "reasoning_effort",
              value: effort,
            }),
          ),
        ),

      setAutoApprove: (on) =>
        guard(async () =>
          applyConfig(
            await bridge.request<ConfigValueResult>("config/value/write", {
              key: "autoApprove",
              value: on,
            }),
          ),
        ),

      setDraft(threadId, text) {
        set({ drafts: { ...get().drafts, [threadId]: text } });
      },

      async attach(files) {
        const thread = get().thread;
        if (!thread || files.length === 0) return;
        const { imageInput, fileInput } = get().capabilities;
        const usable = files.filter((file) => (isAttachableImage(file) ? imageInput : fileInput));
        if (usable.length < files.length) {
          get().notify(
            "This abacus is too old to take these attachments. Update it, then reopen the project.",
            "warning",
          );
        }
        const read = await Promise.allSettled(
          usable.map((file) => readAttachment(file, bridge.pathForFile(file))),
        );
        const added = read.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        for (const result of read) {
          if (result.status === "rejected") get().notify(errorMessage(result.reason), "warning");
        }
        const current = get().attachments[thread.threadId] ?? [];
        set({ attachments: { ...get().attachments, [thread.threadId]: [...current, ...added] } });
      },

      detach(id) {
        const thread = get().thread;
        if (!thread) return;
        const current = get().attachments[thread.threadId] ?? [];
        set({
          attachments: {
            ...get().attachments,
            [thread.threadId]: current.filter((image) => image.id !== id),
          },
        });
      },

      async searchFiles(query) {
        if (!get().capabilities.fileSearch || get().phase !== "ready") return [];
        try {
          const { files } = await bridge.request<{ files: string[] }>("files/search", {
            query,
            limit: 30,
          });
          return files;
        } catch {
          return [];
        }
      },

      stopTask: (id) => guard(async () => void (await bridge.request("task/stop", { id }))),

      clearTasks: () =>
        guard(async () => {
          const { tasks } = await bridge.request<{ tasks: BackgroundTask[] }>("tasks/clear");
          set({ tasks });
        }),

      async readTask(id) {
        try {
          return await bridge.request<{ task: BackgroundTask; items: Item[] }>("task/read", { id });
        } catch {
          return null;
        }
      },

      compact: () =>
        guard(async () => {
          if (!get().capabilities.compact) {
            get().notify(
              "This abacus is too old to compact from the window. Update it, then reopen the project.",
              "warning",
            );
            return;
          }
          const { before, after } = await bridge.request<{ before: number; after: number }>(
            "thread/compact",
          );
          get().notify(`Compacted the conversation from ${before} to ${after} messages.`);
        }),

      notify(message, tone = "info") {
        const notice = { id: ++noticeCounter, message, tone };
        set({ notices: [...get().notices.slice(-4), notice] });
      },

      dismissNotice(id) {
        set({ notices: get().notices.filter((notice) => notice.id !== id) });
      },
    };

    async function refreshTasks() {
      if (!get().capabilities.tasks) return set({ tasks: [] });
      try {
        const { tasks } = await bridge.request<{ tasks: BackgroundTask[] }>("tasks/list");
        set({ tasks });
      } catch {
        set({ tasks: [] });
      }
    }

    async function refreshCommands() {
      if (!get().capabilities.commands) return set({ commands: mergeCommands([]) });
      try {
        const { commands } = await bridge.request<{ commands: CommandEntry[] }>("commands/list");
        set({ commands: mergeCommands(commands) });
      } catch {
        set({ commands: mergeCommands([]) });
      }
    }

    async function refreshModels() {
      try {
        const { models } = await bridge.request<{ models: ModelEntry[] }>("model/list");
        set({ models });
      } catch {
        // A provider without a model listing still works with the configured model.
        set({ models: [] });
      }
    }
  });
}

export type AbacusStore = ReturnType<typeof createAbacusStore>;
