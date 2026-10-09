import { llms, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { docsRoute } from "./shared";
import { defineDocs } from "fumadocs-mdx/macro";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";

// The site renders the repository's docs/ folder directly; there is no second copy.
const docs = defineDocs({
  dir: "../../docs",
  docs: {
    schema: pageSchema,
    files: ["**/*.md", "**/*.mdx", "!references/**"],
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
    files: ["**/meta.json"],
  },
});

export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
  // README.md is the index of its folder, matching how GitHub renders it.
  slugs(_file, next) {
    const slugs = next();
    return slugs.at(-1)?.toLowerCase() === "readme" ? slugs.slice(0, -1) : slugs;
  },
});

export const docsLlms = llms(source, {
  renderPage: async (page) => `# ${page.data.title} (${page.url})

${await page.data.getText("processed")}`,
});
