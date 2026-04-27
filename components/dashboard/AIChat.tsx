"use client"
import { useState, useRef, useEffect } from "react"
import { usePathname } from "next/navigation"
import { X, Send, Sparkles, ChevronDown, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react"
import Link from "next/link"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface PortfolioStatus {
  total: number
  needs_action: number
  critical_count: number
  at_risk_revenue: number
  today_sent: number
  today_protected: number
  breakdown: {
    legal: number
    pay_or_quit: number
    cash_for_keys: number
    payment_plan: number
    reminder: number
    watch: number
  }
}

const QUICK_QUESTIONS = [
  "Who needs attention before the 1st?",
  "Which tenant is highest risk?",
  "Are any cards expiring soon?",
  "How much revenue is at risk?",
]

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`
}

export default function AIChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<PortfolioStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open && !status && !statusLoading) {
      setStatusLoading(true)
      fetch("/api/ai/status")
        .then(r => r.json())
        .then(d => setStatus(d))
        .catch(() => {})
        .finally(() => setStatusLoading(false))
    }
  }, [open, status, statusLoading])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  async function send(text?: string) {
    const content = (text || input).trim()
    if (!content || loading) return

    const newMessages: Message[] = [...messages, { role: "user", content }]
    setMessages(newMessages)
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: "assistant", content: data.message || "Something went wrong." }])
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Could not reach AI. Please try again." }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() }
  }

  const pathname = usePathname()
  const onTenantsPage = pathname.startsWith("/dashboard/tenants")
  const hasIssues = !!status && status.needs_action > 0
  const urgentCount = status ? (status.breakdown.legal + status.breakdown.pay_or_quit) : 0

  return (
    <>
      {/* Floating trigger */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold px-4 py-3 rounded-2xl shadow-lg shadow-blue-500/25 transition-all duration-200 hover:scale-105"
        >
          <Sparkles size={16} />
          <span>Ask AI</span>
          {status && status.needs_action > 0 && (
            <span className="bg-black/20 text-black text-xs font-bold px-1.5 py-0.5 rounded-full">
              {status.needs_action}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[420px] max-h-[660px] flex flex-col bg-[#0d1220] border border-[#1e2d45] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#60a5fa]/10 flex items-center justify-center">
                <Sparkles size={14} className="text-[#60a5fa]" />
              </div>
              <div>
                <div className="text-white font-semibold text-sm">RentSentry AI</div>
                <div className="text-[#4b5563] text-xs">Portfolio Operator · Always Watching</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4b5563] hover:text-white hover:bg-white/5 transition-colors"
              >
                <ChevronDown size={15} />
              </button>
              <button
                onClick={() => { setOpen(false); setMessages([]) }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4b5563] hover:text-white hover:bg-white/5 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* ── Initial state (no conversation yet) ── */}
            {messages.length === 0 && (
              <div className="p-4 space-y-3">
                {statusLoading && (
                  <div className="flex items-center justify-center py-10">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4b5563] animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4b5563] animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4b5563] animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}

                {!statusLoading && status && (
                  <>
                    {/* Portfolio alert block */}
                    <div className={`rounded-xl p-4 border ${hasIssues ? "bg-[#1a0a0a] border-red-500/20" : "bg-[#071a07] border-emerald-900/40"}`}>
                      <div className={`flex items-center gap-2 font-semibold text-sm mb-3 ${hasIssues ? "text-red-400" : "text-emerald-400"}`}>
                        {hasIssues ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                        {hasIssues
                          ? `${status.needs_action} tenant${status.needs_action !== 1 ? "s" : ""} need attention`
                          : "Portfolio in good standing"}
                      </div>

                      {hasIssues && (
                        <div className="space-y-1.5 mb-3">
                          {urgentCount > 0 && (
                            <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                              {urgentCount} eviction-ready — packets compiled
                            </div>
                          )}
                          {status.breakdown.cash_for_keys > 0 && (
                            <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                              {status.breakdown.cash_for_keys} Cash for Keys offer{status.breakdown.cash_for_keys !== 1 ? "s" : ""} ready
                            </div>
                          )}
                          {(status.breakdown.payment_plan + status.breakdown.reminder) > 0 && (
                            <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                              {status.breakdown.payment_plan + status.breakdown.reminder} payment action{(status.breakdown.payment_plan + status.breakdown.reminder) !== 1 ? "s" : ""} queued
                            </div>
                          )}
                          {status.breakdown.watch > 0 && (
                            <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                              {status.breakdown.watch} under pre-1st monitoring
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs text-red-400 font-medium pt-1 border-t border-red-500/10 mt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                            {fmt(status.at_risk_revenue)} in outstanding balances
                          </div>
                        </div>
                      )}

                      {status.today_sent > 0 && (
                        <div className="text-[#374151] text-xs">
                          Today: {status.today_sent} intervention{status.today_sent !== 1 ? "s" : ""} already executed
                          {status.today_protected > 0 ? ` · ${fmt(status.today_protected)} revenue protected` : ""}
                        </div>
                      )}
                    </div>

                    {/* Quick link to tenants — hidden when already there */}
                    {hasIssues && !onTenantsPage && (
                      <Link
                        href="/dashboard/tenants"
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors border border-white/5"
                      >
                        Review tenants <ArrowRight size={13} />
                      </Link>
                    )}

                    {/* Quick questions */}
                    <div>
                      <div className="text-[#374151] text-xs mb-2 uppercase tracking-wide">Ask me anything</div>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_QUESTIONS.map(q => (
                          <button
                            key={q}
                            onClick={() => send(q)}
                            className="text-xs bg-[#131929] border border-[#1e2d45] text-[#9ca3af] hover:text-white hover:border-[#2e4060] px-3 py-1.5 rounded-xl transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {!statusLoading && !status && (
                  <div className="text-[#4b5563] text-sm text-center py-8">Could not load portfolio status.</div>
                )}
              </div>
            )}

            {/* ── Conversation ── */}
            {messages.length > 0 && (
              <div className="px-4 py-4 space-y-4">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-[#60a5fa]/10 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                        <Sparkles size={11} className="text-[#60a5fa]" />
                      </div>
                    )}
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-[#60a5fa] text-black font-medium rounded-br-sm"
                        : "bg-[#131929] text-[#d1d5db] border border-[#1e2d45] rounded-bl-sm"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="w-6 h-6 rounded-full bg-[#60a5fa]/10 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                      <Sparkles size={11} className="text-[#60a5fa]" />
                    </div>
                    <div className="bg-[#131929] border border-[#1e2d45] rounded-2xl rounded-bl-sm px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4b5563] animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4b5563] animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4b5563] animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Follow-up prompt shortcuts */}
                {!loading && messages[messages.length - 1]?.role === "assistant" && (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
                    <button
                      onClick={() => send("What should I do right now, in order of urgency?")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 border border-white/5 transition-colors"
                    >
                      Urgency order →
                    </button>
                    {pathname !== "/dashboard" && (
                      <Link
                        href="/dashboard"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 border border-white/5 transition-colors"
                      >
                        View Dashboard
                      </Link>
                    )}
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 pb-4 pt-3 shrink-0 border-t border-[#1e2d45]">
            <div className="flex items-end gap-2 bg-[#131929] border border-[#1e2d45] rounded-xl px-3 py-2 focus-within:border-[#2e4060]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about your portfolio…"
                rows={1}
                className="flex-1 bg-transparent text-white text-sm placeholder:text-[#4b5563] resize-none focus:outline-none max-h-24 leading-relaxed"
                style={{ height: "auto" }}
                onInput={e => {
                  const el = e.target as HTMLTextAreaElement
                  el.style.height = "auto"
                  el.style.height = el.scrollHeight + "px"
                }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="w-7 h-7 rounded-lg bg-[#60a5fa] hover:bg-[#3b82f6] flex items-center justify-center text-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
