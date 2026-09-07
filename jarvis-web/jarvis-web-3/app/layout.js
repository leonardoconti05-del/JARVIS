import './globals.css';

export const metadata = {
  title: 'Jarvis',
  description: 'Agente operativo personale',
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
