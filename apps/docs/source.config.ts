import { existsSync, readdirSync, readFileSync } from "node:fs";
import { posix, resolve, sep } from "node:path";
import { defineConfig } from "fumadocs-mdx/config";
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import type { Link, Root } from "mdast";
import type { VFile } from "vfile";
import { visit } from "unist-util-visit";
import { docsSourceDir, gitConfig } from "./lib/shared";

const docsRoot = resolve(process.cwd(), "..", "..", docsSourceDir);
const repoBlobUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}`;

/**
 * The repository docs keep their H1 so they read well on GitHub. The site renders
 * the frontmatter title itself, so the leading H1 is dropped to avoid a duplicate.
 */
function remarkStripLeadingHeading() {
  return (tree: Root) => {
    const index = tree.children.findIndex((node) => node.type !== "yaml");
    const node = tree.children[index];
    if (node?.type === "heading" && node.depth === 1) {
      tree.children.splice(index, 1);
    }
  };
}

/** First page of a docs folder: its README, else meta.json's first entry, else alphabetical. */
function folderIndex(folderRelToDocs: string): string | undefined {
  const abs = resolve(docsRoot, folderRelToDocs);
  if (existsSync(resolve(abs, "README.md"))) return posix.join(folderRelToDocs, "README.md");
  const metaPath = resolve(abs, "meta.json");
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { pages?: string[] };
    const first = meta.pages?.find((p) => p !== "...");
    if (first) return posix.join(folderRelToDocs, `${first}.md`);
  }
  if (!existsSync(abs)) return undefined;
  const first = readdirSync(abs)
    .filter((n) => n.endsWith(".md"))
    .sort()[0];
  return first ? posix.join(folderRelToDocs, first) : undefined;
}

/**
 * Fumadocs resolves relative links only when they start with "./" or "../".
 * The repository docs are written for GitHub, where bare relative paths and folder
 * links also work. This plugin makes them equivalent on the site:
 * - bare "design/architecture.md" becomes "./design/architecture.md";
 * - folder links such as "decisions/" point at that folder's index page;
 * - links that leave docs/ (for example CONTRIBUTING.md) point at the file on GitHub.
 */
function remarkRepoLinks() {
  return (tree: Root, file: VFile) => {
    if (!file.path) return;
    const fileDir = posix.dirname(
      posix.relative(docsRoot.split(sep).join("/"), file.path.split(sep).join("/")),
    );

    visit(tree, "link", (node: Link) => {
      const url = node.url;
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("/") || url.startsWith("#")) return;

      const hashIndex = url.indexOf("#");
      const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
      const target = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
      if (target === "") return;

      let relToDocs = posix.normalize(posix.join(fileDir, target));
      if (relToDocs.startsWith("..")) {
        node.url = `${repoBlobUrl}/${posix.normalize(posix.join(docsSourceDir, relToDocs))}${hash}`;
        return;
      }
      if (target.endsWith("/")) {
        const index = folderIndex(relToDocs);
        if (!index) return;
        relToDocs = index;
      }
      let rel = posix.relative(fileDir, relToDocs);
      if (!rel.startsWith(".")) rel = `./${rel}`;
      node.url = `${rel}${hash}`;
    });
  };
}

export default defineConfig({
  mdxOptions: {
    remarkPlugins: (v) => [remarkStripLeadingHeading, remarkRepoLinks, remarkMdxMermaid, ...v],
  },
});
