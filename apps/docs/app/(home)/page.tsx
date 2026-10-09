import Link from "next/link";

const links = [
  {
    href: "/docs/getting-started",
    title: "Getting started",
    body: "What the SDK is, its status, and how to run the workspace.",
  },
  {
    href: "/docs/design/architecture",
    title: "Architecture",
    body: "Package boundaries, the saved artifact model, and preview isolation.",
  },
  {
    href: "/docs/contracts/embed-api",
    title: "Contracts",
    body: "The embed API, host adapters, agent tools, and the runtime bridge.",
  },
  {
    href: "/docs/decisions",
    title: "Decisions",
    body: "Every design decision, its options, and why one was chosen.",
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="mb-4 text-4xl font-bold">Open Artifacts</h1>
      <p className="mb-10 max-w-2xl text-fd-muted-foreground">
        An embeddable artifact SDK for products with AI agents. Agents create documents, layouts,
        HTML pages, and apps; users edit them directly; both keep working from the same saved
        artifact.
      </p>
      <div className="grid w-full max-w-3xl gap-4 text-left sm:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border bg-fd-card p-4 transition-colors hover:bg-fd-accent"
          >
            <div className="font-medium">{link.title}</div>
            <div className="text-sm text-fd-muted-foreground">{link.body}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
