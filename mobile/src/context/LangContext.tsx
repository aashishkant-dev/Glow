import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Localization from 'expo-localization';
import { Storage } from '../utils/storage';
import { resolveInitialLang } from '../i18n/resolveLang';
import { strings, type Lang, type Namespace } from '../i18n/strings';

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LangContext = createContext<LangContextValue | undefined>(undefined);

export function LangProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    (async () => {
      const saved = await Storage.getLang();
      const device = Localization.getLocales?.()[0]?.languageTag ?? null;
      setLangState(resolveInitialLang(saved, device));
    })();
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    Storage.saveLang(l).catch(() => {});
  };

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}

export function useT<N extends Namespace>(ns: N): (typeof strings)['en'][N] {
  const { lang } = useLang();
  return strings[lang][ns] as (typeof strings)['en'][N];
}
