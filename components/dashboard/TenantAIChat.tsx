"use client"
import { useState, useRef, useEffect } from "react"
import { Sparkles, X, Send } from "lucide-react"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface Props {
  tenantId: string
  tenantName: string
}

const SUGGESTED_PROMPTS = [
  "How do I write a CFK offer letter?",
  "What if they refuse the offer?",
  "What are my legal options?",
  "How long will this take?",
]

export default function TenantAIChat({ tenantId, tenantName }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  useEffect(() => {
    if (open && !initialized.current) {
      initialized.current = true
      loadInitialMessage()
    }
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [open])

  async function loadInitialMessage() {
    setLoading(true)
    try {
      const res = await fetch("/api/ai/tenant-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, messages: [], init: true }),
      })
      const data = await res.json()
      setMessages([{ role: "assistant", content: data.message }])
    } catch {
      setMessages([{ role: "assistant", content: "Couldn't load tenant data. Please try again." }])
    } finally {
      setLoading(false)
    }
  }

  async function send(text?: string) {
    const userText = (text ?? input).trim()
    if (!userText || loading) return
    setInput("")
    const next: Message[] = [...messages, { role: "user", content: userText }]
    setMessages(next)
    setLoading(true)
    try {
      const res = await fetch("/api/ai/tenant-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, messages: next }),
      })
      const data = await res.json()
      setMessages([...next, { role: "assistant", content: data.message }])
    } catch {
      setMessages([...next, { role: "assistant", content: "Something went wrong. Try again." }])
    } finally {
      setLoading(false)
    }
  }

  const showSuggestions = messages.length === 1 && !loading

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 text-sm font-medium hover:bg-violet-500/25 transition-colors"
        >
          <Sparkles size={13} />
          Ask AI
        </button>
      )}

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in panel */}
      <div className={`fixed right-0 top-0 h-full z-50 w-full max-w-sm bg-[#0a0e1a] border-l border-white/10 flex flex-col shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Sparkles size={12} className="text-violet-400" />
            </div>
            <div>
              <div className="text-white text-sm font-semibold leading-none">{tenantName}</div>
              <div className="text-[#4b5563] text-[10px] mt-0.5">AI Advisor</div>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-[#4b5563] hover:text-white transition-colors p-1"
          >
            <X size={15} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
          {messages.length === 0 && loading && (
            <div className="flex items-center gap-2 text-[#4b5563] text-sm pt-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-xs">Analyzing {tenantName}&apos;s situation…</span>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-violet-500/25 text-white rounded-tr-sm"
                  : "bg-[#111827] border border-white/[0.07] text-[#d1d5db] rounded-tl-sm"
              }`}>
                {m.content}
              </div>
            </div>
          ))}

          {loading && messages.length > 0 && (
            <div className="flex justify-start">
              <div className="bg-[#111827] border border-white/[0.07] rounded-2xl rounded-tl-sm px-3.5 py-3">
                <div className="flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#4b5563] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#4b5563] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#4b5563] animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Suggested prompts */}
        {showSuggestions && (
          <div className="px-4 pb-2 shrink-0">
            <div className="text-[#374151] text-[10px] uppercase tracking-wide mb-2">Quick questions</div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_PROMPTS.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-xs bg-white/[0.04] border border-white/[0.08] text-[#6b7280] hover:text-white hover:border-white/20 px-2.5 py-1 rounded-full transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-4 border-t border-white/8 shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask anything about this tenant…"
              className="flex-1 bg-[#111827] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#2e3a50] focus:outline-none focus:border-violet-500/40 transition-colors"
              disabled={loading}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0 self-end"
            >
              <Send size={13} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
