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
  type ThreadSnapshot,
  type Notifications,
  type ThreadSummary,
} from "./protocol.js";
import { isAttachableImage, readAttachment } from "./attachments.js";
import { mergeCommands } from "./completion.js";
import { addPending, applyNotification, resolvePending, threadFromSnapshot } from "./thread.js";
import { serverLists } from "./lists.js";
import { messageActions } from "./messageActions.js";
import { profileActions } from "./profileActions.js";

import type { AbacusState } from "./state.js";

export type { AbacusState, Notice, Phase } from "./state.js";

let noticeCounter = 0;
// Messages from other sessions held for the person are news, not a problem.
const INFO_NOTICE = /^(steering|noted|mode) —|^(A message|\d+ messages) from /;
let unsubscribe: (() => void) | null = null;

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Electron prefixes errors thrown in the main process; the person needs only the reason.
  return message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, "");
}

export function createAbacusStore(bridge: AbacusBridge) {
  return create<AbacusState>((set, get) => {
    const { refreshProfiles, refreshPresets, refreshCommands, refreshTasks } = serverLists(
      bridge,
      get,
      set,
    );
    const guard = async (work: () => Promise<void>) => {
      try {
        await work();
      } catch (error) {
        get().notify(errorMessage(error), "error");
      }
    };
    // As `guard`, for the actions whose result the caller goes on with.
    const attempt = async <T>(work: () => Promise<T>): Promise<T | null> => {
      try {
        return await work();
      } catch (error) {
        get().notify(errorMessage(error), "error");
        return null;
      }
    };

    const applyConfig = (result: ConfigValueResult) => {
      if (result.needsSetup !== undefined) set({ needsSetup: result.needsSetup });
      if (result.idleCompaction !== undefined) set({ idleCompaction: result.idleCompaction });
      const thread = get().thread;
      if (!thread) return;
      set({
        thread: {
          ...thread,
          profile: result.profile,
          model: result.model,
          mode: result.mode,
          reasoningEffort: result.reasoningEffort,
          contextWindow: result.contextWindow ?? thread.contextWindow,
        },
      });
    };

    const helpers = { guard, attempt, applyConfig, refreshProfiles, errorMessage };
    const messages = messageActions(bridge, get, set, guard);

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
      if (message.method === "thread/profile/updated") {
        // Which profile is active, or what it runs, changed: here or in a
        // method this window called.
        const update = message.params as ConfigValueResult;
        if (update.needsSetup !== undefined) set({ needsSetup: update.needsSetup });
        if (update.idleCompaction !== undefined) set({ idleCompaction: update.idleCompaction });
        void refreshProfiles();
      }
      const thread = get().thread;
      if (thread) set({ thread: applyNotification(thread, message.method, message.params) });
      if (message.method === "turn/completed") {
        void messages.flushQueued(message.params as Notifications["turn/completed"]);
      }
      if (message.method === "turn/steer/delivered") {
        messages.delivered(message.params as Notifications["turn/steer/delivered"]);
      }
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
      needsSetup: false,
      idleCompaction: true,
      profiles: [],
      providers: [],
      presets: [],
      catalogs: {},
      notices: [],
      crash: null,
      drafts: {},
      attachments: {},
      queued: {},
      sendingNow: {},
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
          queued: {},
          sendingNow: {},
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
            needsSetup: init.needsSetup ?? false,
            idleCompaction: init.idleCompaction ?? true,
            catalogs: {},
            thread: threadFromSnapshot(init.thread),
            phase: "ready",
          });
          await Promise.all([
            get().refreshThreads(),
            refreshProfiles(),
            refreshPresets(),
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

      forkThread: (threadId) =>
        guard(async () => {
          const params = threadId ? { threadId } : {};
          const snapshot = await bridge.request<ThreadSnapshot>("thread/fork", params);
          set({ thread: threadFromSnapshot(snapshot), view: "chat" });
          // The fork is in this project, whose sessions the thread list holds.
          await get().refreshThreads();
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

      ...messages.actions,

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

      ...profileActions(bridge, get, set, helpers),
      refreshProfiles,

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
      setIdleCompaction: (enabled) =>
        guard(async () =>
          applyConfig(
            await bridge.request<ConfigValueResult>("config/value/write", {
              key: "idle_compaction",
              value: enabled,
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
  });
}

export type AbacusStore = ReturnType<typeof createAbacusStore>;
