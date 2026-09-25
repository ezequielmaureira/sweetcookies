import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { CartProvider } from "@/components/cart/CartProvider";
import { site } from "@/data/site";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT"],
  style: ["normal", "italic"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${site.name} — Cookies artesanales`,
  description: "Cookies artesanales, combinaciones únicas y mucho sabor. Elegí tus favoritas y armá tu caja.",
};

export const viewport: Viewport = {
  themeColor: "#faf6ef",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" className={`${fraunces.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        {/* Habilita los estilos de reveal solo cuando hay JS (sin JS el contenido queda visible). */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
