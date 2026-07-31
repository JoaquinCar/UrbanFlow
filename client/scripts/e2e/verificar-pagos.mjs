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
  await sleep(700)
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
const clic = (txt) => page.evaluate(t => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(t)); b?.click(); return !!b
}, txt)

try {
  console.log('\n── estado de cuenta del propietario ──')
  await login('propietario@urbanflow.test')
  await irA('/payments')
  await page.waitForSelector('.saldo-card', { timeout: 8000 })
  const saldo = await page.$eval('.saldo-card', e => e.innerText)
  check('muestra el saldo real calculado', /\$[\d,]+/.test(saldo), saldo.replace(/\n/g, ' '))

  const cuotas = await page.$$eval('.cuota-item', i => i.length)
  check('lista las cuotas del propietario', cuotas >= 6, cuotas)

  const txt = await page.evaluate(() => document.body.innerText)
  check('separa por pagar e historial', /Por pagar/.test(txt) && /Historial/.test(txt))
  check('muestra periodos reales, no mock', /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(txt))
  check('ya no hay rastro del Payments mock', !/Código QR/.test(txt) && !/Fecha limite/.test(txt))

  // Descargar un recibo real
  const hayRecibo = await page.$('.cuota-recibo')
  check('las cuotas pagadas ofrecen recibo', !!hayRecibo)

  // Checkout sin credenciales → mensaje claro
  await clic('Pagar')
  await sleep(1800)
  const trasPagar = await page.evaluate(() => document.body.innerText)
  check('sin credenciales de MP el checkout avisa con mensaje claro',
    /MP_ACCESS_TOKEN no configurado/.test(trasPagar), trasPagar.slice(-200))

  await page.screenshot({ path: 'estado-cuenta.png' })

  console.log('\n── administración de cuotas ──')
  await login('admin@urbanflow.test')
  await irA('/cuotas')
  await page.waitForSelector('.data-table tbody tr', { timeout: 8000 })
  const filas = await page.$$eval('.data-table tbody tr', r => r.length)
  check('la tabla de cuotas carga desde la API', filas > 10, filas)
  const resumen = await page.$eval('.resumen-cuotas', e => e.innerText)
  check('muestra resumen cobrado/pendiente', /Cobrado/.test(resumen) && /Pendiente/.test(resumen), resumen.replace(/\n/g,' '))

  // Crear cuota extraordinaria
  await clic('Cuota extraordinaria')
  await page.waitForSelector('form.new-access-form input[type=number]', { timeout: 5000 })
  await page.type('form.new-access-form input:not([type=number])', 'Prueba navegador')
  await page.type('form.new-access-form input[type=number]', '333')
  await page.click('form.new-access-form button[type="submit"]')
  await sleep(2000)
  const trasCrear = await page.evaluate(() => document.body.innerText)
  check('crear cuota extraordinaria funciona', /Prueba navegador|cuota\(s\) creada/.test(trasCrear))

  // Morosos
  await page.evaluate(() => [...document.querySelectorAll('.access-tab')].find(b => /Morosos/.test(b.textContent))?.click())
  await sleep(2800)
  const morosos = await page.$eval('.access-tab-content', e => e.innerText).catch(() => 'SIN PANEL')
  const activa = await page.$$eval('.access-tab.active', t => t.map(x => x.textContent.trim()))
  check('la pestaña de morosos calcula adeudos', /adeudo/i.test(morosos) && /\$/.test(morosos), { activa, panel: morosos.slice(0, 300) })

  // Pagos + recibo PDF
  await page.evaluate(() => [...document.querySelectorAll('.access-tab')].find(b => /^Pagos$/.test(b.textContent.trim()))?.click())
  await sleep(2800)
  const pagos = await page.$$eval('.data-table tbody tr', r => r.length).catch(() => 0)
  check('la pestaña de pagos lista los cobros', pagos > 5, pagos)

  await page.screenshot({ path: 'cuotas-admin.png' })

  console.log('\n── permisos ──')
  await login('propietario@urbanflow.test')
  await irA('/cuotas')
  check('/cuotas bloqueado para propietario', !page.url().includes('/cuotas'), page.url())

  console.log('\n── consola ──')
  const rel = errores.filter(e => !/favicon|React DevTools|401 \(Unauthorized\)|403 \(Forbidden\)|500 \(Internal/i.test(e))
  check('sin errores de JS reales', rel.length === 0, rel.slice(0, 4))
} catch (err) {
  fallos++; console.error('\n✗ abortó:', err.message)
} finally {
  await browser.close()
  console.log(`\n${ok} ok, ${fallos} fallos`)
  process.exit(fallos ? 1 : 0)
}
