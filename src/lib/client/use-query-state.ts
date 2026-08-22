"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

/**
 * URL-as-state.
 *
 * Filters live in the query string so every view is shareable, bookmarkable and
 * survives a refresh — and so server components can read them directly without a
 * client store. `set` replaces the entry rather than pushing, keeping the back
 * button meaningful.
 */
export function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const buildHref = useCallback(
    (updates: Record<string, string | number | undefined | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === null || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      // Any filter change invalidates the current page number.
      if (!("page" in updates)) next.delete("page");
      const text = next.toString();
      return text ? `${pathname}?${text}` : pathname;
    },
    [params, pathname],
  );

  const set = useCallback(
    (updates: Record<string, string | number | undefined | null>) => {
      const href = buildHref(updates);
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [buildHref, router],
  );

  const reset = useCallback(() => {
    startTransition(() => router.replace(pathname, { scroll: false }));
  }, [pathname, router]);

  return { params, set, reset, buildHref, pending };
}

/** Debounced text input state that pushes to the URL once typing settles. */
export function useDebouncedQuery(key: string, delay = 320) {
  const { params, set } = useQueryState();
  const fromUrl = params.get(key) ?? "";
  const [value, setValue] = useState(fromUrl);

  // Re-sync when the URL changes from elsewhere (Clear button, back navigation).
  // Adjusting state during render avoids the extra pass an effect would cause.
  const [seen, setSeen] = useState(fromUrl);
  if (seen !== fromUrl) {
    setSeen(fromUrl);
    setValue(fromUrl);
  }

  useEffect(() => {
    if (value === fromUrl) return;
    const timer = setTimeout(() => set({ [key]: value || undefined }), delay);
    return () => clearTimeout(timer);
  }, [value, fromUrl, key, delay, set]);

  return [value, setValue] as const;
}
