import { Inter, JetBrains_Mono } from 'next/font/google';

import './globals.css';
import { DatabaseModal } from '@/components/database';
import { Providers } from '@/components/providers';
import { Sidebar } from '@/components/sidebar';
import { Footer } from '@/components/ui/Footer';
import { UploadModal } from '@/components/upload-modal';

import type { Metadata } from 'next';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'AXIS - AI Evaluation Platform',
  description: 'Comprehensive AI evaluation, analytics, and testing platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${inter.className}`}>
        <Providers>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-auto bg-background">
              <div className="flex min-h-full flex-col">
                <div className="flex-1">{children}</div>
                <Footer />
              </div>
            </main>
          </div>
          <UploadModal />
          <DatabaseModal />
        </Providers>
      </body>
    </html>
  );
}
