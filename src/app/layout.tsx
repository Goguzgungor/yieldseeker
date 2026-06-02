import type { ReactNode } from "react";

export const metadata = {
  title: "YieldSeeker · Stellar",
  description: "Autonomous DeFi yield agent on Stellar (backend API).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
