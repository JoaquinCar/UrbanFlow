# PR 8 — Portal del Propietario

**Responsable:** Jorge Ruiz · **Módulo:** Portal del Propietario (Fase 3, semana 8)

El único módulo del plan que **no añade endpoints propios**: integra en una sola
vista lo que ya exponen los seis módulos anteriores.

---

## 1. Qué consume

| Bloque del portal | Endpoint | Módulo |
|---|---|---|
| Nombre y lotes | `GET /propietarios/me` | PR 2 |
| Saldo y vencido | `GET /pagos/cuotas/mias` | PR 4 |
| Visitas recientes | `GET /visitas/mis-visitas` | PR 3 |
| Reportes abiertos | `GET /mantenimiento/mios` | PR 5 |
| Próximas reservas | `GET /reservaciones/mias` | PR 7 |
| Último aviso | `GET /comunicados/mios` | PR 6 |

---

## 2. Seis peticiones, no una agregada

Podría haberse creado un `GET /portal/resumen` que devolviera todo junto, con
una sola ida y vuelta. No se hizo, por dos razones:

**Aislamiento de fallos.** Cada bloque se carga con su propio `useFetch`. Si el
módulo de reservas devolviera un error, el resto del portal sigue mostrándose.
Con un endpoint agregado, un fallo en cualquier consulta tumba la pantalla
entera.

**No inventar un endpoint que ya existe seis veces.** Un `/portal/resumen`
duplicaría la lógica de permisos de los seis módulos y habría que mantenerlo
sincronizado con cada cambio. El plan del proyecto ya lo anticipaba: *"Consume
endpoints existentes, sin endpoints nuevos propios"*.

El coste es real —seis peticiones en paralelo al cargar— pero para un portal
personal con datos pequeños es despreciable, y a cambio la pantalla es robusta.

---

## 3. Una ruta, dos pantallas

`/dashboard` la comparten administrador y propietario, pero no ven lo mismo:

```jsx
function InicioSegunRol() {
  const { rol } = useAuth();
  return rol === 'propietario' ? <Portal /> : <Dashboard />;
}
```

Se resuelve con un componente despachador en vez de dos rutas distintas para
que "Inicio" en el menú lleve siempre al mismo sitio, sea quien sea. El
administrador conservará el `Dashboard` actual hasta que el PR 9 lo sustituya
por el panel de métricas.

---

## 4. El dashboard mock queda sustituido por datos reales

El `Dashboard.jsx` original mostraba:

- `$1,200.00 mxn` de pagos pendientes — **una cifra escrita a mano**
- Ubicación `Casa` — literal
- Notificaciones inventadas en inglés

Ahora todo sale de la base: el saldo es la suma real de cuotas pendientes y
vencidas, los lotes son los del propietario, y las visitas son las que registró
el vigilante.

En la verificación se comprueba explícitamente que **ya no aparece la cifra
`1,200.00`**.

---

## 5. `Access.jsx` reescrito

La pantalla mostraba tres arrays de "familiares" y "visitantes"
(`Roberto Garza`, `Elena Garza`, `Carlos López`) y un QR falso construido en el
cliente:

```js
const qrValue = `urbanflow://access/${item.id}/${item.nombre}`
```

Ese código no lo reconoce nada: la caseta valida un JWT firmado con `QR_SECRET`
contra `usuarios.qr_token`.

Además, **el producto no tiene registro de familiares**. El QR es del residente
y lo emite el backend; las visitas las registra el vigilante en la caseta. La
pantalla ahora refleja eso: dos pestañas, "Mi código QR" (el real, descargable)
e "Historial de visitas" (las de sus lotes).

El texto del QR advierte de lo que importa: no caduca, no se comparte, y si se
pierde la administración lo regenera.

---

## 6. Dos detalles que solo se vieron en la captura

**Orden de las próximas reservas.** `GET /reservaciones/mias` ordena por fecha
descendente, que es lo correcto para un historial. Pero en "Próximas reservas"
eso ponía septiembre antes que agosto. Se reordena ascendente en el portal: lo
más cercano primero.

**`text-transform: capitalize` rompe el español.** Producía
*"Lunes, 14 De Septiembre"*. La regla capitaliza **cada palabra**, y en español
solo va en mayúscula la primera. Se quitó del CSS y la mayúscula inicial se
aplica en el formateador:

```js
return texto.charAt(0).toUpperCase() + texto.slice(1)
```

Ninguno de los dos rompía nada funcionalmente; los dos se veían mal.

---

## 7. Detalle de accesibilidad

Las tarjetas de acceso rápido eran `<div onClick>`. Ahora son `<button>`: se
alcanzan con Tab y responden a Enter sin añadir nada. El CSS neutraliza el
estilo nativo del botón (`button.action-card`).

---

## Cómo probarlo

```bash
cd server && npm run seed && npm run dev
cd ../client && npm run dev
```

Como `propietario@urbanflow.test` / `UrbanFlow2026!`:

1. Aterriza en el portal con su **nombre y lotes reales** (A-03, A-09, B-02, B-10).
2. El saldo muestra el adeudo real con el desglose de vencido — cuadra con lo
   que aparece en "Mi estado de cuenta".
3. "Próximas reservas" en orden cronológico, la más cercana arriba.
4. "Visitas recientes" con las que registró el vigilante.
5. Los cuatro accesos rápidos navegan a los módulos correspondientes.
6. **Mi código QR**: el mismo que la caseta acepta. Se puede comprobar de punta a
   punta descargándolo y escaneándolo desde la caseta con el vigilante.

Como `admin@urbanflow.test`: `/dashboard` sigue mostrando su vista, no el portal.

Verificado con 17 comprobaciones en navegador real.
