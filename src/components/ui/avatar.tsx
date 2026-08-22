import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

/**
 * Avatars are generated from the person's name and a stored tone, so the product
 * never ships placeholder photo files and never breaks on a missing image.
 */
const TONE_CLASS: Record<string, string> = {
  indigo: "bg-tone-indigo",
  violet: "bg-tone-violet",
  teal: "bg-tone-teal",
  amber: "bg-tone-amber",
  rose: "bg-tone-rose",
  sky: "bg-tone-sky",
  emerald: "bg-tone-emerald",
  slate: "bg-tone-slate",
};

const SIZE_CLASS = {
  xs: "size-6 text-[0.625rem]",
  sm: "size-8 text-[0.6875rem]",
  md: "size-9.5 text-xs",
  lg: "size-12 text-sm",
  xl: "size-16 text-lg",
  "2xl": "size-20 text-2xl",
} as const;

export type AvatarSize = keyof typeof SIZE_CLASS;

export function Avatar({
  name,
  tone = "indigo",
  size = "md",
  className,
  ring = false,
}: {
  name: string;
  tone?: string;
  size?: AvatarSize;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span
      aria-hidden
      title={name}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold tracking-wide text-white select-none",
        TONE_CLASS[tone] ?? TONE_CLASS.indigo,
        SIZE_CLASS[size],
        ring && "ring-2 ring-surface",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Avatar + name + supporting line — the standard way a person appears in lists. */
export function PersonCell({
  name,
  meta,
  tone,
  size = "sm",
  strong = false,
  className,
}: {
  name: string;
  meta?: string | null;
  tone?: string;
  size?: AvatarSize;
  strong?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <Avatar name={name} tone={tone} size={size} />
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate",
            strong ? "font-semibold text-ink" : "font-medium text-ink",
          )}
        >
          {name}
        </span>
        {meta ? (
          <span className="block truncate text-[0.75rem] text-ink-3">{meta}</span>
        ) : null}
      </span>
    </span>
  );
}

/** Overlapping avatars for "who else" summaries. */
export function AvatarStack({
  people,
  max = 4,
  size = "sm",
}: {
  people: { name: string; avatarColor?: string }[];
  max?: number;
  size?: AvatarSize;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex items-center">
      <span className="flex -space-x-2">
        {shown.map((person, i) => (
          <Avatar
            key={`${person.name}-${i}`}
            name={person.name}
            tone={person.avatarColor}
            size={size}
            ring
          />
        ))}
      </span>
      {rest > 0 ? (
        <span className="ml-2 text-xs font-medium text-ink-3">+{rest}</span>
      ) : null}
    </span>
  );
}
