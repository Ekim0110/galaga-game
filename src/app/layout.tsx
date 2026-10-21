import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Galaxia - Juego estilo Galaga",
  description: "Un juego de naves estilo arcade hecho con Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="bg-black antialiased">{children}</body>
    </html>
  );
}
