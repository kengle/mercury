import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig } from "../src/core/config.js";
import { MercuryExtensionAPIImpl } from "../src/extensions/api.js";
import type { MercuryExtensionContext } from "../src/extensions/types.js";
import { createDatabase } from "../src/core/db.js";
import { createExtensionStateService } from "../src/extensions/state-service.js";
import type { Database } from "bun:sqlite";
import type { ExtensionStateService } from "../src/extensions/state-service.js";

let tmpDir: string;
let db: Database;
let extState: ExtensionStateService;
let ctx: MercuryExtensionContext;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-widget-test-"));
  db = createDatabase(path.join(tmpDir, "test.db"));
  extState = createExtensionStateService(db);
  ctx = {
    db,
    config: {} as AppConfig,
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => ctx.log,
    } as unknown as MercuryExtensionContext["log"],
  };
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Widget registration via API", () => {
  test("widget is registered in meta", () => {
    const api = new MercuryExtensionAPIImpl("test-ext", tmpDir, extState, () => {});
    api.widget({ label: "Status", render: () => "<p>OK</p>" });

    const meta = api.getMeta();
    expect(meta.widgets).toHaveLength(1);
    expect(meta.widgets[0].label).toBe("Status");
  });

  test("multiple widgets registered", () => {
    const api = new MercuryExtensionAPIImpl("test-ext", tmpDir, extState, () => {});
    api.widget({ label: "A", render: () => "<p>A</p>" });
    api.widget({ label: "B", render: () => "<p>B</p>" });

    const meta = api.getMeta();
    expect(meta.widgets).toHaveLength(2);
  });

  test("widget render returns HTML", () => {
    const api = new MercuryExtensionAPIImpl("test-ext", tmpDir, extState, () => {});
    api.widget({ label: "Stats", render: () => "<div>42</div>" });

    const meta = api.getMeta();
    const html = meta.widgets[0].render(ctx);
    expect(html).toBe("<div>42</div>");
  });

  test("widget render can use store", () => {
    const api = new MercuryExtensionAPIImpl("test-ext", tmpDir, extState, () => {});
    api.store.set("count", "5");
    api.widget({
      label: "Count",
      render: (c) => {
        const count = extState.get("test-ext", "count") ?? "0";
        return `<p>${count}</p>`;
      },
    });

    const meta = api.getMeta();
    const html = meta.widgets[0].render(ctx);
    expect(html).toBe("<p>5</p>");
  });

  test("widget render error is isolatable", () => {
    const api = new MercuryExtensionAPIImpl("test-ext", tmpDir, extState, () => {});
    api.widget({
      label: "Broken",
      render: () => {
        throw new Error("render failed");
      },
    });

    const meta = api.getMeta();
    // Callers (dashboard) should catch render errors
    expect(() => meta.widgets[0].render(ctx)).toThrow("render failed");
  });
});
