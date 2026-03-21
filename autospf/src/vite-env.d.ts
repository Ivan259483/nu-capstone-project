/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    readonly VITE_EMAILJS_PUBLIC_KEY: string;
    readonly VITE_EMAILJS_PRIVATE_KEY: string;
    readonly VITE_PHOTOGRAMMETRY_API_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
