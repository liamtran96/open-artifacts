/**
 * Package boundary rules from docs/design/architecture.md, enforced per decision 0002.
 *
 * - core and tools: no DOM libraries, React, editor libraries, or model providers.
 * - runtime base entry: no React or editor libraries (React hooks live in a separate entry).
 * - embed: no React (the React wrapper is packages/react).
 * - adapters: may use core and their own editor library only.
 * - no circular imports anywhere.
 *
 * Matching notes: a resolved npm dependency appears as `<pkg>/node_modules/<name>/...`,
 * an undeclared one appears unresolved under its bare specifier, so every npm rule matches both.
 * Workspace packages resolve through symlinks to `packages/<name>/dist/...`.
 */

/** Regex matching an npm package by name whether resolved or not. */
const npm = (...names) => {
  const alt = names.join("|");
  return `(^|/)node_modules/(${alt})(/|$)|^(${alt})(/|$)`;
};

const REACT = npm("react", "react-dom");
const EDITOR_LIBS = npm(
  "grapesjs",
  "prosemirror-[a-z-]+",
  "@puckeditor/[^/]+",
  "@measured/puck",
  "codemirror",
  "@codemirror/[^/]+",
  "@codesandbox/[^/]+",
);
const MODEL_PROVIDERS = npm("@anthropic-ai/[^/]+", "openai", "@google/[^/]+", "ai");

/** Regex matching any workspace package other than the named ones, resolved or not. */
const otherWorkspacePackages = (...allowed) => {
  const neg = allowed.map((a) => `${a}/`).join("|");
  return `^packages/(?!${neg})|^@open-artifacts/(?!(${allowed.join("|")})(/|$))`;
};

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "core-has-no-react",
      severity: "error",
      from: { path: "^packages/core/src" },
      to: { path: REACT },
    },
    {
      name: "core-has-no-editor-libs",
      severity: "error",
      from: { path: "^packages/core/src" },
      to: { path: EDITOR_LIBS },
    },
    {
      name: "core-has-no-model-providers",
      severity: "error",
      from: { path: "^packages/core/src" },
      to: { path: MODEL_PROVIDERS },
    },
    {
      name: "core-imports-no-workspace-package",
      severity: "error",
      from: { path: "^packages/core/src" },
      to: { path: otherWorkspacePackages("core") },
    },
    {
      name: "tools-only-uses-core",
      severity: "error",
      from: { path: "^packages/tools/src" },
      to: { path: otherWorkspacePackages("core", "tools") },
    },
    {
      name: "tools-has-no-react-editor-or-model-libs",
      severity: "error",
      from: { path: "^packages/tools/src" },
      to: { path: `${REACT}|${EDITOR_LIBS}|${MODEL_PROVIDERS}` },
    },
    {
      name: "runtime-base-has-no-react",
      severity: "error",
      from: { path: "^packages/runtime/src", pathNot: "^packages/runtime/src/react" },
      to: { path: REACT },
    },
    {
      name: "runtime-has-no-editor-libs",
      severity: "error",
      from: { path: "^packages/runtime/src" },
      to: { path: EDITOR_LIBS },
    },
    {
      name: "runtime-imports-no-workspace-package",
      severity: "error",
      from: { path: "^packages/runtime/src" },
      to: { path: otherWorkspacePackages("runtime") },
    },
    {
      name: "embed-has-no-react",
      severity: "error",
      from: { path: "^packages/embed/src" },
      to: { path: REACT },
    },
    {
      name: "embed-uses-only-core",
      severity: "error",
      from: { path: "^packages/embed/src" },
      to: { path: otherWorkspacePackages("core", "embed") },
    },
    {
      name: "react-uses-only-embed-and-core",
      severity: "error",
      from: { path: "^packages/react/src" },
      to: { path: otherWorkspacePackages("core", "embed", "react") },
    },
    {
      name: "adapter-html-uses-only-core",
      severity: "error",
      from: { path: "^packages/adapter-html/src" },
      to: { path: otherWorkspacePackages("core", "adapter-html") },
    },
    {
      name: "adapter-html-has-no-react",
      severity: "error",
      from: { path: "^packages/adapter-html/src" },
      to: { path: REACT },
    },
    {
      name: "no-src-reaching-into-other-package-src",
      severity: "error",
      comment: "Import workspace packages by name, never by relative path into their src.",
      from: { path: "^packages/([^/]+)/src" },
      to: { path: "^packages/(?!$1/)[^/]+/src" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules|/dist/" },
    exclude: { path: "\\.test\\.tsx?$|\\.config\\.ts$" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
