/** Fixtures and assertions shared by the runtime test files. */

import { expect } from "vitest";

import type { ArtifactContext, ArtifactRuntimeErrorCode } from "../protocol.js";
import { ArtifactRuntimeError } from "../protocol.js";

export const sampleContext: ArtifactContext = {
  artifactId: "art_1",
  viewedRevision: 3,
  kind: "html",
  theme: "light",
  locale: "en-US",
};

/** Assert that a promise rejects with an ArtifactRuntimeError carrying `code`. */
export async function expectCode(
  promise: Promise<unknown>,
  code: ArtifactRuntimeErrorCode,
): Promise<void> {
  await expect(promise).rejects.toSatisfy(
    (e: unknown) => e instanceof ArtifactRuntimeError && e.code === code,
  );
}
