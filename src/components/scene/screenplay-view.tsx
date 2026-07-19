"use client";

import { tokenizeScreenplay } from "@/lib/screenplay";
import { cn } from "@/lib/utils";

/** Shared column so character cues sit directly above their dialogue. */
const SPEECH_COL = "mx-auto w-[min(22rem,90%)]";

export function ScreenplayView({ text }: { text: string }) {
  if (!text.trim()) {
    return (
      <p className="px-4 py-6 text-center text-xs text-muted-foreground">
        No scene loaded yet.
      </p>
    );
  }

  const elements = tokenizeScreenplay(text);

  return (
    <div className="screenplay-page px-3 py-5 sm:px-5">
      <article
        className="screenplay mx-auto w-full max-w-[40rem] font-mono text-[13px] leading-[1.5] text-foreground/95"
        aria-label="Screenplay view"
      >
        {elements.map((el, i) => {
          if (el.type === "blank") {
            return <div key={i} className="h-3.5" aria-hidden />;
          }

          return (
            <p
              key={i}
              className={cn(
                "break-words",
                el.type === "slug" &&
                  "mb-4 font-medium uppercase tracking-[0.02em]",
                el.type === "action" && "mb-3.5",
                el.type === "character" &&
                  cn(
                    SPEECH_COL,
                    "mb-0 mt-3.5 text-center font-medium uppercase"
                  ),
                el.type === "parenthetical" &&
                  "mx-auto mb-0 w-[min(16rem,72%)] text-center text-[12px] text-foreground/80",
                el.type === "dialogue" && cn(SPEECH_COL, "mb-0 text-left"),
                el.type === "transition" &&
                  "mb-3.5 mt-3.5 text-right font-medium uppercase tracking-wide"
              )}
            >
              {el.text}
            </p>
          );
        })}
      </article>
    </div>
  );
}
