/// <reference types="react" />

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': import('react').DetailedHTMLProps<import('react').HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        exposure?: string;
        loading?: string;
        'camera-controls'?: boolean;
        'auto-rotate'?: boolean;
        'shadow-intensity'?: string;
        'environment-image'?: string;
      };
    }
  }
}

export {};
