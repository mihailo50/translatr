"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type Theme = "aurora" | "midnight";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Use lazy initializer to read from localStorage on initial render
  // This avoids calling setState in useEffect which causes cascading renders
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("translatr-theme") as Theme;
      if (savedTheme === "aurora" || savedTheme === "midnight") {
        return savedTheme;
      }
    }
    return "aurora";
  });

  useEffect(() => {
    // Apply theme class to html and body for proper dark mode
    const html = document.documentElement;
    html.classList.remove("theme-aurora", "theme-midnight");
    html.classList.add(`theme-${theme}`);

    document.body.classList.remove("theme-aurora", "theme-midnight");
    document.body.classList.add(`theme-${theme}`);
    localStorage.setItem("translatr-theme", theme);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === "aurora" ? "midnight" : "aurora"));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
