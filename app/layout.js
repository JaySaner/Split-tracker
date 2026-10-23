import './globals.css';

export const metadata = {
  title: 'SplitSmart — Shared expenses, made simple',
  description: 'A clear view of your group expenses and shared spending.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
