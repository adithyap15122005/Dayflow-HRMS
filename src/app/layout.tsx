import type { Metadata, Viewport } from "next";

import { ToastProvider } from "@/components/ui/toast";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Dayflow — workforce operations",
    template: "%s · Dayflow",
  },
  description:
    "Dayflow is the intelligent workforce operations hub: people, attendance, leave, payroll and HR analytics in one product. Every workday, perfectly aligned.",
  applicationName: "Dayflow",
  authors: [{ name: "Dayflow" }],
  keywords: ["HRMS", "attendance", "leave management", "payroll", "workforce analytics"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101527",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* Keyboard users can jump straight past the shell chrome. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-md focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to main content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
