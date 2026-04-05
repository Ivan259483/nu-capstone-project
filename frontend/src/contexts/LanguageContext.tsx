import React, { createContext, useContext, useState, useCallback } from "react";
import { en } from "@/translations/en";
import { fil } from "@/translations/fil";

type Language = "en" | "fil";

type TranslationValue = string | Record<string, unknown>;

interface LanguageContextType {
    lang: Language;
    setLang: (lang: Language) => void;
    t: (path: string) => string;
}

const translations: Record<Language, Record<string, unknown>> = { en, fil };

const LanguageContext = createContext<LanguageContextType | null>(null);

function getNestedValue(obj: Record<string, unknown>, path: string): string {
    const keys = path.split(".");
    let current: TranslationValue = obj;
    for (const key of keys) {
        if (current && typeof current === "object" && key in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[key] as TranslationValue;
        } else {
            return path; // fallback to key
        }
    }
    return typeof current === "string" ? current : path;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLangState] = useState<Language>(() => {
        return (localStorage.getItem("autoshine-lang") as Language) || "en";
    });

    const setLang = useCallback((newLang: Language) => {
        setLangState(newLang);
        localStorage.setItem("autoshine-lang", newLang);
    }, []);

    const t = useCallback(
        (path: string): string => {
            return getNestedValue(translations[lang] as Record<string, unknown>, path);
        },
        [lang]
    );

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage(): LanguageContextType {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
    return ctx;
}
