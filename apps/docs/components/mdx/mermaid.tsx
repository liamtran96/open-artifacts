"use client";

import { useTheme } from "next-themes";
import type { Mermaid as MermaidApi } from "mermaid";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

/** Renders a ```mermaid fence. Fumadocs' remarkMdxMermaid turns the fence into <Mermaid chart="..." />. */
export function Mermaid({ chart }: { chart: string }) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return <MermaidContent chart={chart} />;
}

let importPromise: Promise<{ default: MermaidApi }> | undefined;
const cache = new Map<string, string>();

function MermaidContent({ chart }: { chart: string }) {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");

  useEffect(() => {
    const theme = resolvedTheme === "dark" ? "dark" : "default";
    const key = `${theme}\n${chart}`;
    const cached = cache.get(key);
    if (cached) {
      setSvg(cached);
      return;
    }
    let cancelled = false;
    importPromise ??= import("mermaid");
    void importPromise.then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme });
      const { svg: rendered, bindFunctions } = await mermaid.render(
        id.replaceAll(":", ""),
        chart.replaceAll("\\n", "\n"),
      );
      if (cancelled) return;
      cache.set(key, rendered);
      setSvg(rendered);
      if (container.current) bindFunctions?.(container.current);
    });
    return () => {
      cancelled = true;
    };
  }, [chart, id, resolvedTheme]);

  return (
    <div
      ref={container}
      className="my-6 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
