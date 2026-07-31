# PR 0 — Fundación

**Responsable:** Miroslava Moheno · **Módulo:** Auth + Roles (Fase 1)

Este PR no entrega una funcionalidad visible para el usuario final: arregla los
cimientos sobre los que se apoyan los nueve módulos siguientes. Sin él, dos
cosas impedían avanzar: la segunda ejecución de `npm run migrate` reventaba, y
el frontend no podía llamar a ninguna API protegida.

---

## 1. El bug que rompía las migraciones

`shared/db/migrate.js` leía todos los `.sql` de la carpeta y los ejecutaba en
orden alfabético, sin llevar registro de cuáles ya se habían aplicado.

Funcionaba una sola vez porque las tablas usan `CREATE TABLE IF NOT EXISTS`.
Pero **`CREATE TYPE` no admite `IF NOT EXISTS` en PostgreSQL**, así que la
segunda corrida moría con:

```
type "rol_usuario" already exists
```

Cualquier compañero que hiciera `git pull` y corriera `npm run migrate` sobre su
base existente se topaba con esto.

### La solución: tabla de control (ledger)

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   VARCHAR(255) PRIMARY KEY,
  checksum   CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW()
)
```

Tres decisiones dentro de esta pieza:

**a) Una transacción por archivo.** Si una migración falla a la mitad, se hace
`ROLLBACK` y no queda ni el objeto a medias ni la entrada en el ledger. Si se
usara una sola transacción para todas, un fallo en la 007 desharía también la
004 que sí estaba bien.

**b) Checksum SHA-256 del contenido.** Si alguien edita una migración ya
aplicada, el checksum no coincide y el script aborta con un mensaje explícito.
Las migraciones son inmutables: para cambiar algo se crea un archivo nuevo. Sin
esta comprobación, dos compañeros pueden acabar con esquemas distintos creyendo
que están iguales.

**c) Adopción de la base previa.** Este es el caso sutil. Las bases que ya
existían tienen las tablas de 001–003 pero no tienen ledger. Si el script
simplemente mirara el ledger vacío, intentaría correr 001 otra vez y volvería a
morir en `CREATE TYPE`. Por eso, antes de nada:

```js
// ledger vacío + la tabla usuarios existe  ⇒  base anterior al ledger
const { rows: probe } = await pool.query(`SELECT to_regclass('public.usuarios') AS tabla`)
if (probe[0].tabla) { /* marcar 001, 002 y 003 como aplicadas */ }
```

**Idioma obligatorio para los enums nuevos** de aquí en adelante:

```sql
DO $$ BEGIN
  CREATE TYPE tipo_visita AS ENUM ('visita','delivery','servicio','residente');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

### Comprobación

```
$ npm run migrate
Base previa al ledger detectada — adoptando migraciones ya aplicadas:
  · 001_initial.sql — adoptada
  ...
  ✓ 004_constraints_unicidad.sql — aplicada

$ npm run migrate
  · 001_initial.sql — ya aplicada
  ...
Sin migraciones pendientes.
```

---

## 2. Migración 004 — claves naturales

```sql
ALTER TABLE fraccionamientos ADD CONSTRAINT uq_fraccionamientos_nombre UNIQUE (nombre);
ALTER TABLE lotes            ADD CONSTRAINT uq_lotes_fraccionamiento_numero UNIQUE (fraccionamiento_id, numero);
ALTER TABLE propietarios     ADD CONSTRAINT uq_propietarios_usuario UNIQUE (usuario_id);
```

No son adorno: sin ellas `ON CONFLICT` no tiene a qué apuntar y el seed duplica
filas en cada corrida. Además son la regla de negocio correcta — el número de
lote es único **dentro de su fraccionamiento**, no globalmente (puede haber un
A-01 en Las Palmas y otro en Jardines del Sol).

---

## 3. `httpError` — errores con status

Antes cada servicio repetía:

```js
const err = new Error('Credenciales incorrectas')
err.status = 401
throw err
```

Ahora `shared/utils/errors.js` da `throw httpError(401, 'Credenciales incorrectas')`.
El `errorHandler` global ya sabía leer `err.status`; esto solo quita la
repetición.

---

## 4. Ajustes en el servidor

| Cambio | Por qué |
|---|---|
| Handler 404 antes del `errorHandler` | Una ruta mal escrita devolvía el HTML por defecto de Express. El cliente espera JSON siempre. |
| `app.set('trust proxy', 1)` | Detrás del proxy de Railway/Render, `express-rate-limit` ve la IP del proxy y limita a todo el mundo con el mismo contador. |
| `timezone` explícito en el cron | `cron.schedule('1 0 1 * *')` usa la hora local del contenedor, que en Railway arranca en **UTC**. Como `mes_anio` se calcula con `new Date()`, el job del día 1 a las 00:01 UTC caía en el mes anterior en horario de México. |
| `LOGIN_MAX_INTENTOS` configurable | Las pruebas de extremo a extremo encadenan muchos logins y agotaban el límite de 10/15min. El default en producción sigue siendo 10. |

### Variables de entorno

Se añadieron 17 variables a `.env.example`. La más importante:
**`MONTO_CUOTA_MENSUAL` ya lo leía `cuota-cron.js` pero no estaba documentada**,
así que todo el equipo corría en silencio con el fallback de 1500.

Decisión relevante: **las credenciales de MercadoPago, SMTP y Meta quedan
vacías** en el ejemplo, no con textos tipo `your_mp_access_token`. Con un
placeholder no vacío, un `if (!process.env.MP_ACCESS_TOKEN)` cree que sí hay
credenciales y el fallo aparece más tarde y peor. Vacío significa "no
configurado" y el endpoint responde un error claro.

---

## 5. `POST /auth/change-password`

No existía y la pantalla de Configuración lo necesitaba. Verifica la contraseña
actual y, al cambiarla, pone `refresh_token = NULL`: las sesiones abiertas en
otros dispositivos dejan de poder renovarse.

---

## 6. Frontend — los tres bugs que rompían la demo

**a) El token nunca se guardaba.** `Login.jsx` leía `response.data.access_token`
pero el servidor manda `accessToken`. `localStorage` acababa con la cadena
literal `"undefined"` y cada petición enviaba `Authorization: Bearer undefined`.
El login parecía funcionar (redirigía al dashboard) pero ninguna llamada
autenticada podía funcionar jamás.

**b) Rutas con mayúsculas mal.** Tres sitios navegaban a `/login` cuando la ruta
era `/Login`. Como React Router v6 distingue mayúsculas y no había ruta `*`, el
resultado era una pantalla en blanco.

**c) `Onboarding.jsx` importaba `'../components/MyButton'`** en minúscula cuando
el directorio es `Components/`. En macOS funciona porque el sistema de archivos
no distingue mayúsculas; **en Linux/CI el build falla**.

---

## 7. Dónde vive el access token

**En una variable de módulo, en memoria. No en `localStorage`, no en estado de React.**

```js
// client/src/api/token.js
let accessToken = null
export const getAccessToken = () => accessToken
```

Dos razones concretas:

1. **No en `localStorage`** porque cualquier script inyectado puede leerlo. El
   refresh token viaja en cookie `httpOnly`, que JavaScript no puede tocar. Al
   recargar, el token de acceso se recupera desde esa cookie.
2. **No en estado de React** porque el interceptor de axios corre fuera del
   árbol de componentes. Si leyera el token del contexto, capturaría el valor
   del render en el que se registró (*stale closure*) y además crearía un import
   circular entre `client.js` y `AuthContext.jsx`.

Arranque de sesión al recargar: `POST /auth/refresh` → `GET /auth/me`. Hacen
falta los dos pasos porque `/refresh` solo devuelve `{ accessToken }`, sin el
usuario.

---

## 8. La pieza de mayor riesgo: la cola del interceptor 401

Cuando el access token expira (15 min), varias peticiones pueden fallar con 401
a la vez. La implementación ingenua dispara un `/auth/refresh` por cada una.

Eso rompe la sesión, y la razón es específica de este backend: **`auth.service.refresh()`
rota el refresh token en cada uso** y guarda el hash del nuevo. Si se mandan 5
refresh en paralelo, el primero invalida el token que están usando los otros
cuatro, que fallan con `Refresh token revocado` y echan fuera a un usuario
perfectamente válido.

La solución es que todas las peticiones en cola esperen **la misma promesa**:

```js
let renovando = null
...
renovando = renovando || renovarToken().finally(() => { renovando = null })
const token = await renovando
```

Dos detalles que importan:

- `renovarToken()` usa una instancia **limpia** de axios, no `api`. Si usara
  `api`, el refresh volvería a pasar por este mismo interceptor y un 401 ahí
  provocaría un bucle infinito.
- `original._reintentado = true` se marca antes de reintentar, para que una
  petición solo se reintente una vez.

---

## 9. Guards de rutas por rol

`RequireAuth` se usa como *layout route*:

```jsx
<Route element={<RequireAuth allow={['admin']} />}>
  <Route path="/owners" element={<Owners />} />
</Route>
```

Tres estados, no dos: `cargando | autenticado | anonimo`. Distinguir `cargando`
de `anonimo` es imprescindible — si el guard redirigiera mientras el
`AuthProvider` todavía está resolviendo la sesión, **cada F5 sacaría al usuario
de la aplicación**.

Un usuario autenticado sin permiso se manda a su propia home, no al login: ya
inició sesión correctamente, mandarlo al formulario sería confuso.

`SoloAnonimo` hace lo inverso para login y onboarding.

> Esto es solo la interfaz. El permiso de verdad lo aplica `requireRole` en el
> backend; ocultar un botón no protege nada.

---

## 10. Navegación por rol, en un solo lugar

`NAV_ITEMS` estaba **duplicado** en `SideMenu.jsx` y en `Settings.jsx` — porque
`Settings.jsx` era una copia literal de `SideMenu.jsx` que no renderizaba
ninguna pantalla de configuración. Añadir una entrada obligaba a editar dos
archivos.

Ahora vive en `config/nav.js` con un campo `roles` por entrada y un campo
`pendiente` para las pantallas que aún no existen. La lista completa documenta
la arquitectura de información objetivo; cada PR de módulo quita su bandera
`pendiente` al entregar su pantalla, así que **nunca se publica un enlace roto**.

---

## 11. Shell responsive

`.app-container` era `max-width: 450px; height: 100vh; overflow: hidden`.

Dos cambios:

**a) El scroll.** `overflow: hidden` recortaba en silencio cualquier lista más
alta que la pantalla, sin barra de desplazamiento. Ahora es `min-height` +
`overflow-y: auto`. En móvil no se nota nada mientras el contenido quepa.

**b) Escritorio ≥768px.** El drawer se ancla como barra lateral fija y el
contenido se desplaza 270px. Móvil queda idéntico.

**Un problema que solo apareció al verlo en el navegador:** la primera versión
no funcionaba. Las reglas de `layout.css` y las de `main.css` tienen la misma
especificidad, y Vite concatenaba `main.css` después, así que
`.sidemenu-drawer { transform: translateX(-100%) }` ganaba y la barra quedaba
invisible. La solución fue duplicar la clase en el selector
(`.sidemenu-drawer.sidemenu-drawer`) para subir la especificidad a 0-2-0 en vez
de depender del orden de concatenación.

**Tailwind se queda aunque no se use.** Hay cero clases de utilidad de Tailwind
en todo el proyecto, pero `@tailwind base` (Preflight) **es el único reset CSS
que existe**: no hay `body { margin: 0 }` ni `box-sizing` en ninguna otra parte.
Quitarlo desplazaría toda la interfaz. Se mantienen las directivas y se sigue
escribiendo CSS a mano en `main.css`, que es lo que hace el 100% del código
actual.

---

## 12. Pantallas sin backend detrás

Dos pantallas eran callejones sin salida y se resolvieron con honestidad en vez
de dejar formularios que no mandan nada:

- **`CreateAccount` / `NewAccount`**: no hay registro público en este producto.
  Las cuentas las crea el administrador al dar de alta al propietario
  (`POST /api/propietarios` crea también su usuario). Sus rutas redirigen al
  login; el PR 2 reaprovechará las pantallas como alta de propietario.
- **`LostPassword`**: el restablecimiento por correo depende de Nodemailer
  (PR 6) y de un token de un solo uso. En lugar de un formulario que solo hacía
  `console.log`, la pantalla explica que la administración restablece la
  contraseña y remite a Configuración a quien todavía tenga sesión.

---

## Cómo probarlo

```bash
docker compose up -d
cd server
npm run migrate && npm run migrate   # la 2ª debe decir "ya aplicada"
npm run seed
npm run dev

# en otra terminal
npm run smoke -- --only=auth         # 8 comprobaciones
cd ../client && npm run dev
```

En el navegador, con `admin@urbanflow.test` / `UrbanFlow2026!`:

1. `/owners` sin sesión → redirige a `/login`.
2. Tras iniciar sesión, F5 mantiene la sesión.
3. El admin no ve "Mi estado de cuenta" en el menú; el propietario no ve
   "Propietarios".
4. `/payments` con sesión de admin rebota al dashboard.
5. A ≥768px la barra lateral queda anclada y desaparece el hamburguesa.

Verificado con 8 pruebas de API y 26 comprobaciones en navegador real.
