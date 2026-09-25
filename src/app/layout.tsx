import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { StoreProvider } from '@/components/store-provider';
import { Header } from '@/components/header';
import './globals.css';
import './storefront.css';
export const metadata: Metadata = {
  title: 'STEPPE — цены на кроссовки магазинов США и Европы',
  description:
    'Находи кроссовки любимых брендов, сравнивай цены в тенге и оформляй заказ в WhatsApp. Демоданные отмечены отдельно.',
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
                <p>Своя пара. Свой ритм.</p>
              </div>
              <div className="footer-links">
                <Link href="/about">
                  О проекте <ArrowUpRight size={14} />
                </Link>
                <Link href="/sources">
                  Источники и обновления <ArrowUpRight size={14} />
                </Link>
                <span>Казахстан · Все цены в ₸</span>
              </div>
              <p className="footer-note">
                STEPPE — каталог кроссовок. Условия заказа и оплату согласуйте в WhatsApp. ©{' '}
                {new Date().getFullYear()} STEPPE
              </p>
            </footer>
          </div>
        </StoreProvider>
      </body>
    </html>
  );
}
