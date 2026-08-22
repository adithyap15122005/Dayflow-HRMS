import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Button hierarchy — deliberately small so hierarchy stays readable:
 *  primary   one per screen region: the action we want taken
 *  secondary supporting actions that still need weight
 *  ghost     low-emphasis, used inside dense toolbars and tables
 *  danger    destructive or rejecting actions
 *  link      inline text action
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const BASE =
  "relative inline-flex select-none items-center justify-center gap-2 rounded-md font-medium " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 " +
  "disabled:pointer-events-none disabled:opacity-45 active:translate-y-px " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-e1 hover:bg-brand-hover active:bg-brand-active",
  secondary:
    "border border-line-2 bg-surface text-ink shadow-e1 hover:border-line-strong hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-3 hover:text-ink",
  danger: "bg-danger text-white shadow-e1 hover:brightness-110 active:brightness-95",
  link: "text-brand underline-offset-4 hover:underline",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-9.5 px-3.5 text-sm",
  lg: "h-11 px-5 text-[0.9375rem]",
  icon: "size-9.5",
  "icon-sm": "size-8",
};

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
};

export function buttonClass({
  variant = "secondary",
  size = "md",
  fullWidth,
  className,
}: Common & { className?: string }): string {
  return cn(
    BASE,
    VARIANTS[variant],
    SIZES[size],
    variant === "link" && "h-auto px-0",
    fullWidth && "w-full",
    className,
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
    />
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  fullWidth,
  className,
  children,
  disabled,
  ...rest
}: Common & ComponentProps<"button">) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, fullWidth, className })}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  fullWidth,
  className,
  children,
  ...rest
}: Common & ComponentProps<typeof Link>) {
  return (
    <Link {...rest} className={buttonClass({ variant, size, fullWidth, className })}>
      {children}
    </Link>
  );
}

/** Groups related buttons into a single segmented control. */
export function ButtonGroup({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-line bg-surface-3 p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}
