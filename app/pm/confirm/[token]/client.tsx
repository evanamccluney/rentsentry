'use client'

import { useState } from "react"

export interface ConfirmItem {
  index: number
  tenant_id: string
  name: string
  unit: string | null
  amount: number
  status: 'pending' | 'paid' | 'skipped'
}

interface ItemState {
  status: 'pending' | 'paid' | 'skipped'
  loading: boolean
}

export default function ConfirmClient({ token, initialItems }: { token: string; initialItems: ConfirmItem[] }) {
  const [states, setStates] = useState<Record<number, ItemState>>(
    Object.fromEntries(initialItems.map(item => [item.index, { status: item.status, loading: false }]))
  )

  async function decide(index: number, action: 'paid' | 'skip') {
    setStates(prev => ({ ...prev, [index]: { ...prev[index], loading: true } }))
    try {
      const res = await fetch(`/api/pm/confirm/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, action }),
      })
      if (res.ok) {
        setStates(prev => ({
          ...prev,
          [index]: { loading: false, status: action === 'paid' ? 'paid' : 'skipped' },
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
              ? `${pendingCount} of ${total} tenant${total > 1 ? 's' : ''} pending confirmation`
              : 'All confirmed.'}
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
                    <p className="text-white text-sm font-semibold leading-snug break-words">{item.name}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {item.unit ? `Unit ${item.unit} · ` : ''}${item.amount.toLocaleString()}
                    </p>
                  </div>
                  {isDone && (
                    <span className={`text-xs font-semibold flex-shrink-0 mt-0.5 ${state.status === 'paid' ? 'text-emerald-400' : 'text-zinc-600'}`}>
                      {state.status === 'paid' ? 'Paid ✓' : 'Skipped'}
                    </span>
                  )}
                </div>

                {/* Buttons row */}
                {!isDone && (
                  <div className="flex border-t border-zinc-800">
                    <button
                      onClick={() => decide(item.index, 'paid')}
                      disabled={state.loading}
                      className="flex-1 py-3.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {state.loading ? '…' : 'Mark Paid'}
                    </button>
                    <div className="w-px bg-zinc-800" />
                    <button
                      onClick={() => decide(item.index, 'skip')}
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
            All tenants reviewed. Automation will use updated data.
          </p>
        )}
      </div>
    </div>
  )
}
