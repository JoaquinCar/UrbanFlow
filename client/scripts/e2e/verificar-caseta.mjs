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
  await sleep(600)
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
  console.log('\n── el vigilante aterriza en la caseta ──')
  await login('vigilante@urbanflow.test')
  check('login del vigilante lleva a /caseta', page.url().includes('/caseta'), page.url())

  await page.waitForSelector('.caseta-item', { timeout: 8000 })
  const dentro = await page.$$eval('.caseta-item', i => i.length)
  check('muestra las 3 visitas que siguen dentro', dentro === 3, dentro)

  const vivo = await page.$eval('.caseta-estado', e => e.className)
  check('el socket conecta (indicador "En vivo")', vivo.includes('caseta-estado--vivo'), vivo)

  console.log('\n── registro manual de entrada ──')
  await clic('Registrar entrada')
  await page.waitForSelector('select[name="lote_destino_id"]', { timeout: 5000 })
  const opciones = await page.$$eval('select[name="lote_destino_id"] option', o => o.length)
  check('el selector de lotes se llena desde la API', opciones > 20, opciones)

  await page.select('select[name="lote_destino_id"]', await page.$eval('select[name="lote_destino_id"] option:nth-child(2)', o => o.value))
  await page.type('input[name="nombre_visitante"]', 'Visitante Navegador')
  await page.type('input[name="placa_vehiculo"]', 'QA-9999')
  await page.click('form.new-access-form button[type="submit"]')
  await sleep(1800)

  const trasAlta = await page.$$eval('.caseta-item', i => i.map(x => x.innerText).join('|'))
  check('la nueva entrada aparece en "dentro ahora"', /Visitante Navegador/.test(trasAlta))
  check('la tarjeta muestra tipo, lote y placa', /Visita/.test(trasAlta) && /QA-9999/.test(trasAlta))

  console.log('\n── salida ──')
  await page.evaluate(() => {
    const item = [...document.querySelectorAll('.caseta-item')].find(i => /Visitante Navegador/.test(i.innerText))
    item?.querySelector('.caseta-salida')?.click()
  })
  await sleep(1800)
  const trasSalida = await page.$$eval('.caseta-item', i => i.map(x => x.innerText).join('|'))
  check('tras la salida desaparece de la lista', !/Visitante Navegador/.test(trasSalida))

  await page.screenshot({ path: 'caseta-escritorio.png' })

  console.log('\n── bitácora ──')
  await irA('/bitacora')
  await page.waitForSelector('.data-table tbody tr', { timeout: 8000 })
  const filas = await page.$$eval('.data-table tbody tr', r => r.length)
  check('la bitácora lista los accesos de 30 días', filas >= 40, filas)
  const txt = await page.evaluate(() => document.body.innerText)
  check('marca quién sigue dentro', /Dentro/.test(txt))
  check('muestra el tipo de cada acceso', /Entrega|Servicio|Visita/.test(txt))

  await page.select('.page-actions select', 'delivery')
  await sleep(1300)
  const soloDelivery = await page.$$eval('.data-table tbody tr', rows => rows.every(r => /Entrega/.test(r.innerText)))
  check('el filtro por tipo funciona contra la API', soloDelivery)

  console.log('\n── permisos ──')
  await login('propietario@urbanflow.test')
  await irA('/caseta')
  check('/caseta bloqueado para propietario', !page.url().includes('/caseta'), page.url())
  await irA('/bitacora')
  check('/bitacora bloqueado para propietario', !page.url().includes('/bitacora'), page.url())

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
