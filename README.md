# RentSentry

RentSentry is a delinquency workflow app for small landlords and property managers. It imports a rent roll, scores tenant risk, sends reminders/payment-plan links, tracks activity, and prepares attorney-review-ready notice drafts.

## Stack

- Next.js app router
- Supabase auth, Postgres, and RLS
- Stripe and Stripe Connect for payments
- Twilio for SMS
- Resend for email alerts
- Vitest for business-logic tests

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm test
npm run lint
npm run build
```

`npm run build` performs TypeScript checking. Do not re-enable `typescript.ignoreBuildErrors`.

## Database

Apply migrations in `supabase/migrations` before deploying. Important security expectations:

- tenant, property, payment, intervention, upload, profile, and subscription tables must have RLS enabled
- service-role routes should stay limited to trusted webhook, cron, and tenant-session flows
- payment rows must always be scoped by `user_id`

## Legal Notice Caveat

Notice drafts are not legal advice and are not guaranteed court-ready. Requirements vary by state, county, city, tenancy type, service method, rent/fee composition, and current law. Verify every notice with local counsel before service.
