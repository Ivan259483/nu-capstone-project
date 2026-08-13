const ICONIFY_SCRIPT_ID = "iconify-icon-web-component";
const ICONIFY_SCRIPT_SRC = "https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js";

let iconifyLoadPromise: Promise<void> | undefined;

/** Load Iconify once, only on routes that render its custom elements. */
export function ensureIconify(): Promise<void> {
    if (typeof window === "undefined" || window.customElements?.get("iconify-icon")) {
        return Promise.resolve();
    }

    if (iconifyLoadPromise) return iconifyLoadPromise;

    const existingScript = document.getElementById(ICONIFY_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
        iconifyLoadPromise = new Promise((resolve, reject) => {
            existingScript.addEventListener("load", () => resolve(), { once: true });
            existingScript.addEventListener("error", () => reject(new Error("Iconify failed to load.")), { once: true });
        });
        return iconifyLoadPromise;
    }

    iconifyLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.id = ICONIFY_SCRIPT_ID;
        script.src = ICONIFY_SCRIPT_SRC;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Iconify failed to load."));
        document.head.appendChild(script);
    });

    return iconifyLoadPromise;
}
