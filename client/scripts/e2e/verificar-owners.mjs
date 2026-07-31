import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
const BASE = 'http://localhost:5173'
const PASSWORD = 'UrbanFlow2026!'
let ok = 0, fallos = 0
const errores = []
const check = (n, c, x) => c ? (ok++, console.log(`  ✓ ${n}`)) : (fallos++, console.error(`  ✗ ${n}`, x ?? ''))
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 950 })
const cdp = await page.createCDPSession()
page.on('console', m => { if (m.type() === 'error') errores.push(m.text()) })
page.on('pageerror', e => errores.push(`pageerror: ${e.message}`))

async function irA(r) {
  await page.goto(`${BASE}${r}`, { waitUntil: 'networkidle2' })
  await page.waitForFunction(() => !document.querySelector('.splash-screen'), { timeout: 15000 })
  await sleep(500)
}
async function login(email) {
  await cdp.send('Network.clearBrowserCookies')
  await irA('/login')
  await page.waitForSelector('input[name="email"]', { timeout: 10000 })
  await page.type('input[name="email"]', email)
  await page.type('input[name="contraseña"]', PASSWORD)
  await Promise.all([page.click('button[type="submit"]'),
    page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 8000 })])
}
const clicPorTexto = (txt) => page.evaluate(t => {
  const b = [...document.querySelectorAll('button, label, a')].find(x => x.textContent.includes(t)); b?.click(); return !!b
}, txt)

try {
  await login('admin@urbanflow.test')

  console.log('\n── lista de propietarios ──')
  await irA('/owners')
  await page.waitForSelector('.data-table tbody tr', { timeout: 8000 })
  const filas = await page.$$eval('.data-table tbody tr', r => r.length)
  check('la tabla trae los 10 propietarios del seed', filas === 10, filas)
  const txt = await page.evaluate(() => document.body.innerText)
  check('muestra nombres y correos reales', /Juan Pérez Domínguez/.test(txt) && /propietario@urbanflow.test/.test(txt))
  check('muestra los lotes de cada propietario', /A-0\d|B-0\d/.test(txt))
  check('ya no queda rastro del mapa Leaflet inventado', !/THE HEIGHTS|Oak Street/.test(txt))

  // Buscador contra la API
  await page.type('.page-search', 'María')
  await sleep(1200)
  const trasBuscar = await page.$$eval('.data-table tbody tr', r => r.length)
  check('el buscador filtra contra la API', trasBuscar === 1, trasBuscar)
  await page.evaluate(() => { const i = document.querySelector('.page-search'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })) })
  await sleep(1000)

  console.log('\n── detalle: datos, QR y documentos ──')
  await page.evaluate(() => document.querySelector('.data-table tbody tr .icon-btn')?.click())
  await sleep(1400)
  const detalle = await page.evaluate(() => document.querySelector('.modal-card')?.innerText ?? '')
  check('el detalle abre con los datos del propietario', /CURP|Escritura/.test(detalle), detalle.slice(0, 150))

  await clicPorTexto('Código QR')
  await sleep(1600)
  const qrSrc = await page.evaluate(() => document.querySelector('.qr-imagen')?.src ?? '')
  check('el QR se renderiza como imagen real', qrSrc.startsWith('data:image/png;base64,'), qrSrc.slice(0, 40))

  await clicPorTexto('Regenerar')
  await sleep(1800)
  const qrNuevo = await page.evaluate(() => document.querySelector('.qr-imagen')?.src ?? '')
  check('regenerar produce un QR distinto', qrNuevo !== qrSrc && qrNuevo.length > 100)

  await clicPorTexto('Documentos')
  await sleep(1200)
  const docs = await page.evaluate(() => document.querySelector('.modal-card')?.innerText ?? '')
  check('la pestaña de documentos carga', /Adjuntar|Sin documentos/.test(docs), docs.slice(0, 120))

  // Subida real de archivo
  const input = await page.$('input[type=file]')
  const tmp = '/private/tmp/claude-501/-Users-kino-Documents-projects-gestion-fracc/dbf6f5bc-4abf-4300-b479-3fbd8531ec3b/scratchpad/prueba-escritura.pdf'
  const { writeFileSync } = await import('node:fs')
  writeFileSync(tmp, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(400, 0x20)]))
  await input.uploadFile(tmp)
  await sleep(2200)
  const trasSubir = await page.evaluate(() => document.querySelector('.modal-card')?.innerText ?? '')
  check('subir un PDF desde la UI lo lista', /prueba-escritura\.pdf/.test(trasSubir), trasSubir.slice(0, 200))

  await page.evaluate(() => {
    const item = [...document.querySelectorAll('.doc-item')].find(i => /prueba-escritura/.test(i.innerText))
    item?.querySelector('.icon-btn--peligro')?.click()
  })
  await sleep(1600)
  const trasBorrar = await page.$$eval('.doc-item', i => i.length)
  check('eliminar el documento lo quita de la lista', trasBorrar === 0, trasBorrar)

  await page.screenshot({ path: 'owners-escritorio.png' })

  console.log('\n── permisos del propietario ──')
  await login('propietario@urbanflow.test')
  await irA('/owners')
  check('/owners bloqueado para propietario', !page.url().includes('/owners'), page.url())

  console.log('\n── consola ──')
  const rel = errores.filter(e => !/favicon|React DevTools|401 \(Unauthorized\)|403 \(Forbidden\)/i.test(e))
  check('sin errores de JS reales', rel.length === 0, rel.slice(0, 4))
} catch (err) {
  fallos++; console.error('\n✗ abortó:', err.message)
} finally {
  await browser.close()
  console.log(`\n${ok} ok, ${fallos} fallos`)
  process.exit(fallos ? 1 : 0)
}
