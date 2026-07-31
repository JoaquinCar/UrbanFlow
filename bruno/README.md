# Colección de Bruno — API de UrbanFlow

87 peticiones que cubren los ocho módulos de la API, organizadas por carpetas y
**ejecutables de arriba abajo sin pegar nada a mano**.

## Cómo abrirla

1. Descarga Bruno desde [usebruno.com](https://www.usebruno.com) (gratis, sin
   cuenta).
2. **Open Collection** → elige esta carpeta (`bruno/`).
3. Arriba a la derecha, selecciona el entorno **Local**.

## Cómo usarla

El servidor tiene que estar corriendo y la base sembrada:

```bash
docker compose up -d
npm run migrate --workspace=server
npm run seed --workspace=server
npm run dev:server
```

Después, en Bruno:

1. Abre **01 Auth** y ejecuta los **cuatro logins**. Cada uno guarda su token en
   una variable de entorno (`tokenAdmin`, `tokenVigilante`, `tokenPropietario`,
   `tokenTecnico`) que el resto de peticiones ya usan.
2. A partir de ahí, cualquier carpeta funciona.

Las peticiones **encadenan sus datos solas**: al listar lotes se guarda un id de
lote, al listar propietarios uno de propietario, y así. Por eso conviene
ejecutar cada carpeta en orden la primera vez.

## Qué hay en cada carpeta

| Carpeta | Contenido |
|---|---|
| 01 Auth | Login por rol, sesión actual, refresh, cambio de contraseña, logout |
| 02 Lotes y mapa | CRUD de lotes, asignación de propietario, mapa y panel de métricas |
| 03 Propietarios | CRUD, código QR del residente y expediente de documentos |
| 04 Visitas y caseta | Entradas, salidas, entrada por QR, bitácora y exportación CSV |
| 05 Cuotas y pagos | Estado de cuenta, cobro en caja, morosos, recibo PDF, MercadoPago |
| 06 Mantenimiento | Tickets, asignación a técnico y cambio de estado |
| 07 Comunicados | Envío por correo y WhatsApp, historial y tablón de avisos |
| 08 Áreas y reservaciones | Áreas comunes, disponibilidad y reservas |

Cada petición trae una pestaña **Docs** con lo que hace, qué rol la puede
llamar, y las decisiones de diseño que no son obvias.

## Tres cosas que conviene saber

**El fraccionamiento sale del token, nunca de un parámetro.** No verás
`?fraccionamiento_id=` en ninguna petición: se toma del JWT. Es lo que impide
que un administrador toque datos de otro fraccionamiento.

**Dos peticiones responden con error a propósito.** El webhook de MercadoPago
devuelve `401` porque desde Bruno no se puede falsificar su firma HMAC, y el de
Meta devuelve `403` salvo que pongas tu `META_VERIFY_TOKEN`. En ambos casos, ese
error **es** el comportamiento correcto.

**Las tres peticiones de documentos necesitan un archivo.** «Subir documento»
pide seleccionar uno desde Bruno; las de descargar y eliminar necesitan que
exista alguno subido antes.

## Para apuntar al servidor desplegado

Edita `environments/Produccion.bru` con el dominio real y cambia el entorno en
Bruno. Nada más: todas las peticiones usan `{{baseUrl}}`.

## Si algo deja de funcionar

**«Credenciales incorrectas» al iniciar sesión.** Alguien cambió la contraseña
desde la API. El seed no la restaura por diseño —para no pisar contraseñas
cambiadas a propósito—, así que hay que forzarlo:

```bash
SEED_RESET_PASSWORDS=true npm run seed --workspace=server
```

**«Alguno de los datos enviados no tiene un formato válido».** Falta una
variable de entorno: ejecuta antes la petición que la captura (normalmente el
«Listar…» de esa misma carpeta).

## Mantenimiento de la colección

Se genera con un script en lugar de editarse a mano, porque son 87 peticiones y
mantenerlas sincronizadas con la API a mano es inviable:

```bash
python3 scripts/gen-bruno.py     # desde la raíz del repositorio
```
