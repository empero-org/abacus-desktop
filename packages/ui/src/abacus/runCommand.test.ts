import { describe, expect, it } from "vitest";
import { runnable, typedCommand } from "./runCommand.js";

describe("runnable", () => {
  it("runs shell blocks, and only those", () => {
    for (const language of [
      "bash",
      "sh",
      "shell",
      "zsh",
      "fish",
      "powershell",
      "PowerShell",
      "pwsh",
    ]) {
      expect(runnable(language)).toBe(true);
    }
    for (const language of ["", "console", "python", "rust", "text", "json"]) {
      expect(runnable(language)).toBe(false);
    }
  });
});

describe("typedCommand", () => {
  it("types the command and Enter", () => {
    expect(typedCommand("ls -la\n", false)).toBe("ls -la\r");
  });

  it("pastes several lines as one, in brackets when the shell asked", () => {
    expect(typedCommand("cd web\nnpm test", true)).toBe("\x1b[200~cd web\rnpm test\x1b[201~\r");
    expect(typedCommand("cd web\r\nnpm test", false)).toBe("cd web\rnpm test\r");
  });

  it("cannot close the paste early", () => {
    expect(typedCommand("echo \x1b[201~rm -rf x", true)).toBe(
      "\x1b[200~echo [201~rm -rf x\x1b[201~\r",
    );
  });
});
