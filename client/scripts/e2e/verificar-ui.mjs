import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
const BASE = 'http://localhost:5173'
const PASSWORD = 'UrbanFlow2026!'

let ok = 0, fallos = 0
const errores = []

function check(nombre, cond, extra) {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`) }
  else { fallos++; console.error(`  ✗ ${nombre}`, extra ?? '') }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// La splash tapa la app 3s en CADA carga completa. Esperar a que se vaya en vez
// de dormir un tiempo fijo.
async function irA(ruta) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle2' })
  await page.waitForFunction(() => !document.querySelector('.splash-screen'), { timeout: 15000 })
  await sleep(400) // margen para el redirect del guard
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
const cdp = await page.createCDPSession()

// La cookie refreshToken la pone localhost:3000 con path /api/auth, así que
// page.cookies() (que mira el origen 5173) no la ve. Hay que limpiar el navegador.
async function cerrarSesionDura() {
  await cdp.send('Network.clearBrowserCookies')
}

page.on('console', m => { if (m.type() === 'error') errores.push(m.text()) })
page.on('pageerror', e => errores.push(`pageerror: ${e.message}`))

async function login(email) {
  await irA('/login')
  await page.waitForSelector('input[name="email"]', { timeout: 10000 })
  await page.type('input[name="email"]', email)
  await page.type('input[name="contraseña"]', PASSWORD)
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 8000 }),
  ])
}

try {
  console.log('\n── arranque y rutas públicas ──')
  await irA('/')
  check('la app carga sin pantalla en blanco', (await page.content()).length > 500)
  const trasSplash = await page.evaluate(() => document.body.innerText)
  check('tras la splash se ve el onboarding', /Fácil Acceso|Siguiente|Saltar/.test(trasSplash), trasSplash.slice(0, 120))

  await irA('/ruta-inventada')
  check('ruta inexistente muestra 404', /404/.test(await page.evaluate(() => document.body.innerText)))

  console.log('\n── guard de rutas sin sesión ──')
  await irA('/owners')
  check('/owners sin sesión redirige a /login', page.url().includes('/login'), page.url())

  console.log('\n── login como admin ──')
  await login('admin@urbanflow.test')
  check('el login deja al admin dentro de la app', !page.url().includes('/login'), page.url())
  await irA('/dashboard')
  check('admin puede abrir /dashboard', page.url().includes('/dashboard'), page.url())
  const txtAdmin = await page.evaluate(() => document.body.innerText)
  check('el dashboard muestra el nombre real del usuario', /Admin/i.test(txtAdmin), txtAdmin.slice(0, 150))

  console.log('\n── sesión sobrevive al recargar (token en memoria + cookie) ──')
  await page.reload({ waitUntil: 'networkidle2' })
  await page.waitForFunction(() => !document.querySelector('.splash-screen'), { timeout: 15000 })
  await sleep(400)
  check('tras F5 sigue autenticado (no rebota al login)', !page.url().includes('/login'), page.url())

  console.log('\n── navegación por rol ──')
  const navAdmin = await page.evaluate(() =>
    [...document.querySelectorAll('.sidemenu-item')].map(b => b.innerText.trim()))
  check('el admin ve Propietarios en el menú', navAdmin.some(t => /Propietarios/.test(t)), navAdmin)
  check('el admin NO ve "Mi estado de cuenta"', !navAdmin.some(t => /Mi estado de cuenta/.test(t)), navAdmin)

  await irA('/owners')
  check('/owners abre para admin', page.url().includes('/owners'), page.url())

  await irA('/payments')
  check('/payments (solo propietario) rebota al admin fuera', !page.url().includes('/payments'), page.url())

  console.log('\n── configuración ──')
  await irA('/settings')
  const txtCfg = await page.evaluate(() => document.body.innerText)
  check('Settings muestra contenido real, no el menú duplicado',
    /Configuración/.test(txtCfg) && /admin@urbanflow\.test/.test(txtCfg), txtCfg.slice(0, 200))

  console.log('\n── login como propietario ──')
  await cerrarSesionDura()
  await login('propietario@urbanflow.test')
  check('propietario entra a la app', !page.url().includes('/login'), page.url())
  await irA('/dashboard')
  const navProp = await page.evaluate(() =>
    [...document.querySelectorAll('.sidemenu-item')].map(b => b.innerText.trim()))
  check('el propietario ve "Mi estado de cuenta"', navProp.some(t => /Mi estado de cuenta/.test(t)), navProp)
  check('el propietario NO ve Propietarios', !navProp.some(t => /^Propietarios/.test(t)), navProp)

  await irA('/owners')
  check('/owners bloqueado para propietario', !page.url().includes('/owners'), page.url())

  console.log('\n── vigilante ──')
  await cerrarSesionDura()
  await login('vigilante@urbanflow.test')
  check('vigilante aterriza en la caseta (no tiene dashboard)', page.url().includes('/caseta'), page.url())

  console.log('\n── layout de escritorio ──')
  await cerrarSesionDura()
  await login('admin@urbanflow.test')
  await irA('/dashboard')
  const desktop = await page.evaluate(() => {
    const drawer = document.querySelector('.sidemenu-drawer')
    const burger = document.querySelector('.dashboard-header-btn--menu')
    return {
      drawerVisible: drawer ? getComputedStyle(drawer).transform : 'sin drawer',
      drawerLeft: drawer ? drawer.getBoundingClientRect().left : null,
      drawerAncho: drawer ? drawer.getBoundingClientRect().width : null,
      burgerDisplay: burger ? getComputedStyle(burger).display : 'sin burger',
      padding: getComputedStyle(document.querySelector('.app-container')).paddingLeft,
    }
  })
  check('en escritorio la barra lateral está anclada y visible',
    desktop.drawerLeft === 0 && desktop.drawerAncho === 270, desktop)
  check('en escritorio se oculta el botón hamburguesa',
    desktop.burgerDisplay === 'none', desktop)
  check('el contenido deja hueco para la barra lateral',
    desktop.padding === '270px', desktop)
  await page.screenshot({ path: 'ui-escritorio.png' })

  console.log('\n── layout móvil ──')
  await page.setViewport({ width: 390, height: 844 })
  await irA('/dashboard')
  const movil = await page.evaluate(() => {
    const burger = document.querySelector('.dashboard-header-btn--menu')
    const cont = document.querySelector('.app-container')
    return {
      burgerDisplay: burger ? getComputedStyle(burger).display : 'sin burger',
      padding: getComputedStyle(cont).paddingLeft,
      maxWidth: getComputedStyle(cont).maxWidth,
    }
  })
  check('en móvil vuelve el hamburguesa', movil.burgerDisplay !== 'none', movil)
  check('en móvil no hay hueco lateral', movil.padding === '0px', movil)
  check('en móvil sigue el shell de 450px', movil.maxWidth === '450px', movil)
  await page.screenshot({ path: 'ui-movil.png' })
  await page.setViewport({ width: 1280, height: 900 })

  console.log('\n── errores de consola ──')
  // Los 401 de /auth/refresh al arrancar sin sesión son el diseño: se intenta
  // recuperar la sesión, falla, y el usuario queda anónimo.
  const esperado = /favicon|React DevTools|401 \(Unauthorized\)/i
  const relevantes = errores.filter(e => !esperado.test(e))
  check('sin errores de JavaScript reales en consola', relevantes.length === 0, relevantes.slice(0, 5))
  check('ninguna excepción no capturada (pageerror)',
    !errores.some(e => e.startsWith('pageerror:')),
    errores.filter(e => e.startsWith('pageerror:')).slice(0, 3))

} catch (err) {
  fallos++
  console.error('\n✗ la verificación abortó:', err.message)
} finally {
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-kino-Documents-projects-gestion-fracc/dbf6f5bc-4abf-4300-b479-3fbd8531ec3b/scratchpad/ui-final.png' })
  await browser.close()
  console.log(`\n${ok} ok, ${fallos} fallos`)
  process.exit(fallos ? 1 : 0)
}
