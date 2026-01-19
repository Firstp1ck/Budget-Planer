/**
 * Dark mode context for managing theme state.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface DarkModeContextType {
  isDark: boolean;
  toggleDarkMode: () => void;
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

export function DarkModeProvider({ children }: { children: ReactNode }) {
  // Initialize state from localStorage or system preference
  // Note: The class is already applied in index.html script tag before React renders
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    
    // Check localStorage first
    const stored = localStorage.getItem('darkMode');
    if (stored !== null) {
      return stored === 'true';
    }
    
    // Fall back to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Sync state with actual HTML class on mount only
  useEffect(() => {
    const root = document.documentElement;
    const hasDarkClass = root.classList.contains('dark');
    const stored = localStorage.getItem('darkMode');
    
    // If there's a stored value, ensure DOM matches it
    if (stored !== null) {
      const shouldBeDark = stored === 'true';
      if (shouldBeDark !== hasDarkClass) {
        if (shouldBeDark) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    } else {
      // If no stored value, sync state with current DOM state (from system preference)
      // The state was initialized from system preference, but DOM might differ
      // So we sync state to match what the DOM actually has (set by index.html script)
      if (hasDarkClass !== isDark) {
        requestAnimationFrame(() => {
          setIsDark(hasDarkClass);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount - isDark is intentionally excluded as we want initial value

  // Apply dark class whenever isDark changes
  useEffect(() => {
    const root = document.documentElement;
    
    if (isDark) {
      if (!root.classList.contains('dark')) {
        root.classList.add('dark');
      }
      localStorage.setItem('darkMode', 'true');
    } else {
      // Explicitly remove the dark class to ensure light mode works
      if (root.classList.contains('dark')) {
        root.classList.remove('dark');
      }
      localStorage.setItem('darkMode', 'false');
    }
  }, [isDark]);

  const toggleDarkMode = () => {
    setIsDark((prev) => {
      const newValue = !prev;
      const root = document.documentElement;
      
      // Force update DOM immediately for instant feedback
      if (newValue) {
        if (!root.classList.contains('dark')) {
          root.classList.add('dark');
        }
        localStorage.setItem('darkMode', 'true');
      } else {
        // Explicitly remove the dark class to ensure light mode works
        if (root.classList.contains('dark')) {
          root.classList.remove('dark');
        }
        localStorage.setItem('darkMode', 'false');
      }
      
      return newValue;
    });
  };

  return (
    <DarkModeContext.Provider value={{ isDark, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDarkMode() {
  const context = useContext(DarkModeContext);
  if (context === undefined) {
    throw new Error('useDarkMode must be used within a DarkModeProvider');
  }
  return context;
}
