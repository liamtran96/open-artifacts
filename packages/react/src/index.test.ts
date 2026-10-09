import { describe, expect, it } from "vitest";

import { packageName } from "./index.js";

describe("@open-artifacts/react", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@open-artifacts/react");
  });
});
