"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatMessage, CheatSheet } from "@/types";
import { cn } from "@/lib/utils";

export type AgentChatHandle = {
  distill: () => void;
};

export const AgentChat = forwardRef<
  AgentChatHandle,
  {
    projectId: string;
    sceneId: string | null;
    sceneHeading: string | null;
    initialMessages: ChatMessage[];
    onCheatSheet?: (sheet: CheatSheet) => void;
    onStreamingChange?: (streaming: boolean) => void;
  }
>(function AgentChat(
  {
    projectId,
    sceneId,
    sceneHeading,
    initialMessages,
    onCheatSheet,
    onStreamingChange,
  },
  ref
) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [waitStatus, setWaitStatus] = useState<"preparing" | "thinking" | null>(
    null
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText, waitStatus]);

  // Fallback if the server is slow to open the stream
  useEffect(() => {
    if (!streaming || waitStatus !== "preparing") return;
    const timer = window.setTimeout(() => {
      setWaitStatus((s) => (s === "preparing" ? "thinking" : s));
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [streaming, waitStatus]);

  useEffect(() => {
    onStreamingChange?.(streaming);
  }, [streaming, onStreamingChange]);

  // Refresh history for this scene on mount (initialMessages come from the
  // page bundle and can be stale after switching scenes mid-session)
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ projectId });
    if (sceneId) params.set("sceneId", sceneId);
    fetch(`/api/chat?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((msgs: ChatMessage[] | null) => {
        if (msgs && !cancelled) setMessages(msgs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, sceneId]);

  async function send(mode: "riff" | "distill" = "riff") {
    const message =
      mode === "distill"
        ? input.trim() ||
          "Distill our conversation and the canvas into a cheat sheet."
        : input.trim();
    if (!message && mode === "riff") return;
    if (streaming) return;

    const optimistic: ChatMessage = {
      id: `temp_${Date.now()}`,
      projectId,
      sceneId,
      role: "user",
      content: mode === "distill" ? `[Distill] ${message}` : message,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setInput("");
    setStreaming(true);
    setStreamText("");
    setWaitStatus("preparing");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sceneId, message, mode }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages((m) => [
          ...m,
          {
            id: `err_${Date.now()}`,
            projectId,
            sceneId,
            role: "assistant",
            content: `Error: ${err.error || res.statusText}`,
            createdAt: new Date().toISOString(),
          },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (event === "status") {
              if (parsed.phase === "preparing" || parsed.phase === "thinking") {
                setWaitStatus(parsed.phase);
              }
            } else if (event === "token") {
              assembled += parsed.text;
              setStreamText(assembled);
              setWaitStatus(null);
            } else if (event === "cheatsheet") {
              onCheatSheet?.(parsed as CheatSheet);
            } else if (event === "done") {
              setMessages((m) => [...m, parsed.message as ChatMessage]);
              setStreamText("");
            } else if (event === "error") {
              setMessages((m) => [
                ...m,
                {
                  id: `err_${Date.now()}`,
                  projectId,
                  sceneId,
                  role: "assistant",
                  content: `Error: ${parsed.error}`,
                  createdAt: new Date().toISOString(),
                },
              ]);
              setStreamText("");
            }
          } catch {
            // ignore parse errors for partial frames
          }
        }
      }
    } finally {
      setStreaming(false);
      setWaitStatus(null);
    }
  }

  useImperativeHandle(ref, () => ({
    distill: () => {
      void send("distill");
    },
  }));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-3 py-2">
        <p className="truncate text-[11px] text-muted-foreground">
          {sceneHeading
            ? `Dramaturg · working on ${sceneHeading}`
            : "Dramaturg · sees scene + canvas"}
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 py-3">
        <div className="space-y-3">
          {messages.length === 0 && !streamText ? (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Riff about beats, objectives, and action verbs. When ready, distill
              into a structured cheat sheet.
            </div>
          ) : null}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "px-3 py-2 text-sm whitespace-pre-wrap",
                m.role === "user"
                  ? "ml-6 rounded-md bg-primary text-primary-foreground"
                  : "mr-4 rounded-md border border-border bg-transparent text-foreground"
              )}
            >
              {m.content}
            </div>
          ))}
          {streaming && !streamText && waitStatus ? (
            <div className="mr-4 flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
              <span>
                {waitStatus === "preparing"
                  ? "Reading scene & canvas…"
                  : "Thinking…"}
              </span>
            </div>
          ) : null}
          {streamText ? (
            <div className="mr-4 rounded-md border border-border bg-transparent px-3 py-2 text-sm whitespace-pre-wrap">
              {streamText}
              <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-foreground/70" />
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Chat with dramaturg about this scene..."
            className="min-h-[72px] resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send("riff");
              }
            }}
            disabled={streaming}
          />
          <Button
            size="icon"
            className="shrink-0 self-end"
            disabled={streaming || !input.trim()}
            onClick={() => send("riff")}
          >
            {streaming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});
