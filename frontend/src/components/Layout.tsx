/**
 * Main layout component.
 */

import type { ReactNode } from 'react';
import { useDarkMode } from '../contexts/DarkModeContext';
import Header from './Header';

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  const { isDark } = useDarkMode();

  const backgroundImage = isDark ? '/background_dark.png' : '/background_light.png';
  const backgroundOpacity = isDark ? 0.25 : 0.20;

  return (
    <div className="min-h-screen bg-light-green-50 dark:bg-gray-900 relative overflow-x-hidden w-full max-w-full">
      {/* Background Image - Hidden on mobile, visible on larger screens */}
      <div 
        className="hidden md:block fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none z-0"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          opacity: backgroundOpacity,
        }}
      />
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
