/**
 * Header component with navigation and dark mode toggle.
 */

import { Link, useLocation } from 'react-router-dom';
import { useDarkMode } from '../contexts/DarkModeContext';

function Header() {
  const { isDark, toggleDarkMode } = useDarkMode();
  const location = useLocation();

  const isActiveRoute = (path: string): boolean => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 shadow-lg border-b border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          {/* Logo and Title */}
          <Link 
            to="/" 
            className="flex items-center gap-1.5 sm:gap-3 hover:opacity-90 transition-opacity duration-200 cursor-pointer no-underline group flex-shrink-0 min-w-0"
          >
            <div className="relative flex-shrink-0">
              <div className="h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 rounded-full flex items-center justify-center overflow-hidden group-hover:bg-white transition-colors bg-green-500">
                <span className="text-white font-bold text-xs sm:text-sm lg:text-base">💰</span>
              </div>
            </div>
            <div className="flex flex-col">
              <h1 className="m-0 text-sm sm:text-lg lg:text-xl font-bold text-gray-900 dark:text-white leading-tight group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                Budget Planer
              </h1>
            </div>
          </Link>

          {/* Desktop Navigation and Controls */}
          <nav className="hidden lg:flex items-center gap-4">
            {/* Main Navigation Links */}
            <div className="flex items-center gap-1">
              <Link
                to="/"
                className={`px-4 py-2 text-sm font-medium transition-colors duration-200 rounded-md ${
                  isActiveRoute('/') && location.pathname === '/'
                    ? 'text-green-600 dark:text-green-400 underline'
                    : 'text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300'
                }`}
              >
                Übersicht
              </Link>
            </div>

            {/* Separator */}
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleDarkMode}
              className="px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 shadow-sm hover:shadow flex-shrink-0 cursor-pointer"
              aria-label="Toggle dark mode"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span className="text-base leading-none">{isDark ? '☀️' : '🌙'}</span>
            </button>
          </nav>

          {/* Mobile Menu Button */}
          <div className="lg:hidden flex items-center gap-1.5">
            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleDarkMode}
              className="px-1.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 shadow-sm hover:shadow flex-shrink-0 cursor-pointer h-8"
              aria-label="Toggle dark mode"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span className="text-sm leading-none">{isDark ? '☀️' : '🌙'}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
