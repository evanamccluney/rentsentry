import type { Metadata } from "next"
import { Geist, Geist_Mono, Bricolage_Grotesque, Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "RentSentry — Rent Collection & Eviction Prevention",
  description: "Stop losing rent to late tenants. Automated SMS reminders, AI advisor, and state-specific legal notices for independent landlords.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, bricolage.variable, "font-sans", inter.variable)}>
      <body className="min-h-full flex flex-col bg-[#09090b] text-white">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
