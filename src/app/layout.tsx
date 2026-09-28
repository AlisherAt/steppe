import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { StoreProvider } from '@/components/store-provider';
import { Header } from '@/components/header';
import './globals.css';
import './storefront.css';
import './shopping.css';
export const metadata: Metadata = {
  title: 'STEPPE — кроссовки и одежда со скидками',
  description:
    'Находи кроссовки и одежду любимых брендов, сравнивай цены в тенге и оформляй заказ в WhatsApp. Демоданные отмечены отдельно.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-scroll-behavior="smooth">
      <body>
        <StoreProvider>
          <a className="skip-link" href="#main-content">
            Перейти к содержимому
          </a>
          <div className="site-wrap">
            <Header />
            {children}
            <footer className="footer">
              <div>
                <Link className="wordmark" href="/">
                  STEPPE<span className="brand-star">✳</span>.
                </Link>
                <p>Твой стиль. Твои правила.</p>
              </div>
              <div className="footer-links">
                <Link href="/about">
                  О проекте <ArrowUpRight size={14} />
                </Link>
                <span>Казахстан · Все цены в ₸</span>
              </div>
              <p className="footer-note">
                STEPPE — каталог кроссовок и одежды. Условия заказа и оплату согласуйте в WhatsApp.
                © {new Date().getFullYear()} STEPPE
              </p>
            </footer>
          </div>
        </StoreProvider>
      </body>
    </html>
  );
}
