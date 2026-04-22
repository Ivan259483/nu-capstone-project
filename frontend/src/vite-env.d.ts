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

declare namespace JSX {
    interface IntrinsicElements {
        'iconify-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
            icon?: string;
            width?: string | number;
            height?: string | number;
            rotate?: string | number;
            flip?: string;
            inline?: boolean;
        }, HTMLElement>;
    }
}
