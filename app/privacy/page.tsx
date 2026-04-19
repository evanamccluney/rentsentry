import Link from "next/link"
import { Shield } from "lucide-react"

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0a0e1a] text-white">
      {/* Nav */}
      <nav className="border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Shield size={18} className="text-blue-400" />
            <span className="font-bold text-white text-lg">RentSentry</span>
          </Link>
          <Link href="/" className="text-[#6b7280] hover:text-white text-sm transition-colors">
            ← Back to home
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-[#6b7280] text-sm mb-12">Last updated: April 19, 2026</p>

        <div className="space-y-10 text-[#d1d5db] leading-relaxed">

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">1. Who We Are</h2>
            <p>RentSentry ("we," "us," or "our") is a property management tool that helps landlords and property managers track rent payments, manage tenant risk, and automate communications. We are operated by RentSentry and can be contacted at support@rentsentry.com.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">2. Information We Collect</h2>
            <p className="mb-3">We collect information you provide directly to us, including:</p>
            <ul className="list-disc list-inside space-y-2 text-[#9ca3af]">
              <li>Account information (name, email address, password)</li>
              <li>Property and tenant data you upload or enter (tenant names, unit numbers, rent amounts, balances, phone numbers)</li>
              <li>Payment information processed through our billing provider (Stripe)</li>
              <li>Communications you send through our platform (SMS messages, AI advisor conversations)</li>
              <li>Usage data and analytics about how you interact with our service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">3. How We Use Your Information</h2>
            <p className="mb-3">We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-2 text-[#9ca3af]">
              <li>Provide, operate, and improve the RentSentry service</li>
              <li>Send automated SMS messages to tenants on your behalf via Twilio</li>
              <li>Generate AI-powered advice using OpenAI's API based on tenant data you provide</li>
              <li>Process payments and manage your subscription via Stripe</li>
              <li>Send you service-related emails and notifications</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">4. Tenant Data</h2>
            <p className="mb-3">You may upload or enter personal information about your tenants (including names, phone numbers, and financial data). By doing so, you represent that:</p>
            <ul className="list-disc list-inside space-y-2 text-[#9ca3af]">
              <li>You have the legal right to collect and process this information</li>
              <li>You have obtained any required consents from your tenants</li>
              <li>Your use of tenant data complies with applicable landlord-tenant laws in your jurisdiction</li>
            </ul>
            <p className="mt-3">We process tenant data solely to provide the service to you. We do not sell, share, or use tenant data for our own marketing purposes.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">5. SMS Communications</h2>
            <p>RentSentry sends SMS messages to tenants on behalf of property managers using Twilio's messaging platform. Message frequency varies based on your usage. Standard message and data rates may apply. Tenants can reply STOP to opt out of future messages. By using our SMS features, you agree to comply with applicable telecommunications laws including the TCPA.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">6. Third-Party Services</h2>
            <p className="mb-3">We use the following third-party services to operate RentSentry:</p>
            <ul className="list-disc list-inside space-y-2 text-[#9ca3af]">
              <li><strong className="text-white">Supabase</strong> — database and authentication</li>
              <li><strong className="text-white">OpenAI</strong> — AI-powered tenant advice</li>
              <li><strong className="text-white">Twilio</strong> — SMS delivery</li>
              <li><strong className="text-white">Stripe</strong> — payment processing</li>
              <li><strong className="text-white">Vercel</strong> — hosting and deployment</li>
            </ul>
            <p className="mt-3">Each of these providers has their own privacy policy governing their use of data.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">7. Data Security</h2>
            <p>We implement industry-standard security measures to protect your data, including encryption in transit (TLS) and at rest. However, no method of transmission over the internet is 100% secure. We encourage you to use a strong password and keep your login credentials private.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">8. Data Retention</h2>
            <p>We retain your account data for as long as your account is active. If you delete your account, we will delete your data within 30 days, except where we are required to retain it for legal or compliance purposes.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">9. Your Rights</h2>
            <p className="mb-3">Depending on your location, you may have the right to:</p>
            <ul className="list-disc list-inside space-y-2 text-[#9ca3af]">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to or restrict processing of your data</li>
              <li>Export your data in a portable format</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, contact us at support@rentsentry.com.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">10. Children's Privacy</h2>
            <p>RentSentry is not directed to children under 18. We do not knowingly collect personal information from children. If you believe we have inadvertently collected information from a child, please contact us immediately.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">11. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes by email or by posting a notice in the app. Your continued use of RentSentry after changes take effect constitutes your acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">12. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact us at:<br />
            <span className="text-blue-400">support@rentsentry.com</span></p>
          </section>

        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] px-6 py-8 mt-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield size={15} className="text-blue-400" />
            <span className="text-white font-semibold">RentSentry</span>
          </div>
          <div className="flex items-center gap-6 text-[#4b5563] text-sm">
            <Link href="/privacy" className="text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
