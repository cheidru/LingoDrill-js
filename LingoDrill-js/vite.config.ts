import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { writeFileSync, readFileSync } from 'fs'

// Plugin: ensure viewport meta is in built HTML + create 404.html for GH Pages
function ghPagesSpaPlugin() {
  return {
    name: 'gh-pages-spa',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist')
      const indexPath = resolve(distDir, 'index.html')

      try {
        let html = readFileSync(indexPath, 'utf-8')

        // Ensure viewport meta tag exists
        if (!html.includes('name="viewport"')) {
          html = html.replace(
            '<head>',
            '<head>\n    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />'
          )
          writeFileSync(indexPath, html)
        }

        // Copy index.html → 404.html for GitHub Pages SPA routing
        writeFileSync(resolve(distDir, '404.html'), html)
        console.log('✅ Created 404.html for GitHub Pages SPA support')
      } catch (e) {
        console.warn('gh-pages-spa plugin: could not process dist/index.html', e)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // base: '/',
  base: '/LingoDrill-js/',
  plugins: [react(), ghPagesSpaPlugin()],
})