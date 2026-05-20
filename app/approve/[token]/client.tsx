'use client'

import { useState } from "react"

export interface ApprovalItem {
  index: number
  tenantId: string
  tenantName: string
  balanceDue: number
  type: 'followup' | 'escalation'
  profile: string
  daysSince: number
  status: 'pending' | 'approved' | 'declined'
}

interface ItemState {
  status: 'pending' | 'approved' | 'declined'
  loading: boolean
}

export default function ApprovalClient({ token, initialItems }: { token: string; initialItems: ApprovalItem[] }) {
  const [states, setStates] = useState<Record<number, ItemState>>(
    Object.fromEntries(initialItems.map(item => [item.index, { status: item.status, loading: false }]))
  )

  async function decide(index: number, decision: 'yes' | 'no') {
    setStates(prev => ({ ...prev, [index]: { ...prev[index], loading: true } }))
    try {
      const res = await fetch(`/api/approve/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, decision }),
      })
      if (res.ok) {
        setStates(prev => ({
          ...prev,
          [index]: { loading: false, status: decision === 'yes' ? 'approved' : 'declined' },
        }))
      } else {
        setStates(prev => ({ ...prev, [index]: { ...prev[index], loading: false } }))
      }
    } catch {
      setStates(prev => ({ ...prev, [index]: { ...prev[index], loading: false } }))
    }
  }

  const pendingCount = initialItems.filter(i => states[i.index]?.status === 'pending').length
  const total = initialItems.length

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-950 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-md">

        <div className="mb-7 text-center">
          <p className="text-white font-semibold text-base tracking-tight">RentSentry</p>
          <p className="text-zinc-500 text-sm mt-1">
            {pendingCount > 0
              ? `${pendingCount} of ${total} follow-up${total > 1 ? 's' : ''} pending`
              : 'All done — no pending follow-ups.'}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {initialItems.map(item => {
            const state = states[item.index]
            const isDone = state.status !== 'pending'

            return (
              <div
                key={item.index}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                  isDone ? 'opacity-40 border-zinc-800 bg-zinc-900/30' : 'border-zinc-700 bg-zinc-900'
                }`}
              >
                {/* Info row */}
                <div className="flex items-start justify-between px-4 pt-4 pb-3 gap-2">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold leading-snug break-words">{item.tenantName}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      ${item.balanceDue.toLocaleString()} &middot; {item.daysSince}d unanswered
                    </p>
                    <span className={`inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
                      item.type === 'escalation'
                        ? 'bg-red-950 text-red-400'
                        : 'bg-amber-950 text-amber-400'
                    }`}>
                      {item.type === 'escalation' ? 'Escalation' : 'Follow-up'}
                    </span>
                  </div>
                  {isDone && (
                    <span className={`text-xs font-semibold flex-shrink-0 mt-0.5 ${state.status === 'approved' ? 'text-emerald-400' : 'text-zinc-600'}`}>
                      {state.status === 'approved' ? 'Sent ✓' : 'Skipped'}
                    </span>
                  )}
                </div>

                {/* Buttons row */}
                {!isDone && (
                  <div className="flex border-t border-zinc-800">
                    <button
                      onClick={() => decide(item.index, 'yes')}
                      disabled={state.loading}
                      className="flex-1 py-3.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {state.loading ? '…' : 'Send'}
                    </button>
                    <div className="w-px bg-zinc-800" />
                    <button
                      onClick={() => decide(item.index, 'no')}
                      disabled={state.loading}
                      className="flex-1 py-3.5 text-sm font-semibold text-zinc-400 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 disabled:opacity-50 transition-colors"
                    >
                      Skip
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {pendingCount === 0 && total > 0 && (
          <p className="text-center text-zinc-600 text-xs mt-6">
            All follow-ups reviewed. Check the dashboard for updates.
          </p>
        )}
      </div>
    </div>
  )
}
