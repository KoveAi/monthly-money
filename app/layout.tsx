import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { BackToTop } from "@/components/BackToTop";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Monthly Money",
  description: "Personal expense tracker",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen`} style={{ background: "#ffffff", color: "#0f172a" }}>

        <header className="sticky top-0 z-50" style={{ background: "#0A1D3A", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="max-w-screen-2xl mx-auto px-6 flex items-center justify-between" style={{ height: 64 }}>
            <Link href="/dashboard" className="flex flex-col justify-center hover:opacity-85 transition-opacity" style={{ gap: 1 }}>
              <span style={{ fontFamily: "Didot, 'Bodoni MT', 'Bodoni 72', Baskerville, 'Times New Roman', serif", fontSize: 22, fontWeight: 400, letterSpacing: "0.28em", color: "#fff", lineHeight: 1 }}>
                STONE BROOK
              </span>
              <span style={{ fontFamily: "Didot, 'Bodoni MT', 'Bodoni 72', Baskerville, 'Times New Roman', serif", fontSize: 9, fontWeight: 400, letterSpacing: "1.05em", color: "rgba(255,255,255,0.65)", lineHeight: 1 }}>
                ESTATE
              </span>
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/dashboard" className="font-medium transition-colors" style={{ color: "rgba(255,255,255,0.65)", letterSpacing: "0.08em", fontSize: 11 }}>
                DASHBOARD
              </Link>
            </nav>
          </div>
        </header>

        <main>{children}</main>
        <BackToTop />

        <footer className="mt-16 py-5 text-center text-xs border-t"
          style={{ background: "#fff", borderColor: "#e2e8f0", color: "#94a3b8" }}>
          Monthly Money — Personal Expense Tracker
        </footer>
      </body>
    </html>
  );
}
