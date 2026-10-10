import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useLocalStorage } from "@mantine/hooks";

type Locale = "zh-CN" | "en";
const LocaleContext = createContext({
  locale: "zh-CN" as Locale,
  setLocale: (_locale: Locale) => {},
  t: (zh: string, _en: string) => zh,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useLocalStorage<Locale>({
    key: "cursor-gateway-locale",
    defaultValue: "zh-CN",
  });
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <LocaleContext
      value={{
        locale,
        setLocale,
        t: (zh, en) => (locale === "zh-CN" ? zh : en),
      }}
    >
      {children}
    </LocaleContext>
  );
}

export const useLocale = () => useContext(LocaleContext);
