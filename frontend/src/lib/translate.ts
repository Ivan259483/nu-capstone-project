import { en } from "@/translations/en";
import { fil } from "@/translations/fil";

export type AppLanguage = "en" | "fil";

const catalogs: Record<AppLanguage, Record<string, unknown>> = { en, fil };

export function translate(lang: AppLanguage, path: string): string {
    const keys = path.split(".");
    let current: unknown = catalogs[lang];
    for (const key of keys) {
        if (current && typeof current === "object" && key in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[key];
        } else {
            return path;
        }
    }
    return typeof current === "string" ? current : path;
}
