declare module '~icons/*' {
    import { DefineComponent } from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}

declare module '~icons/tabler/*' {
    import { DefineComponent } from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}

declare module '~icons/mdi/*' {
    import { DefineComponent } from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}

interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string
    readonly VITE_YJS_WS_URL?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
