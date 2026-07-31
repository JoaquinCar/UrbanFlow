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
  console.log('\n── composición (admin) ──')
  await login('admin@urbanflow.test')
  await irA('/comunicados')
  const txt0 = await page.evaluate(() => document.body.innerText)
  check('la pantalla carga', /Comunicados/.test(txt0))
  check('avisa de los canales sin configurar',
    /no está configurado/.test(txt0), txt0.slice(0, 300))
  check('muestra el conteo real de destinatarios', /propietarios/.test(txt0) && /con WhatsApp/.test(txt0))

  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Nuevo comunicado/.test(b.textContent))?.click())
  await page.waitForSelector('textarea', { timeout: 5000 })

  const botonEnviar = await page.$eval('form.new-access-form button[type=submit]', b => b.textContent)
  check('el botón dice a cuántos se enviará', /Enviar a \d+ propietarios/.test(botonEnviar), botonEnviar)

  await page.type('form.new-access-form input[type=text], form.new-access-form input:not([type])', 'QA navegador: junta vecinal')
  await page.type('textarea', 'Se convoca a junta el sábado a las 10:00 en el salón.')
  // Desmarcar email para no depender de SMTP
  await page.evaluate(() => {
    const cbs = [...document.querySelectorAll('.canal-opcion input')]
    cbs.forEach(cb => { if (cb.checked) cb.click() })
  })
  await page.click('form.new-access-form button[type="submit"]')
  await sleep(1500)
  const sinCanal = await page.evaluate(() => document.querySelector('.form-error')?.textContent ?? '')
  check('sin canales seleccionados avisa', /al menos un canal/.test(sinCanal), sinCanal)

  await page.evaluate(() => document.querySelector('.canal-opcion input').click())
  await page.click('form.new-access-form button[type="submit"]')
  await sleep(2600)
  const trasEnviar = await page.evaluate(() => document.body.innerText)
  check('el comunicado se guarda aunque el envío falle', /QA navegador: junta vecinal/.test(trasEnviar))
  check('el historial muestra el resultado por canal', /Correo: 0\/3|Correo: \d+\/\d+/.test(trasEnviar), trasEnviar.match(/Correo: \S+/)?.[0])
  check('el historial muestra autor y fecha', /por Admin UrbanFlow/.test(trasEnviar))

  await page.screenshot({ path: 'comunicados-admin.png' })

  console.log('\n── tablón de avisos (residente) ──')
  await login('propietario@urbanflow.test')
  await irA('/notifications')
  const txtProp = await page.evaluate(() => document.body.innerText)
  check('el residente ve el comunicado real', /QA navegador: junta vecinal/.test(txtProp))
  check('ya no hay avisos inventados en inglés',
    !/Appointment|Emily Walker|David Patel/.test(txtProp))
  check('muestra quién lo publicó', /Publicado por Admin UrbanFlow/.test(txtProp))
  check('el residente NO ve detalles de entrega', !/Correo: \d+\//.test(txtProp))

  await irA('/comunicados')
  check('/comunicados bloqueado para propietario', !page.url().includes('/comunicados'), page.url())

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
