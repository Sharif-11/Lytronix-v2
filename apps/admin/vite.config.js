import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

// Stamps every build with a version (git short SHA, else a timestamp):
//   - <meta name="app-version"> in index.html
//   - dist/version.json           (polled by <UpdatePrompt> to detect a new deploy)
//   - SW_VERSION in dist/sw.js     (forces the service worker to update)
// Source files are never modified.
function versionStamp() {
  let ver = 'dev'
  return {
    name: 'version-stamp',
    configResolved() {
      try {
        ver = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
      } catch {
        ver = String(Date.now())
      }
    },
    transformIndexHtml(html) {
      return html.replace('</head>', `  <meta name="app-version" content="${ver}" />\n  </head>`)
    },
    writeBundle(opts) {
      const dir = opts.dir || path.join(ROOT, 'dist')
      try {
        fs.writeFileSync(
          path.join(dir, 'version.json'),
          JSON.stringify({ version: ver, builtAt: new Date().toISOString() })
        )
        const sw = path.join(dir, 'sw.js')
        if (fs.existsSync(sw)) {
          fs.writeFileSync(
            sw,
            fs.readFileSync(sw, 'utf8').replace(/const SW_VERSION = '[^']*'/, `const SW_VERSION = '${ver}'`)
          )
        }
      } catch {
        /* non-fatal */
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), versionStamp()],
  server: {
    port: 5174,
    host: true, // bind 0.0.0.0 — reachable from other devices on the LAN, not just this machine
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
