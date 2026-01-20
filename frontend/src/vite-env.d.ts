/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_TAURI?: string
  readonly TAURI_PLATFORM?: string
  readonly TAURI_DEBUG?: string
  readonly TAURI_FAMILY?: string
  readonly TAURI_PLATFORM_VERSION?: string
  readonly TAURI_ARCH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
