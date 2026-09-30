import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-3 py-20">
      <div className="mono text-[12px] text-faint">404</div>
      <h2 className="display text-[32px] text-ink">Page not found</h2>
      <p className="text-[14px] leading-relaxed text-muted">
        The requested view does not exist in OpsPilot.
      </p>
      <Link
        href="/"
        className="mt-3 border border-line px-3.5 py-2 text-[13px] text-ink transition-colors duration-150 hover:bg-paper-muted"
      >
        Return to overview
      </Link>
    </div>
  );
}
