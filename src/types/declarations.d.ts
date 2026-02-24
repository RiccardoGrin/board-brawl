// @ts-expect-error - no types available for this library
declare module 'react-color-palette/css';

declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
  }
  export function registerSW(options?: RegisterSWOptions): (force?: boolean) => Promise<void>;
}