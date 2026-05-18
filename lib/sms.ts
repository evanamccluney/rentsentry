import twilio from "twilio"

const FROM = process.env.TWILIO_PHONE_NUMBER!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendTenantSms(supabase: any, tenantId: string, to: string, body: string): Promise<boolean> {
  const { data } = await supabase
    .from("tenants")
    .select("sms_opted_out")
    .eq("id", tenantId)
    .single()

  if (data?.sms_opted_out) return false

  try {
    const tw = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    await tw.messages.create({
      from: FROM,
      to,
      body,
      statusCallback: `${APP_URL}/api/webhooks/sms/status`,
    })
    return true
  } catch {
    return false
  }
}
