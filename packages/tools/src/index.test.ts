import { describe, expect, it } from "vitest";

import { packageName } from "./index.js";

describe("@open-artifacts/tools", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@open-artifacts/tools");
  });
});
