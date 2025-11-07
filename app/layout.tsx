export const metadata = {
  title: "Under Development | Luxe Realty",
  description: "Our premium real estate experience is under development.",
};

import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
