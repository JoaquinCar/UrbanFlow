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
page.on('console', m => { if (m.type() === 'error') errores.push(m.text()) })
page.on('pageerror', e => errores.push(`pageerror: ${e.message}`))

async function irA(ruta) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle2' })
  await page.waitForFunction(() => !document.querySelector('.splash-screen'), { timeout: 15000 })
  await sleep(500)
}

try {
  await irA('/login')
  await page.waitForSelector('input[name="email"]', { timeout: 10000 })
  await page.type('input[name="email"]', 'admin@urbanflow.test')
  await page.type('input[name="contraseña"]', PASSWORD)
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 8000 }),
  ])

  console.log('\n── Lotes ──')
  await irA('/lotes')
  await page.waitForSelector('.data-table tbody tr', { timeout: 8000 })
  const filas = await page.$$eval('.data-table tbody tr', r => r.length)
  check('la tabla trae los 25 lotes de Las Palmas', filas === 25, filas)

  const badges = await page.$$eval('.data-table .badge', b => [...new Set(b.map(x => x.textContent.trim()))])
  check('se ven los tres estados con badge', badges.length >= 2, badges)

  const conPropietario = await page.$$eval('.data-table tbody tr', rows =>
    rows.filter(r => /Juan Pérez|María Fernanda|Luis Ángel/.test(r.innerText)).length)
  check('los lotes vendidos muestran propietario real', conPropietario > 0, conPropietario)

  // Filtro por estado
  await page.select('.page-actions select', 'vendido')
  await sleep(900)
  const soloVendidos = await page.$$eval('.data-table tbody tr', rows =>
    rows.every(r => /Vendido/.test(r.innerText)))
  check('el filtro por estado funciona contra la API', soloVendidos)
  await page.select('.page-actions select', '')
  await sleep(800)

  // Alta de lote
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Nuevo lote/.test(b.textContent))?.click())
  await page.waitForSelector('input[name="numero"]', { timeout: 5000 })
  await page.type('input[name="numero"]', 'QA-01')
  await page.type('input[name="etapa"]', 'Etapa 1')
  await page.click('form.new-access-form button[type="submit"]')
  await sleep(1400)
  const creado = await page.evaluate(() => document.body.innerText.includes('QA-01'))
  check('crear lote desde la UI lo persiste', creado)

  // Duplicado → error del backend visible
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Nuevo lote/.test(b.textContent))?.click())
  await page.waitForSelector('input[name="numero"]', { timeout: 5000 })
  await page.type('input[name="numero"]', 'QA-01')
  await page.click('form.new-access-form button[type="submit"]')
  await sleep(1200)
  const errDup = await page.$eval('.form-error', e => e.textContent).catch(() => null)
  check('el 409 del backend se muestra en el formulario', /[Yy]a existe/.test(errDup ?? ''), errDup)
  await page.evaluate(() => document.querySelector('.modal-card button')?.click())
  await sleep(500)

  // Eliminar
  await page.evaluate(() => {
    const fila = [...document.querySelectorAll('.data-table tbody tr')].find(r => /QA-01/.test(r.innerText))
    fila?.querySelector('.icon-btn--peligro')?.click()
  })
  await sleep(700)
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Eliminar')?.click())
  await sleep(1400)
  const borrado = await page.$$eval('.data-table tbody tr', rows => !rows.some(r => /QA-01/.test(r.innerText)))
  check('eliminar lote lo quita de la tabla', borrado)

  console.log('\n── Mapa ──')
  await irA('/mapa')
  await page.waitForSelector('.mapa-svg', { timeout: 8000 })
  const pintados = await page.$$eval('.mapa-lote', ps => ({
    total: ps.length,
    disponibles: ps.filter(p => p.classList.contains('mapa-lote--disponible')).length,
    vendidos: ps.filter(p => p.classList.contains('mapa-lote--vendido')).length,
    proceso: ps.filter(p => p.classList.contains('mapa-lote--proceso')).length,
    sinDatos: ps.filter(p => p.classList.contains('mapa-lote--sin-datos')).length,
  }))
  check('el plano dibuja los 25 lotes', pintados.total === 25, pintados)
  check('todos los lotes del plano tienen datos', pintados.sinDatos === 0, pintados)
  check('se colorean los tres estados desde la base',
    pintados.disponibles > 0 && pintados.vendidos > 0 && pintados.proceso > 0, pintados)

  const leyenda = await page.$$eval('.mapa-leyenda-item', i => i.map(x => x.innerText.replace(/\n/g, ' ')))
  check('la leyenda trae conteos reales', leyenda.length === 3 && /\(\d+\)/.test(leyenda[0]), leyenda)

  // Click en un lote vendido → modal con propietario
  await page.evaluate(() => document.querySelector('.mapa-lote--vendido')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await sleep(1200)
  const modal = await page.evaluate(() => document.querySelector('.modal-card')?.innerText ?? '')
  check('click en lote abre el detalle', /Lote [AB]-\d\d/.test(modal), modal.slice(0, 100))
  check('el detalle trae propietario y precio', /Propietario/.test(modal) && /\$/.test(modal), modal.slice(0, 200))

  await page.screenshot({ path: 'mapa-escritorio.png' })

  console.log('\n── consola ──')
  const rel = errores.filter(e => !/favicon|React DevTools|401 \(Unauthorized\)|409 \(Conflict\)/i.test(e))
  check('sin errores de JS reales', rel.length === 0, rel.slice(0, 4))
} catch (err) {
  fallos++
  console.error('\n✗ abortó:', err.message)
} finally {
  await browser.close()
  console.log(`\n${ok} ok, ${fallos} fallos`)
  process.exit(fallos ? 1 : 0)
}
