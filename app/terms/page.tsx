import Link from "next/link"
import { Shield } from "lucide-react"

export default function TermsPage() {
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
        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-[#6b7280] text-sm mb-12">Last updated: April 19, 2026</p>

        <div className="space-y-10 text-[#d1d5db] leading-relaxed">

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p>By creating an account or using RentSentry ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. These terms apply to all users including property managers, landlords, and any other individuals accessing the platform.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">2. Description of Service</h2>
            <p>RentSentry is a software platform that helps property managers and landlords manage tenant risk, automate rent collection communications, generate legal notices, and receive AI-powered guidance. The Service is provided on a subscription basis.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">3. Eligibility</h2>
            <p>You must be at least 18 years old and have the legal authority to enter into these Terms to use RentSentry. By using the Service, you represent that you meet these requirements.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">4. Your Account</h2>
            <p className="mb-3">You are responsible for:</p>
            <ul className="list-disc list-inside space-y-2 text-[#9ca3af]">
              <li>Maintaining the confidentiality of your login credentials</li>
              <li>All activity that occurs under your account</li>
              <li>Notifying us immediately of any unauthorized access at support@rentsentry.com</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">5. Acceptable Use</h2>
            <p className="mb-3">You agree to use RentSentry only for lawful purposes. You may not:</p>
            <ul className="list-disc list-inside space-y-2 text-[#9ca3af]">
              <li>Use the Service to harass, threaten, or intimidate tenants</li>
              <li>Send SMS messages in violation of the TCPA or any applicable telecommunications law</li>
              <li>Upload false or misleading tenant data</li>
              <li>Attempt to reverse engineer, hack, or disrupt the Service</li>
              <li>Resell or sublicense access to the Service without our written permission</li>
              <li>Use the Service in any way that violates federal, state, or local landlord-tenant laws</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">6. SMS Messaging</h2>
            <p>By using our SMS features, you agree to:</p>
            <ul className="list-disc list-inside space-y-2 text-[#9ca3af] mt-3">
              <li>Only send messages to tenants who have a legitimate tenancy relationship with you</li>
              <li>Comply with all applicable laws including the TCPA, CAN-SPAM Act, and state equivalents</li>
              <li>Honor opt-out requests from tenants promptly</li>
              <li>Not use our SMS service for marketing unrelated to rent collection or property management</li>
            </ul>
            <p className="mt-3">You are solely responsible for the content of messages sent through RentSentry. We reserve the right to suspend SMS access if we detect abuse.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">7. AI-Generated Advice</h2>
            <p>RentSentry uses artificial intelligence to provide guidance about tenant situations and property management decisions. This guidance is for informational purposes only and does not constitute legal advice. You should consult a licensed attorney before taking legal action against a tenant, filing for eviction, or serving formal legal notices. RentSentry is not responsible for any decisions you make based on AI-generated recommendations.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">8. Legal Notices</h2>
            <p>RentSentry generates Pay or Quit notices and other documents based on state law data. While we make reasonable efforts to keep this information accurate, laws change and local courts may have specific requirements. You are responsible for verifying that any notice generated by RentSentry complies with current law in your jurisdiction before serving it. We recommend having an attorney review legal documents before use.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">9. Subscription and Billing</h2>
            <p className="mb-3">RentSentry is offered on a monthly subscription basis. By subscribing, you agree that:</p>
            <ul className="list-disc list-inside space-y-2 text-[#9ca3af]">
              <li>Subscription fees are billed monthly in advance</li>
              <li>You authorize us to charge your payment method on file each billing cycle</li>
              <li>Refunds are not provided for partial months</li>
              <li>We may change pricing with 30 days notice</li>
              <li>You can cancel at any time and retain access through the end of your billing period</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">10. Data and Privacy</h2>
            <p>Your use of RentSentry is also governed by our <Link href="/privacy" className="text-blue-400 hover:underline">Privacy Policy</Link>, which is incorporated into these Terms by reference. You are responsible for ensuring that your collection and use of tenant data complies with applicable privacy laws.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">11. Intellectual Property</h2>
            <p>RentSentry and all its content, features, and functionality are owned by RentSentry and protected by intellectual property laws. You may not copy, modify, distribute, or create derivative works without our written permission. You retain ownership of any data you upload to the Service.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">12. Disclaimers</h2>
            <p>THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">13. Limitation of Liability</h2>
            <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, RENTSENTRY SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID TO US IN THE PAST 12 MONTHS.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">14. Indemnification</h2>
            <p>You agree to indemnify and hold harmless RentSentry and its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including attorney's fees) arising from your use of the Service, violation of these Terms, or infringement of any third party's rights.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">15. Termination</h2>
            <p>We may suspend or terminate your account at any time if you violate these Terms. You may cancel your account at any time through your account settings. Upon termination, your right to use the Service ceases immediately.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">16. Governing Law</h2>
            <p>These Terms are governed by the laws of the United States. Any disputes shall be resolved through binding arbitration rather than in court, except that either party may seek injunctive relief in court for intellectual property violations.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">17. Changes to Terms</h2>
            <p>We may update these Terms at any time. We will notify you of material changes by email or in-app notice. Continued use of the Service after changes take effect constitutes acceptance of the updated Terms.</p>
          </section>

          <section>
            <h2 className="text-white text-xl font-semibold mb-3">18. Contact</h2>
            <p>For questions about these Terms, contact us at:<br />
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
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="text-white">Terms</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
