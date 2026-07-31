# Verificación en navegador

Scripts que manejan un navegador real (Chromium) para comprobar cada módulo de
extremo a extremo: guards por rol, formularios contra la API, subidas de
archivo, y que los errores del backend se vean en pantalla.

Complementan a `server/scripts/smoke.js`, que prueba la API. Estos prueban lo
que la API no puede ver: que la pantalla realmente muestre lo que devuelve.

## Requisitos

```bash
npm install --no-save puppeteer-core
```

Y un navegador basado en Chromium. La constante `CHROME` de cada script apunta a
Brave; ajústala a lo que tengas instalado:

| Navegador | Ruta en macOS |
|---|---|
| Chrome | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| Brave | `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser` |
| Edge | `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge` |

En Windows suele estar en
`C:\Program Files\Google\Chrome\Application\chrome.exe`.

## Uso

Con el servidor y el cliente levantados, y la base recién sembrada:

```bash
npm run seed --workspace=server
npm run dev:server      # terminal 1
npm run dev:client      # terminal 2

node client/scripts/e2e/verificar-caseta.mjs    # terminal 3
```

| Script | Comprueba |
|---|---|
| `verificar-ui.mjs` | Login, guards por rol, sesión tras F5, layout móvil y escritorio |
| `verificar-lotes.mjs` | Tabla de lotes, filtros, alta con error 409, mapa SVG |
| `verificar-owners.mjs` | Propietarios, QR, subida y descarga de documentos |
| `verificar-caseta.mjs` | Entradas, salidas, socket en vivo, bitácora y CSV |
| `verificar-pagos.mjs` | Estado de cuenta, cobro en caja, morosos, recibos |
| `verificar-tickets.mjs` | Mantenimiento desde los tres roles |
| `verificar-comunicados.mjs` | Composición, resultado por canal, tablón de avisos |
| `verificar-reservas.mjs` | Calendario, franjas ocupadas, gestión de áreas |
| `verificar-portal.mjs` | Portal del propietario y su código QR |
| `verificar-dashboard.mjs` | Métricas del panel y sus permisos |

Cada script deja una captura `.png` en el directorio desde el que se ejecuta.

> Los scripts asumen la base recién sembrada. Si has estado usando la
> aplicación, vuelve a ejecutar `npm run seed` antes.
