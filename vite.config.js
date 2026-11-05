import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * base 必须是 './'：插件窗口用 plugin://<id>/ui/index.html 加载，
 * 以 / 开头的资源路径会指到包根，dashou-plugin build 会直接报错拦下。
 * 端口与 src-dashou/plugin.json 的 build.devUrl 对应。
 */
export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    port: 5176,
    strictPort: true,
    watch: { ignored: ['**/src-dashou/**'] },
  },
})
