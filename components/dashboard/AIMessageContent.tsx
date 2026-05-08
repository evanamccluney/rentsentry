"use client"

const SECTION_RE = /^(Recommended Next Step|Why|Decision Rules|Suggested Action|Questions To Confirm|Optional SMS)$/

function normalize(content: string) {
  return content
    .replace(/\s*\*\*(Recommended Next Step|Why|Decision Rules|Suggested Action|Optional SMS)\*\*\s*/g, "\n\n**$1**\n")
    .replace(/\s*\*\*(Questions To Confirm)\*\*\s*/g, "\n\n**$1**\n")
    .replace(/\s+- (No response|Promised payment|Broken promise|Hardship|Repair\/dispute):/g, "\n- $1:")
    .replace(/\s+([1-3])\.\s+/g, "\n$1. ")
    .replace(/\*\*/g, "")
    .trim()
}

export default function AIMessageContent({ content }: { content: string }) {
  const lines = normalize(content).split(/\n+/).map(line => line.trim()).filter(Boolean)

  return (
    <div className="space-y-3">
      {lines.map((line, index) => {
        if (SECTION_RE.test(line)) {
          return (
            <div key={`${line}-${index}`} className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
              {line}
            </div>
          )
        }

        if (line.startsWith("- ")) {
          const text = line.slice(2)
          const colon = text.indexOf(":")
          const label = colon > -1 ? text.slice(0, colon) : null
          const body = colon > -1 ? text.slice(colon + 1).trim() : text

          return (
            <div key={`${line}-${index}`} className="flex gap-2 text-[13px] leading-relaxed text-[#d1d5db]">
              <span className="mt-2 h-1 w-1 rounded-full bg-amber-400/70 shrink-0" />
              <p>
                {label && <span className="font-medium text-white">{label}: </span>}
                {body}
              </p>
            </div>
          )
        }

        if (/^[1-3]\.\s/.test(line)) {
          const marker = line.slice(0, 2)
          const body = line.slice(3)

          return (
            <div key={`${line}-${index}`} className="flex gap-2 text-[13px] leading-relaxed text-[#d1d5db]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-amber-300 shrink-0">
                {marker[0]}
              </span>
              <p>{body}</p>
            </div>
          )
        }

        return (
          <p key={`${line}-${index}`} className="text-[13px] leading-relaxed text-[#d1d5db]">
            {line}
          </p>
        )
      })}
    </div>
  )
}
