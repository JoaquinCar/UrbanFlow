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

try {
  console.log('\n── vista de administrador ──')
  await login('admin@urbanflow.test')
  await irA('/mantenimiento')
  await page.waitForSelector('.ticket-item', { timeout: 8000 })
  const total = await page.$$eval('.ticket-item', i => i.length)
  check('el admin ve los 6 tickets sembrados', total === 6, total)

  const txt = await page.evaluate(() => document.body.innerText)
  check('se ven los tres estados', /Abierto/.test(txt) && /En proceso/.test(txt) && /Resuelto/.test(txt))
  check('muestra quién reportó y ubicación', /Reportó:/.test(txt) && /📍/.test(txt))
  check('marca los tickets sin asignar', /Sin asignar/.test(txt))

  const selects = await page.$$eval('.ticket-item .ticket-select', s => s.length)
  check('el admin tiene selectores de asignación y estado', selects >= 12, selects)

  const opciones = await page.$$eval('.ticket-item:first-child .ticket-select option', o => o.map(x => x.textContent))
  check('el selector de técnicos muestra la carga de trabajo',
    opciones.some(o => /activos/.test(o)), opciones.slice(0, 4))

  // Asignar técnico al primer ticket abierto
  const antes = await page.$eval('.ticket-item', e => e.innerText)
  await page.evaluate(() => {
    const sel = document.querySelector('.ticket-item .ticket-select')
    const op = [...sel.options].find(o => /activos/.test(o.textContent))
    sel.value = op.value
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await sleep(2200)
  const despues = await page.evaluate(() => document.body.innerText)
  check('asignar técnico desde la UI funciona', /Técnico asignado|Técnico: Carlos/.test(despues))

  await page.screenshot({ path: 'tickets-admin.png' })

  console.log('\n── vista de técnico ──')
  await login('tecnico@urbanflow.test')
  check('el técnico aterriza en mantenimiento', page.url().includes('/mantenimiento'), page.url())
  await page.waitForSelector('.ticket-item', { timeout: 8000 })
  const suyos = await page.$$eval('.ticket-item', i => i.length)
  check('solo ve los tickets que le asignaron', suyos > 0 && suyos < 6, suyos)
  const txtTec = await page.evaluate(() => document.body.innerText)
  check('el título dice "Mis asignaciones"', /Mis asignaciones/.test(txtTec))
  check('el técnico NO ve "Reportó:"', !/Reportó:/.test(txtTec))

  console.log('\n── vista de propietario ──')
  await login('propietario@urbanflow.test')
  await irA('/mantenimiento')
  await sleep(1200)
  const txtProp = await page.evaluate(() => document.body.innerText)
  check('el título dice "Mis reportes"', /Mis reportes/.test(txtProp))

  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Reportar incidencia/.test(b.textContent))?.click())
  await page.waitForSelector('textarea', { timeout: 5000 })
  await page.type('textarea', 'QA navegador: la puerta del área de juegos no cierra')
  await page.type('.new-access-form input', 'Área de juegos')
  await page.click('form.new-access-form button[type="submit"]')
  await sleep(2200)
  const trasCrear = await page.evaluate(() => document.body.innerText)
  check('el propietario puede reportar una incidencia', /QA navegador/.test(trasCrear))
  check('el ticket nuevo nace abierto y sin asignar',
    /Abierto/.test(trasCrear) && /Sin asignar/.test(trasCrear))

  const puedeCambiar = await page.$$eval('.ticket-select', s => s.length)
  check('el propietario no tiene selectores de estado ni asignación', puedeCambiar === 0, puedeCambiar)

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
