// FILE: src/components/matu/AIAssistant.tsx
// Floating chat bubble available on every passenger page. Calls the ai-assistant edge
// function, which does real tool-calling against live route/trip data — this component
// never invents links itself, it only renders route cards the function actually found.
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, Loader2, Send, X, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  matchedRoutes?: {
    id: string;
    name: string;
    origin: string;
    destination: string;
    base_fare: number | null;
  }[];
};

// Which page the assistant is mounted on, and any extra detail the page already knows
// (e.g. the route id someone's currently viewing). The edge function uses this to decide
// which tools are relevant and how to frame its replies for that audience.
export type AssistantContext = {
  page:
    | "passenger_search"
    | "passenger_route_details"
    | "passenger_history"
    | "driver_home"
    | "driver_trip"
    | "sacco_admin";
  details?: string;
};

const GREETINGS: Record<AssistantContext["page"], string> = {
  passenger_search:
    "Hi! Tell me where you're going — e.g. \"I want to go from Kasarani to Ambassadeur\" — and I'll check what's available.",
  passenger_route_details:
    "Hi! Ask me about this route — seats left, fare, or how long the trip usually takes.",
  passenger_history:
    "Hi! Ask me about a past or upcoming booking, or say where you want to go next.",
  driver_home:
    "Hi! Ask me about routes, fares, or availability — useful if a passenger asks before you head out.",
  driver_trip: "Hi! I can look up route or fare info while you're on this trip.",
  sacco_admin:
    "Hi! Ask me about any of your SACCO's routes — fares, or how busy a route tends to be.",
};

const PLACEHOLDERS: Record<AssistantContext["page"], string> = {
  passenger_search: "Where are you headed?",
  passenger_route_details: "Ask about this route…",
  passenger_history: "Ask about a booking…",
  driver_home: "Ask about a route…",
  driver_trip: "Ask about this route…",
  sacco_admin: "Ask about your routes…",
};

export function AIAssistant({ context }: { context: AssistantContext }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETINGS[context.page] },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          message: text,
          page: context.page,
          details: context.details,
          // Plain role/content history only — strip matchedRoutes before sending back,
          // the edge function doesn't need it and it'd just bloat the request.
          history: nextMessages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw error;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, matchedRoutes: data.matchedRoutes },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I couldn't reach the assistant just now. Try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className="fixed bottom-5 right-5 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105"
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-40 flex h-[480px] w-[340px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
          <div className="flex items-center gap-2 border-b border-border bg-primary/10 px-4 py-3">
            <Bot className="size-4 text-primary" />
            <span className="text-sm font-semibold">Matu Assistant</span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
            <div className="grid gap-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-foreground"
                    }`}
                  >
                    <p>{m.content}</p>
                    {m.matchedRoutes && m.matchedRoutes.length > 0 && (
                      <div className="mt-2 grid gap-1.5">
                        {m.matchedRoutes.map((r) => (
                          <Link
                            key={r.id}
                            to="/ride/$routeId"
                            params={{ routeId: r.id }}
                            onClick={() => setOpen(false)}
                            className="block rounded-lg border border-border bg-surface px-2.5 py-2 hover:border-primary"
                          >
                            <div className="text-[11px] font-semibold">{r.name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {r.origin} → {r.destination}
                              {r.base_fare != null ? ` · KSh ${r.base_fare}` : ""}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-xl bg-background px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Checking routes…
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={PLACEHOLDERS[context.page]}
              disabled={loading}
              className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              <Send className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
