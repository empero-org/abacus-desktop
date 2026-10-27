// Messages typed while abacus works wait above the composer, stacked, oldest
// first. When the turn ends the oldest goes as the next turn; Steer hands one
// to the running turn, where it stays in the stack until the model reads it;
// Send now stops the turn and sends one. These are the rules, apart from the
// store so they can be tested.

import type { Attachment } from "./attachments.js";

export interface QueuedMessage {
  id: number;
  text: string;
  attachments: Attachment[];
  /** Once steered: the text the app server knows it by, until the model reads it. */
  steering?: string;
}

/** The message that goes next as a turn of its own: the oldest not already steering. */
export function nextQueued(queue: QueuedMessage[]): QueuedMessage | undefined {
  return queue.find((message) => message.steering === undefined);
}

/** The stack once the model has read the steering message the app server calls `text`. */
export function withoutDelivered(queue: QueuedMessage[], text: string): QueuedMessage[] {
  const index = queue.findIndex((message) => message.steering === text);
  return index === -1 ? queue : [...queue.slice(0, index), ...queue.slice(index + 1)];
}

/**
 * Whether a turn that ended this way sends the next queued message. A turn
 * the person stopped, or one that failed, leaves them waiting; and when the
 * app server goes on with a steering message the turn did not reach, that
 * comes first.
 */
export function sendsQueued(status: string | null, continues: boolean | undefined): boolean {
  return !continues && (status === "completed" || status === "stepLimit");
}

/** The draft with a queued message brought back to be edited. */
export function draftWith(draft: string, text: string): string {
  return draft.trim() ? `${draft.trimEnd()}\n${text}` : text;
}

/** A queued message on its one line: its text, and what it attaches. */
export function queuedLabel(message: QueuedMessage): string {
  const text = message.text.trim().replace(/\s+/g, " ");
  const count = message.attachments.length;
  if (count === 0) return text;
  const attached = count === 1 ? "1 attachment" : `${count} attachments`;
  return text ? `${text} · ${attached}` : attached;
}
