import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@abacus/ui/bridge";
import { AppServer, AppServerError } from "./appServer.js";

describe("AppServer framing", () => {
  it("turns notifications and server requests into frames, and logs garbage", () => {
    const server = new AppServer("abacus", "/tmp");
    const frames: ServerMessage[] = [];
    const logs: string[] = [];
    server.on("frame", (frame) => frames.push(frame));
    server.on("log", (line) => logs.push(line));

    server.handleLine('{"jsonrpc":"2.0","method":"turn/started","params":{"turnId":"t1"}}');
    server.handleLine(
      '{"jsonrpc":"2.0","id":"srv_1","method":"tool/requestUserInput","params":{"question":"?"}}',
    );
    server.handleLine("not json");
    server.handleLine("");

    expect(frames).toEqual([
      { kind: "notification", method: "turn/started", params: { turnId: "t1" } },
      { kind: "request", id: "srv_1", method: "tool/requestUserInput", params: { question: "?" } },
    ]);
    expect(logs).toEqual(["unparsed stdout: not json"]);
  });
});

// A stand-in for `abacus app-server`: answers initialize, fails anything else,
// and exits with a last word on stderr when told to shut down.
const FAKE = `#!/usr/bin/env node
const rl = require("node:readline").createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const frame = JSON.parse(line);
  if (frame.method === "initialize") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: { workspace: process.argv[2] } }) + "\\n");
  } else if (frame.method === "shutdown") {
    process.stderr.write("bye\\n");
    process.exit(3);
  } else if (frame.id !== undefined) {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: frame.id, error: { code: -32601, message: "unknown method" } }) + "\\n");
  }
});
`;

describe.skipIf(process.platform === "win32")("AppServer process", () => {
  it("round-trips requests, surfaces errors, and reports the exit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abacus-fake-"));
    const bin = join(dir, "abacus");
    writeFileSync(bin, FAKE);
    chmodSync(bin, 0o755);

    const server = new AppServer(bin, dir);
    const exited = new Promise<[number | null, string]>((resolve) =>
      server.on("exit", (code, tail) => resolve([code, tail])),
    );
    server.start();

    await expect(server.request("initialize")).resolves.toEqual({ workspace: dir });
    await expect(server.request("nope")).rejects.toBeInstanceOf(AppServerError);
    await expect(server.request("nope")).rejects.toThrow("unknown method");

    server.stop();
    const [code, tail] = await exited;
    expect(code).toBe(3);
    expect(tail).toContain("bye");
    expect(server.running).toBe(false);
  });
});
