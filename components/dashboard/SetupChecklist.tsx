import Link from "next/link"
import { CheckCircle2, Circle, ArrowRight, X } from "lucide-react"

interface Step {
  label: string
  description: string
  done: boolean
  href: string
  cta: string
  altHref?: string
  altCta?: string
}

interface Props {
  steps: Step[]
  completedCount: number
}

export default function SetupChecklist({ steps, completedCount }: Props) {
  const allDone = completedCount === steps.length
  if (allDone) return null

  const pct = Math.round((completedCount / steps.length) * 100)
  const nextStep = steps.find(s => !s.done)

  return (
    <div className="bg-[#111827] border border-blue-500/20 rounded-2xl p-5 mb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-white font-semibold text-sm">Finish setting up RentSentry</h2>
            <span className="text-[11px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full font-medium">
              {completedCount}/{steps.length} done
            </span>
          </div>
          <p className="text-[#4b5563] text-xs">Complete these steps to protect your rental income.</p>
        </div>
        {/* Progress bar */}
        <div className="text-right shrink-0 ml-4">
          <div className="text-white font-bold text-sm">{pct}%</div>
          <div className="w-20 h-1.5 bg-white/[0.06] rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-1 mb-4">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
              step.done
                ? "opacity-50"
                : "bg-white/[0.02] border border-white/[0.05]"
            }`}
          >
            {step.done ? (
              <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            ) : (
              <Circle size={15} className="text-[#374151] shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${step.done ? "text-[#4b5563] line-through" : "text-white"}`}>
                {step.label}
              </div>
              {!step.done && (
                <div className="text-[#4b5563] text-xs mt-0.5">{step.description}</div>
              )}
            </div>
            {!step.done && (
              <div className="shrink-0 flex items-center gap-3">
                <Link
                  href={step.href}
                  className="flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {step.cta} <ArrowRight size={11} />
                </Link>
                {step.altHref && step.altCta && (
                  <>
                    <span className="text-[#2e3a50] text-xs">or</span>
                    <Link
                      href={step.altHref}
                      className="text-xs font-medium text-[#6b7280] hover:text-white transition-colors"
                    >
                      {step.altCta}
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Next action callout */}
      {nextStep && (
        <Link
          href={nextStep.href}
          className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 hover:bg-blue-500/15 transition-colors group"
        >
          <div>
            <div className="text-blue-400 text-xs uppercase tracking-wide mb-0.5">Next step</div>
            <div className="text-white text-sm font-medium">{nextStep.label}</div>
          </div>
          <ArrowRight size={15} className="text-blue-400 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}
    </div>
  )
}
