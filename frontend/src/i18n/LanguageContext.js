import React, { createContext, useState, useContext } from 'react';
import translations from './Translations';

const LanguageContext = createContext();

const DEFAULT_LANGUAGE = 'en';
const SUPPORTED_LANGUAGES = Object.keys(translations);

// Pick a supported language: stored preference > browser language > default.
// Prevents devices set to unsupported locales (pt, fr, de...) from showing raw keys.
const resolveInitialLanguage = () => {
  let stored;
  try {
    stored = localStorage.getItem('gameLanguage');
  } catch (_) {
    stored = null;
  }
  if (stored && SUPPORTED_LANGUAGES.includes(stored)) return stored;

  const browser = (navigator.language || '').split('-')[0];
  if (SUPPORTED_LANGUAGES.includes(browser)) return browser;

  return DEFAULT_LANGUAGE;
};

// Walk a dotted key path inside a translations tree. Returns undefined if missing.
const lookup = (tree, keys) => {
  let value = tree;
  for (const k of keys) {
    value = value?.[k];
    if (value === undefined || value === null) return undefined;
  }
  return value;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(resolveInitialLanguage);

  const t = (key) => {
    const keys = key.split('.');
    // Try current language, then fall back to default (English), then the key.
    const value = lookup(translations[language], keys);
    if (value !== undefined) return value;

    const fallback = lookup(translations[DEFAULT_LANGUAGE], keys);
    if (fallback !== undefined) return fallback;

    return key;
  };

  const changeLanguage = (newLang) => {
    if (!SUPPORTED_LANGUAGES.includes(newLang)) return;
    setLanguage(newLang);
    try {
      localStorage.setItem('gameLanguage', newLang);
    } catch (_) {
      /* ignore storage errors (private mode, etc.) */
    }
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};