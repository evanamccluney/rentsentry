"use client"
import { useCallback, useEffect, useState } from "react"
import { usePlaidLink } from "react-plaid-link"
import { createClient } from "@/lib/supabase/client"
import { Building2, CheckCircle2, Loader2 } from "lucide-react"

interface Props {
  connected: boolean
  connectedAt: string | null
  onConnected: () => void
}

export default function PlaidConnect({ connected, connectedAt, onConnected }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [exchanging, setExchanging] = useState(false)

  async function fetchLinkToken() {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch("/api/plaid/link-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      setLinkToken(data.link_token ?? null)
    } finally {
      setLoading(false)
    }
  }

  const onSuccess = useCallback(async (public_token: string) => {
    setExchanging(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ public_token }),
      })
      onConnected()
    } finally {
      setExchanging(false)
      setLinkToken(null)
    }
  }, [onConnected])

  const { open, ready } = usePlaidLink({ token: linkToken ?? "", onSuccess })

  useEffect(() => {
    if (linkToken && ready) open()
  }, [linkToken, ready, open])

  if (connected) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-emerald-300 text-sm font-medium">Bank connected</div>
          {connectedAt && (
            <div className="text-[#4b5563] text-xs mt-0.5">
              Connected {new Date(connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          )}
        </div>
        <button
          onClick={fetchLinkToken}
          disabled={loading || exchanging}
          className="text-xs text-[#6b7280] hover:text-white transition-colors disabled:opacity-50"
        >
          Reconnect
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={fetchLinkToken}
      disabled={loading || exchanging}
      className="flex items-center gap-2 w-full justify-center bg-[#0d1117] border border-white/10 hover:border-white/20 text-white text-sm font-medium rounded-xl px-4 py-3 transition-colors disabled:opacity-50"
    >
      {loading || exchanging ? (
        <Loader2 size={15} className="animate-spin text-[#6b7280]" />
      ) : (
        <Building2 size={15} className="text-blue-400" />
      )}
      {exchanging ? "Connecting…" : loading ? "Opening…" : "Connect bank account"}
    </button>
  )
}
