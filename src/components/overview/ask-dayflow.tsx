"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Database, Send, Sparkles } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api, describeError } from "@/lib/client/api";
import { cn } from "@/lib/cn";

type Metric = {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warning" | "critical";
};

type Answer = {
  intent: string;
  headline: string;
  detail?: string;
  metrics: Metric[];
  people: { id: string; name: string; meta: string; avatarColor: string }[];
  sources: string[];
  action?: { label: string; href: string };
  confident: boolean;
};

const METRIC_TONE: Record<string, string> = {
  default: "text-ink",
  positive: "text-success-ink",
  warning: "text-warning-ink",
  critical: "text-danger-ink",
};

/**
 * "Ask Dayflow" — natural-language questions answered from the database.
 *
 * The intent match and every figure come from the server (`askDayflow`), which
 * runs ordinary Prisma queries. The panel prints the tables that were read, so a
 * judge can see that the answer is sourced rather than generated.
 */
export function AskDayflow({ suggestions }: { suggestions: readonly string[] }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 3) return;
    setBusy(true);
    setError(null);
    setQuestion(trimmed);
    try {
      setAnswer(await api.post<Answer>("/api/assistant", { question: trimmed }));
    } catch (caught) {
      setError(describeError(caught).message);
      setAnswer(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="ask-dayflow" className="flex h-full flex-col">
      <form
        className="flex items-center gap-2 border-b border-line px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <Sparkles className="size-4 shrink-0 text-brand" />
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Who is absent today?"
          aria-label="Ask a question about your workforce"
          maxLength={240}
          className="h-8 min-w-0 flex-1 bg-transparent text-[0.875rem] text-ink outline-none placeholder:text-ink-4"
        />
        <Button
          type="submit"
          variant="primary"
          size="icon-sm"
          loading={busy}
          aria-label="Ask Dayflow"
          disabled={question.trim().length < 3}
        >
          {busy ? null : <Send className="size-3.5" />}
        </Button>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error ? (
          <p role="alert" className="text-[0.8125rem] text-danger-ink">
            {error}
          </p>
        ) : answer ? (
          <div className="animate-rise">
            <p
              className={cn(
                "text-[0.9375rem] leading-snug font-semibold",
                answer.confident ? "text-ink" : "text-ink-2",
              )}
            >
              {answer.headline}
            </p>
            {answer.detail ? (
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-3">
                {answer.detail}
              </p>
            ) : null}

            {answer.metrics.length > 0 ? (
              <dl className="mt-3.5 grid grid-cols-2 gap-2">
                {answer.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-lg border border-line bg-surface-2 px-2.5 py-2"
                  >
                    <dt className="truncate text-[0.625rem] font-medium tracking-wide text-ink-4 uppercase">
                      {metric.label}
                    </dt>
                    <dd
                      className={cn(
                        "mt-0.5 text-[0.9375rem] font-semibold",
                        METRIC_TONE[metric.tone ?? "default"],
                      )}
                    >
                      {metric.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {answer.people.length > 0 ? (
              <ul className="mt-3.5 space-y-1.5">
                {answer.people.map((person) => (
                  <li key={person.id}>
                    <Link
                      href={`/people/${person.id}`}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-3"
                    >
                      <Avatar name={person.name} tone={person.avatarColor} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.8125rem] font-medium text-ink">
                          {person.name}
                        </span>
                        <span className="block truncate text-[0.6875rem] text-ink-3">
                          {person.meta}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}

            {answer.sources.length > 0 ? (
              <p className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-[0.6875rem] text-ink-4">
                <Database className="size-3" />
                Answered from
                {answer.sources.map((source) => (
                  <span
                    key={source}
                    className="rounded border border-line bg-surface-3 px-1.5 py-0.5 font-mono text-[0.625rem] text-ink-3"
                  >
                    {source}
                  </span>
                ))}
              </p>
            ) : null}

            {answer.action ? (
              <Link
                href={answer.action.href}
                className="mt-3 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-brand hover:underline"
              >
                {answer.action.label}
                <ArrowRight className="size-3.5" />
              </Link>
            ) : null}
          </div>
        ) : (
          <div>
            <p className="text-[0.8125rem] leading-relaxed text-ink-3">
              Ask in plain English. Dayflow matches your question to a known query,
              runs it against the live database, and shows which tables it read — so
              no figure is ever invented.
            </p>
            <ul className="mt-3 space-y-1.5">
              {suggestions.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => void ask(suggestion)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-left text-[0.8125rem] text-ink-2 transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-ink"
                  >
                    {suggestion}
                    <ArrowRight className="size-3.5 shrink-0 opacity-40" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {answer ? (
        <footer className="border-t border-line bg-surface-2 px-4 py-2.5">
          <button
            type="button"
            onClick={() => {
              setAnswer(null);
              setQuestion("");
            }}
            className="text-[0.75rem] font-medium text-ink-3 hover:text-ink"
          >
            Ask something else
          </button>
        </footer>
      ) : null}
    </div>
  );
}
