import { createContext, useContext, useState } from 'react';

const ThemeContext = createContext();

/** Keep the browser UI colour in step with the canvas. */
function syncThemeColor(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#020617' : '#eef2f7');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  syncThemeColor(theme);
}

export function ThemeProvider({ children }) {
  // Seed from the attribute the inline pre-paint script in index.html already
  // set. Re-deriving it here would repaint a second time on every load.
  // Light is the default and the device setting is not followed; only the
  // toggle below selects dark.
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'light',
  );

  const toggleTheme = () => {
    setTheme((prevTheme) => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      localStorage.setItem('app-theme', newTheme);
      applyTheme(newTheme);
      return newTheme;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);
