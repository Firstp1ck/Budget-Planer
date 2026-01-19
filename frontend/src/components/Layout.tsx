/**
 * Main layout component.
 */

import type { ReactNode } from 'react';
import Header from './Header';

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-light-green-50 dark:bg-gray-900 relative overflow-x-hidden w-full max-w-full">
      {/* Content Overlay */}
      <div className="relative z-10 w-full max-w-full overflow-x-hidden">
        <Header />
        <main className="w-full pt-16 sm:pt-20 md:pt-24 pb-4 sm:pb-6 md:pb-8 max-w-full overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;
