import { describe, expect, it } from "vitest";
import config from "../vite.config";

describe("the test run", () => {
  it("leaves out the other sessions' copies of the repo (.claude/worktrees/*)", () => {
    expect((config as { test?: { exclude?: string[] } }).test?.exclude).toContain("**/.claude/**");
  });
});
