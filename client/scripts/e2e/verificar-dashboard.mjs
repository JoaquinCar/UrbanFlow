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
await page.setViewport({ width: 1440, height: 1100 })
const cdp = await page.createCDPSession()
page.on('console', m => { if (m.type() === 'error') errores.push(m.text()) })
page.on('pageerror', e => errores.push(`pageerror: ${e.message}`))

async function irA(r) {
  await page.goto(`${BASE}${r}`, { waitUntil: 'networkidle2' })
  await page.waitForFunction(() => !document.querySelector('.splash-screen'), { timeout: 15000 })
  await sleep(1500)
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
  console.log('\n── panel de administración ──')
  await login('admin@urbanflow.test')
  check('el admin aterriza en /dashboard', page.url().includes('/dashboard'), page.url())
  await page.waitForSelector('.metrica', { timeout: 8000 })

  const metricas = await page.$$eval('.metrica', m => m.map(x => x.innerText.replace(/\n/g, ' | ')))
  check('se pintan las 7 métricas', metricas.length === 7, metricas.length)
  check('las métricas traen valores reales, no ceros',
    metricas.some(m => /\d/.test(m)) && !metricas.every(m => /\| 0 \|/.test(m)), metricas.slice(0, 3))

  const txt = await page.evaluate(() => document.body.innerText)
  check('muestra dinero cobrado y por cobrar', /\$[\d,]+/.test(txt))
  check('ya no queda el dashboard mock', !/Acciones Rapidas|1,200\.00|Appointment/.test(txt))

  const segmentos = await page.$$eval('.barra-segmento', s => s.map(x => x.style.width))
  check('la barra de ocupación se dibuja con proporciones reales',
    segmentos.length === 3 && segmentos.every(w => /%$/.test(w)), segmentos)

  const secciones = await page.$$eval('.panel-seccion .caseta-subtitulo', s => s.map(x => x.innerText.split('\n')[0]))
  check('tiene las secciones de actividad',
    secciones.some(s => /adeudos/i.test(s)) && secciones.some(s => /Mantenimiento/i.test(s)) && secciones.some(s => /accesos/i.test(s)),
    secciones)

  const morosos = await page.evaluate(() => {
    const sec = [...document.querySelectorAll('.panel-seccion')].find(s => /adeudos/i.test(s.innerText))
    return sec?.innerText ?? ''
  })
  check('los mayores adeudos muestran nombre y monto',
    /Juan Pérez|María|Luis/.test(morosos) && /\$/.test(morosos), morosos.slice(0, 120))

  await page.screenshot({ path: 'dashboard-admin.png', fullPage: true })

  // Navegación desde una métrica
  await page.evaluate(() => [...document.querySelectorAll('button.metrica')].find(m => /Lotes/.test(m.innerText))?.click())
  await sleep(2000)
  check('las métricas navegan al módulo correspondiente', page.url().includes('/lotes'), page.url())

  console.log('\n── permisos ──')
  await login('vigilante@urbanflow.test')
  await irA('/dashboard')
  check('/dashboard bloqueado para vigilante', !page.url().includes('/dashboard'), page.url())

  await login('propietario@urbanflow.test')
  const txtProp = await page.evaluate(() => document.body.innerText)
  check('el propietario sigue viendo su portal, no el panel',
    /Accesos rápidos/.test(txtProp) && !/Panel de administración/.test(txtProp))

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
