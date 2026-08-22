import { cn } from "@/lib/cn";

/**
 * The Dayflow mark: an arc rising from left to right with a marker on it — a
 * workday, tracked. Drawn as inline SVG so it needs no asset request and stays
 * crisp at every size.
 */
export function LogoMark({
  className,
  tone = "brand",
}: {
  className?: string;
  tone?: "brand" | "light" | "dark";
}) {
  const bg =
    tone === "light" ? "fill-white" : tone === "dark" ? "fill-sidebar" : "fill-brand";
  const fg = tone === "light" ? "stroke-brand" : "stroke-white";
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="Dayflow"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" className={bg} />
      <path
        d="M7 21.5c2.6 0 4.2-3.2 5.7-6.2 1.4-2.9 2.7-5.6 4.6-5.6 2.1 0 3.2 2.6 4.3 5.2"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        className={cn(fg, "opacity-95")}
      />
      <circle
        cx="24"
        cy="19.6"
        r="2.6"
        className={tone === "light" ? "fill-brand" : "fill-white"}
      />
    </svg>
  );
}

export function Wordmark({
  className,
  tone = "dark",
  tagline = false,
}: {
  className?: string;
  tone?: "dark" | "light";
  tagline?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark tone={tone === "light" ? "light" : "brand"} />
      <span className="min-w-0">
        <span
          className={cn(
            "block font-display text-[1.0625rem] leading-none font-semibold tracking-tight",
            tone === "light" ? "text-white" : "text-ink",
          )}
        >
          Dayflow
        </span>
        {tagline ? (
          <span
            className={cn(
              "mt-1 block text-[0.6875rem] leading-none",
              tone === "light" ? "text-white/55" : "text-ink-3",
            )}
          >
            Workforce operations
          </span>
        ) : null}
      </span>
    </span>
  );
}
