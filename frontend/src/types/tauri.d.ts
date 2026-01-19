/// <reference types="@tauri-apps/api" />

declare global {
  interface Window {
    __TAURI__?: {
      tauri: {
        invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
      }
    }
  }
}

export {}
