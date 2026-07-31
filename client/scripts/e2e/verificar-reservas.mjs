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
  await sleep(800)
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

try {
  console.log('\n── propietario: reservar ──')
  await login('propietario@urbanflow.test')
  await irA('/reservas')
  const txt = await page.evaluate(() => document.body.innerText)
  check('la pantalla carga con sus reservaciones', /Mis reservaciones/.test(txt))
  check('muestra reservaciones reales del seed', /Salón de eventos|Alberca|Cancha/.test(txt), txt.slice(0,200))
  check('muestra el estado de cada una', /Confirmada|Pendiente|Cancelada/.test(txt))

  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Reservar un área/.test(b.textContent))?.click())
  await page.waitForSelector('.calendario', { timeout: 6000 })
  await sleep(1400)

  const franjas = await page.$$eval('.franja', f => f.length)
  check('el calendario pinta las franjas horarias', franjas === 15, franjas)

  const areasSel = await page.$$eval('.new-access-form select option', o => o.length)
  check('el selector de áreas viene de la API', areasSel >= 4, areasSel)

  // Elegir una fecha futura sin reservas y seleccionar franja
  const futuro = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10)
  await page.evaluate((f) => {
    const i = document.querySelector('input[type=date]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(i, f)
    i.dispatchEvent(new Event('change', { bubbles: true }))
  }, futuro)
  await sleep(1600)

  await page.evaluate(() => document.querySelectorAll('.franja--libre')[2]?.click())
  await sleep(400)
  await page.evaluate(() => document.querySelectorAll('.franja--libre')[5]?.click())
  await sleep(400)
  const resumen = await page.$eval('.reserva-resumen', e => e.innerText).catch(() => '')
  check('seleccionar dos franjas arma el rango', /de \d\d:00 a \d\d:00/.test(resumen), resumen)

  await page.click('form.new-access-form button[type="submit"]')
  await sleep(2200)
  const trasReservar = await page.evaluate(() => document.body.innerText)
  check('la reservación se crea y aparece en la lista',
    /Reservación creada|pendiente de confirmación/.test(trasReservar) || /Pendiente/.test(trasReservar))

  await page.screenshot({ path: 'reservas-propietario.png' })

  console.log('\n── solapamiento visible en el calendario ──')
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Reservar un área/.test(b.textContent))?.click())
  await page.waitForSelector('.calendario', { timeout: 6000 })
  await page.evaluate((f) => {
    const i = document.querySelector('input[type=date]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(i, f); i.dispatchEvent(new Event('change', { bubbles: true }))
  }, futuro)
  await sleep(1800)
  const ocupadas = await page.$$eval('.franja--ocupada', f => f.length)
  check('las franjas ya reservadas salen bloqueadas', ocupadas > 0, ocupadas)
  const deshabilitadas = await page.$$eval('.franja--ocupada', f => f.every(x => x.disabled))
  check('las franjas ocupadas no son clicables', deshabilitadas)
  await page.evaluate(() => document.querySelector('.modal-card button')?.click())

  console.log('\n── admin: gestión de áreas ──')
  await login('admin@urbanflow.test')
  await irA('/areas')
  await page.waitForSelector('.data-table tbody tr', { timeout: 8000 })
  const areas = await page.$$eval('.data-table tbody tr', r => r.length)
  check('el admin ve las 4 áreas del fraccionamiento', areas === 4, areas)

  await page.evaluate(() => [...document.querySelectorAll('.access-tab')].find(b => /Reservaciones/.test(b.textContent))?.click())
  await sleep(2000)
  const reservas = await page.$$eval('.data-table tbody tr', r => r.length)
  check('la pestaña de reservaciones lista todas', reservas >= 5, reservas)
  const txtAdmin = await page.evaluate(() => document.querySelector('.access-tab-content')?.innerText ?? '')
  check('muestra propietario y horario', /Juan Pérez|María Fernanda|Luis Ángel/.test(txtAdmin) && /\d\d:00 – \d\d:00/.test(txtAdmin))

  await page.screenshot({ path: 'areas-admin.png' })

  console.log('\n── permisos ──')
  await login('propietario@urbanflow.test')
  await irA('/areas')
  check('/areas bloqueado para propietario', !page.url().includes('/areas'), page.url())

  console.log('\n── consola ──')
  const rel = errores.filter(e => !/favicon|React DevTools|401 \(Unauthorized\)|403 \(Forbidden\)|409 \(Conflict\)/i.test(e))
  check('sin errores de JS reales', rel.length === 0, rel.slice(0, 4))
} catch (err) {
  fallos++; console.error('\n✗ abortó:', err.message)
} finally {
  await browser.close()
  console.log(`\n${ok} ok, ${fallos} fallos`)
  process.exit(fallos ? 1 : 0)
}
