import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

const projectRootDir = resolve(__dirname)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRootDir, 'src'),
    },
  },
  build: {
    lib: {
      name: 'radix-vue',
      fileName: 'index',
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['cjs', 'es'],
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library (Vue)
      external: ['vue', '@floating-ui/vue'],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        // globals: {
        //   'vue': 'Vue',
        //   '@floating-ui/vue': 'FloatingUIVue',
        // },
        // assetFileNames: (chunkInfo) => {
        //   if (chunkInfo.name === 'style.css')
        //     return 'index.css'
        //   return chunkInfo.name as string
        // },
      },
    },
    minify: false,
    sourcemap: true,
  },
})
