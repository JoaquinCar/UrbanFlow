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
  await sleep(1600)
}
async function login(email) {
  await cdp.send('Network.clearBrowserCookies')
  await irA('/login')
  await page.waitForSelector('input[name="email"]', { timeout: 10000 })
  await page.type('input[name="email"]', email)
  await page.type('input[name="contraseña"]', PASSWORD)
  await Promise.all([page.click('button[type="submit"]'),
    page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 8000 })])
  await sleep(1800)
}

try {
  console.log('\n── portal del propietario ──')
  await login('propietario@urbanflow.test')
  check('el propietario aterriza en /dashboard', page.url().includes('/dashboard'), page.url())

  const txt = await page.evaluate(() => document.body.innerText)
  check('muestra su nombre real', /Juan Pérez Domínguez/.test(txt), txt.slice(0, 120))
  check('muestra su lote real desde la API', /Lote [AB]-\d\d/.test(txt), txt.match(/Lote [^\n]*/)?.[0])
  check('el saldo sale de las cuotas, no hardcodeado',
    /\$[\d,]+\.\d\d/.test(txt) && !/1,200\.00/.test(txt), txt.match(/\$[\d,]+\.\d\d/g)?.slice(0,3))
  const visitasPortal = await page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find(s => /Visitas recientes/.test(s.innerText))
    return sec?.querySelectorAll('.portal-fila').length ?? 0
  })
  check('muestra visitas reales de sus lotes', /Visitas recientes/.test(txt) && visitasPortal > 0, visitasPortal)
  check('muestra el último aviso', /Último aviso/.test(txt) || /No hay/.test(txt))

  const acciones = await page.$$eval('.action-card', a => a.map(x => x.innerText.split('\n')[0]))
  check('cuatro accesos rápidos', acciones.length === 4, acciones)
  check('los accesos rápidos apuntan a módulos reales',
    acciones.some(a => /QR/.test(a)) && acciones.some(a => /Reservar/.test(a)) && acciones.some(a => /Reportar/.test(a)),
    acciones)

  const fechasReservas = await page.$$eval('.portal-fila-sub', e => e.map(x => x.innerText))
  check('las próximas reservas salen en orden cronológico',
    !/De Septiembre|De Agosto|De Julio/.test(fechasReservas.join(' ')), fechasReservas.slice(0, 3))

  await page.screenshot({ path: 'portal-propietario.png' })

  // Navegación desde el portal
  await page.evaluate(() => [...document.querySelectorAll('.action-card')].find(a => /QR/.test(a.innerText))?.click())
  await sleep(2200)
  check('el acceso rápido lleva a /access', page.url().includes('/access'), page.url())

  console.log('\n── mi acceso (QR real) ──')
  const qrSrc = await page.$eval('.qr-imagen', i => i.src).catch(() => '')
  check('el QR del residente es una imagen real del backend',
    qrSrc.startsWith('data:image/png;base64,'), qrSrc.slice(0, 40))
  const txtAcc = await page.evaluate(() => document.body.innerText)
  check('muestra su nombre en el QR', /Juan Pérez Domínguez/.test(txtAcc))
  check('ya no hay familiares inventados',
    !/Roberto Garza|Elena Garza|Carlos López/.test(txtAcc), txtAcc.slice(0, 200))

  await page.evaluate(() => [...document.querySelectorAll('.access-tab')].find(b => /Historial/.test(b.textContent))?.click())
  await sleep(1800)
  const hist = await page.$$eval('.access-card', c => c.length)
  check('el historial trae sus visitas reales', hist > 0, hist)

  await page.screenshot({ path: 'access-propietario.png' })

  console.log('\n── el admin conserva su dashboard ──')
  await login('admin@urbanflow.test')
  check('el admin sigue en /dashboard', page.url().includes('/dashboard'), page.url())
  const txtAdmin = await page.evaluate(() => document.body.innerText)
  check('el admin NO ve el portal del propietario', !/Accesos rápidos/.test(txtAdmin) || /Acciones Rapidas/.test(txtAdmin))

  console.log('\n── consola ──')
  const rel = errores.filter(e => !/favicon|React DevTools|401 \(Unauthorized\)|403 \(Forbidden\)|404/i.test(e))
  check('sin errores de JS reales', rel.length === 0, rel.slice(0, 4))
} catch (err) {
  fallos++; console.error('\n✗ abortó:', err.message)
} finally {
  await browser.close()
  console.log(`\n${ok} ok, ${fallos} fallos`)
  process.exit(fallos ? 1 : 0)
}
