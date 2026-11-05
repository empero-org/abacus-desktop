// What Enter does in the composer. Alone it sends; with Shift, Ctrl or Alt it
// starts a new line, as in the terminal. A textarea only breaks the line for
// Shift+Enter by itself, so every new line goes in the same way.

interface EnterKey {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** An input method is still composing: Enter confirms its text. */
  isComposing: boolean;
}

/** "send", "newline", or null for a key the composer leaves alone. */
export function enterAction(event: EnterKey): "send" | "newline" | null {
  if (event.key !== "Enter" || event.isComposing) return null;
  return event.shiftKey || event.ctrlKey || event.altKey ? "newline" : "send";
}

/** Type a line break at the caret as typing would, so it can be undone and the draft follows. */
export function insertLine(field: HTMLTextAreaElement): void {
  if (document.execCommand("insertText", false, "\n")) return;
  field.setRangeText("\n", field.selectionStart, field.selectionEnd, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
