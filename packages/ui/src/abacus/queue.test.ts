import { describe, expect, it } from "vitest";
import type { Attachment } from "./attachments.js";
import {
  draftWith,
  nextQueued,
  queuedLabel,
  sendsQueued,
  withoutDelivered,
  type QueuedMessage,
} from "./queue.js";

describe("queued messages", () => {
  it("go when a turn finishes, and wait when it was stopped or failed", () => {
    expect(sendsQueued("completed", false)).toBe(true);
    expect(sendsQueued("stepLimit", undefined)).toBe(true);
    expect(sendsQueued("interrupted", false)).toBe(false);
    expect(sendsQueued("failed", false)).toBe(false);
  });

  it("wait while the app server goes on with a steer the turn did not reach", () => {
    expect(sendsQueued("completed", true)).toBe(false);
  });

  it("go in order, past any that are already steering", () => {
    const queue: QueuedMessage[] = [
      { id: 1, text: "hi", attachments: [], steering: "hi" },
      { id: 2, text: "check the reviews", attachments: [] },
    ];
    expect(nextQueued(queue)?.id).toBe(2);
    expect(nextQueued(queue.slice(0, 1))).toBeUndefined();
  });

  it("leave the stack once the model reads them, one at a time", () => {
    const queue: QueuedMessage[] = [
      { id: 1, text: "again", attachments: [], steering: "again" },
      { id: 2, text: "again", attachments: [] },
      { id: 3, text: "again", attachments: [], steering: "again" },
    ];
    expect(withoutDelivered(queue, "again").map((message) => message.id)).toEqual([2, 3]);
    expect(withoutDelivered(queue, "other")).toBe(queue);
  });

  it("come back to the draft below what is there", () => {
    expect(draftWith("", "fix the parser")).toBe("fix the parser");
    expect(draftWith("  ", "fix the parser")).toBe("fix the parser");
    expect(draftWith("and the tests\n", "fix the parser")).toBe("and the tests\nfix the parser");
  });

  it("read as one line, with what they attach", () => {
    const file = { id: "a" } as Attachment;
    expect(queuedLabel({ id: 1, text: "fix\n the   parser", attachments: [] })).toBe(
      "fix the parser",
    );
    expect(queuedLabel({ id: 2, text: "look", attachments: [file] })).toBe("look · 1 attachment");
    expect(queuedLabel({ id: 3, text: "", attachments: [file, file] })).toBe("2 attachments");
  });
});
