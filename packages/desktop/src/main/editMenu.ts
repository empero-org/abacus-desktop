// The right-click menu Electron does not provide: cut, copy and paste in a
// field, copy over selected text, copy link over a link, and the spell
// checker's suggestions over a misspelled word. The app window and every page
// of the browser get it.

import {
  clipboard,
  Menu,
  type ContextMenuParams,
  type MenuItemConstructorOptions,
  type WebContents,
} from "electron";

type Params = Pick<
  ContextMenuParams,
  | "isEditable"
  | "selectionText"
  | "linkURL"
  | "misspelledWord"
  | "dictionarySuggestions"
  | "editFlags"
>;

interface Actions {
  replaceMisspelling(word: string): void;
  learn(word: string): void;
  copyLink(url: string): void;
}

/** The menu for a right click described by `params`; empty where there is nothing to offer. */
export function editMenuItems(params: Params, actions: Actions): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  const separate = () => {
    if (items.length > 0 && items.at(-1)?.type !== "separator") items.push({ type: "separator" });
  };
  if (params.isEditable && params.misspelledWord) {
    const suggestions = params.dictionarySuggestions.slice(0, 5);
    for (const suggestion of suggestions) {
      items.push({ label: suggestion, click: () => actions.replaceMisspelling(suggestion) });
    }
    if (suggestions.length === 0) items.push({ label: "No suggestions", enabled: false });
    items.push({
      label: `Add “${params.misspelledWord}” to the dictionary`,
      click: () => actions.learn(params.misspelledWord),
    });
    separate();
  }
  if (params.linkURL) {
    items.push({ label: "Copy link", click: () => actions.copyLink(params.linkURL) });
    separate();
  }
  if (params.isEditable) {
    items.push(
      { role: "cut", enabled: params.editFlags.canCut },
      { role: "copy", enabled: params.editFlags.canCopy },
      { role: "paste", enabled: params.editFlags.canPaste },
      { type: "separator" },
      { role: "selectAll", enabled: params.editFlags.canSelectAll },
    );
  } else if (params.selectionText.trim()) {
    items.push({ role: "copy" });
  }
  while (items.at(-1)?.type === "separator") items.pop();
  return items;
}

/** Show the edit menu on a right click in `contents`. */
export function editWithRightClick(contents: WebContents): void {
  contents.on("context-menu", (_event, params) => {
    const items = editMenuItems(params, {
      replaceMisspelling: (word) => contents.replaceMisspelling(word),
      learn: (word) => contents.session.addWordToSpellCheckerDictionary(word),
      copyLink: (url) => clipboard.writeText(url),
    });
    if (items.length > 0) Menu.buildFromTemplate(items).popup();
  });
}
