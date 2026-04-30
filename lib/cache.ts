import { unstable_cache } from "next/cache"
import { createClient } from "@supabase/supabase-js"

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const getCachedTenants = (userId: string) =>
  unstable_cache(
    async () => {
      const { data } = await service()
        .from("tenants")
        .select(`
          id, unit, name, email, phone,
          rent_amount, balance_due, rent_due_day,
          risk_score, risk_reasons,
          days_late_avg, late_payment_count,
          previous_delinquency, card_expiry, payment_method,
          last_payment_date, resolution_status, lease_end, created_at,
          properties(name, id, state, address)
        `)
        .eq("user_id", userId)
        .eq("status", "active")
      return data ?? []
    },
    [`tenants-${userId}`],
    { tags: [`tenant-data-${userId}`], revalidate: 300 }
  )()

export const getCachedProperties = (userId: string) =>
  unstable_cache(
    async () => {
      const { data } = await service()
        .from("properties")
        .select("id, name, address, state")
        .eq("user_id", userId)
        .order("name")
      return data ?? []
    },
    [`properties-${userId}`],
    { tags: [`tenant-data-${userId}`], revalidate: 300 }
  )()

export const getCachedProfile = (userId: string) =>
  unstable_cache(
    async () => {
      const { data } = await service()
        .from("profiles")
        .select("onboarded, auto_mode")
        .eq("id", userId)
        .single()
      return data
    },
    [`profile-${userId}`],
    { tags: [`user-meta-${userId}`], revalidate: 300 }
  )()

export const getCachedSubscription = (userId: string) =>
  unstable_cache(
    async () => {
      const { data } = await service()
        .from("subscriptions")
        .select("status")
        .eq("user_id", userId)
        .single()
      return data
    },
    [`subscription-${userId}`],
    { tags: [`user-meta-${userId}`], revalidate: 300 }
  )()
