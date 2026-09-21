import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const port = Number(process.env.PORT ?? 4173)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  const target = normalize(join(root, urlPath))
  if (!target.startsWith(root)) {
    res.writeHead(403).end('Forbidden')
    return
  }
  if (!existsSync(target) || statSync(target).isDirectory()) {
    res.writeHead(404).end('Not Found')
    return
  }
  res.writeHead(200, { 'content-type': types[extname(target)] ?? 'application/octet-stream' })
  createReadStream(target).pipe(res)
}).listen(port, () => {
  console.log(`static server listening on http://localhost:${port}`)
})
