import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@rentsentry.com"

function html(body: string): string {
  const paragraphs = body.split("\n").filter(Boolean).map(p => `<p>${p}</p>`).join("")
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0e1a;margin:0;padding:40px 20px}
.card{background:#111827;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:32px;max-width:480px;margin:0 auto}
.logo{color:#fff;font-size:18px;font-weight:700;margin-bottom:24px;letter-spacing:-.3px}
p{color:#9ca3af;font-size:15px;line-height:1.65;margin:0 0 14px}
.footer{color:#374151;font-size:12px;margin-top:24px;border-top:1px solid rgba(255,255,255,.05);padding-top:16px}
</style></head><body><div class="card">
<div class="logo">RentSentry</div>
${paragraphs}
<div class="footer">Sent on behalf of your property manager via RentSentry. Do not reply to this email — contact your property manager directly.</div>
</div></body></html>`
}

export const EMAIL_TEMPLATES: Record<string, (name: string) => { subject: string; text: string }> = {
  proactive_reminder: (name) => ({
    subject: "Upcoming Rent Reminder",
    text: `Hi ${name},\n\nRent is due on the 1st. Based on your payment history we wanted to reach out early — please ensure your payment is ready.\n\nContact your property manager with any questions.`,
  }),
  payment_reminder: (name) => ({
    subject: "Rent Payment Reminder",
    text: `Hi ${name},\n\nThis is a reminder that rent is due on the 1st. Please ensure payment is ready.\n\nContact your property manager with any questions.`,
  }),
  payment_method_alert: (name) => ({
    subject: "No Payment Method on File",
    text: `Hi ${name},\n\nWe noticed there is no payment method on file for your account. Please add a payment method before the 1st to avoid any delays or issues with your tenancy.`,
  }),
  card_expiry_alert: (name) => ({
    subject: "Payment Method Needs Attention",
    text: `Hi ${name},\n\nYour payment card on file is expiring soon. Please update your payment method before the 1st to avoid a missed payment.`,
  }),
  pre_due_delinquent_warning: (name) => ({
    subject: "Outstanding Balance — Rent Due Soon",
    text: `Hi ${name},\n\nYou have an outstanding balance on your account and your next rent payment is coming up soon. Please contact your property manager to discuss your account and avoid further fees.`,
  }),
  pre_due_urgent: (name) => ({
    subject: "Urgent: Rent Is Due",
    text: `Hi ${name},\n\nThis is an urgent reminder that rent is due. Please make your payment or contact your property manager immediately to avoid further action.`,
  }),
  split_pay_offer: (name) => ({
    subject: "Flexible Payment Option Available",
    text: `Hi ${name},\n\nYour property manager is offering a flexible split-payment arrangement this month. Please contact them to set up installments before the 1st.`,
  }),
  cash_for_keys: (name) => ({
    subject: "Important: Time-Sensitive Offer Regarding Your Unit",
    text: `Hi ${name},\n\nYour property manager has a time-sensitive offer regarding your unit. Please contact them within 5 days to discuss your options.`,
  }),
  legal_packet: (name) => ({
    subject: "Urgent Notice: Legal Proceedings Being Prepared",
    text: `Hi ${name},\n\nYour account is significantly overdue and legal proceedings are being prepared. Please contact your property manager immediately to resolve this before further action is taken.`,
  }),
  overdue_warning: (name) => ({
    subject: "Important: Your Rent Account Is Past Due",
    text: `Hi ${name},\n\nYour rent account is past due. Please contact your property manager immediately to resolve your balance and avoid further action, including formal notice and legal proceedings.`,
  }),
}

export async function sendAttorneyHandoff(opts: {
  attorneyEmail: string
  attorneyName: string | null
  pmName: string | null
  pmEmail: string
  tenantName: string
  unit: string
  propertyName: string | null
  propertyAddress: string | null
  propertyState: string | null
  balanceDue: number
  rentAmount: number
  daysPastDue: number
  latePaymentCount: number
  daysLateAvg: number
  previousDelinquency: boolean
  interventionSummary: string
}): Promise<{ ok: boolean; error?: string }> {
  const greeting = opts.attorneyName ? `Dear ${opts.attorneyName},` : "Dear Attorney,"
  const location = [opts.propertyAddress ?? opts.propertyName, opts.propertyState].filter(Boolean).join(", ")
  const monthsOwed = opts.rentAmount > 0 ? (opts.balanceDue / opts.rentAmount).toFixed(1) : "?"

  const body = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#fff;color:#1a1a1a;">
      <p style="font-size:12px;color:#888;margin:0 0 20px;">Sent via RentSentry — ${new Date().toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" })}</p>
      <h2 style="font-size:18px;margin:0 0 4px;">Nonpayment Matter: ${opts.tenantName}</h2>
      <p style="font-size:13px;color:#555;margin:0 0 24px;">Unit ${opts.unit}${location ? ` · ${location}` : ""}</p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
        <tr style="background:#f8f8f8;">
          <td style="padding:8px 12px;border:1px solid #e5e5e5;font-weight:600;">Property</td>
          <td style="padding:8px 12px;border:1px solid #e5e5e5;">${location || "—"}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border:1px solid #e5e5e5;font-weight:600;">Tenant</td>
          <td style="padding:8px 12px;border:1px solid #e5e5e5;">${opts.tenantName}, Unit ${opts.unit}</td>
        </tr>
        <tr style="background:#f8f8f8;">
          <td style="padding:8px 12px;border:1px solid #e5e5e5;font-weight:600;">Days Past Due</td>
          <td style="padding:8px 12px;border:1px solid #e5e5e5;color:#dc2626;font-weight:700;">${opts.daysPastDue} days</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border:1px solid #e5e5e5;font-weight:600;">Balance Owed</td>
          <td style="padding:8px 12px;border:1px solid #e5e5e5;color:#dc2626;font-weight:700;">$${opts.balanceDue.toLocaleString()} (${monthsOwed} months)</td>
        </tr>
        <tr style="background:#f8f8f8;">
          <td style="padding:8px 12px;border:1px solid #e5e5e5;font-weight:600;">Monthly Rent</td>
          <td style="padding:8px 12px;border:1px solid #e5e5e5;">$${opts.rentAmount.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border:1px solid #e5e5e5;font-weight:600;">Late Payment History</td>
          <td style="padding:8px 12px;border:1px solid #e5e5e5;">${opts.latePaymentCount} late payment${opts.latePaymentCount !== 1 ? "s" : ""}, avg ${opts.daysLateAvg} days late${opts.previousDelinquency ? " · prior delinquency on record" : ""}</td>
        </tr>
      </table>

      <h3 style="font-size:14px;margin:0 0 10px;">Intervention Timeline</h3>
      <div style="background:#f8f8f8;border:1px solid #e5e5e5;border-radius:6px;padding:12px 16px;font-size:12px;color:#444;white-space:pre-line;margin-bottom:24px;">${opts.interventionSummary || "No prior interventions recorded."}</div>

      <p style="font-size:13px;color:#333;margin:0 0 8px;">
        We are seeking your advice regarding our options for recovering possession of the above-described premises and all amounts owed. Please let us know what additional documentation you require and your availability to discuss next steps.
      </p>
      <p style="font-size:13px;color:#333;margin:0 0 24px;">
        A full ledger and intervention audit log are available on request.
      </p>

      <p style="font-size:13px;">Respectfully,<br/><strong>${opts.pmName || "Property Manager"}</strong><br/><span style="color:#666;">${opts.pmEmail}</span></p>

      <p style="font-size:11px;color:#aaa;margin-top:24px;padding-top:16px;border-top:1px solid #e5e5e5;">Prepared with RentSentry. This email does not constitute legal advice.</p>
    </div>`

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.attorneyEmail,
      replyTo: opts.pmEmail,
      subject: `Nonpayment Matter: ${opts.tenantName} — Unit ${opts.unit}${opts.propertyState ? ` (${opts.propertyState})` : ""}`,
      html: body,
    })
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: (err as Error)?.message ?? "Unknown error" }
  }
}

export async function sendTenantEmail(
  to: string,
  type: string,
  tenantName: string
): Promise<{ ok: boolean; error?: string }> {
  const template = EMAIL_TEMPLATES[type]
  if (!template) return { ok: false, error: `No email template for type: ${type}` }

  const { subject, text } = template(tenantName)

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: html(text),
      text,
    })
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: (err as Error)?.message ?? "Unknown error" }
  }
}
