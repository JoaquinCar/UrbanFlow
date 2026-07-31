# PR 9 — Dashboard de administración

**Responsable:** Jorge Ruiz · **Módulo:** Dashboard Admin (Fase 3–4, semana 9)

Panel con las métricas del fraccionamiento y la actividad reciente. Es el último
módulo funcional del plan y el que **solo podía hacerse al final**: lee de seis
tablas que no existían hasta los PRs anteriores.

---

## 1. Endpoint — `GET /api/fraccionamiento/dashboard`

Solo administrador. Devuelve métricas y actividad en una respuesta:

```json
{
  "lotes":         { "total": 25, "disponible": 10, "proceso": 5, "vendido": 10 },
  "propietarios":  { "total": 3 },
  "cuotas":        { "pendientes": 9, "vencidas": 1, "monto_adeudado": "13500.00",
                     "cobrado_mes": "3000.00", "morosos": 1 },
  "visitas":       { "hoy": 7, "dentro": 3 },
  "tickets":       { "abiertos": 2, "en_proceso": 2 },
  "reservaciones": { "proximas": 5, "por_confirmar": 3 },
  "actividad":     { "visitas": [...], "tickets": [...], "morosos": [...] }
}
```

---

## 2. Por qué vive en el módulo `fraccionamiento`

El panel lee de `lotes`, `propietarios`, `cuotas`, `pagos`, `visitas`,
`solicitudes_mantenimiento` y `reservaciones`. No pertenece a ninguno de esos
módulos: **el fraccionamiento es lo único que los abarca a todos**.

Crear un módulo `dashboard` propio habría significado un noveno directorio cuyo
único contenido es una consulta. Ponerlo en cualquiera de los otros habría sido
arbitrario.

---

## 3. Una consulta, no seis

Las métricas van en un solo `SELECT` con subconsultas independientes:

```sql
SELECT
  (SELECT COUNT(*) FROM lotes WHERE ...)   AS lotes_total,
  (SELECT COUNT(*) FROM visitas WHERE ...) AS visitas_hoy,
  ...
```

Son agregados pequeños, y hacerlo así garantiza que **todas las cifras son del
mismo instante**. Con seis peticiones separadas, el panel podría mostrar
"3 visitas dentro" de hace 200 ms junto a "7 visitas hoy" de ahora — una
inconsistencia pequeña pero real que hace desconfiar del número.

Es lo contrario de la decisión del PR 8 (portal), donde sí se hicieron seis
peticiones. La diferencia: en el portal cada bloque es independiente y quiero
aislamiento de fallos; aquí las cifras se comparan entre sí y quiero coherencia.

La actividad reciente sí va en tres consultas aparte, porque son listados con
`LIMIT` y no cifras que se comparen.

---

## 4. "Vencido" se calcula, igual que en pagos

```sql
WHERE estado IN ('pendiente','vencido')
  AND mes_anio < date_trunc('month', CURRENT_DATE)
```

Se repite el criterio del módulo de pagos por la misma razón: el enum puede ir
por detrás si el job del día 1 no ha corrido. Si el panel filtrara solo por
`'pendiente'`, mostraría cero morosos justo después de generar las cuotas del
mes — exactamente el bug que se corrigió en el PR 4.

---

## 5. Las pruebas comprueban coherencia, no solo forma

Un panel de métricas puede responder 200 con números perfectamente formados y
completamente equivocados. Por eso el smoke no verifica solo la estructura:
**contrasta cada cifra con su módulo de origen**.

```js
check('el conteo de lotes cuadra con el listado',    d.lotes.total    === lotes.data.total)
check('el conteo de morosos cuadra con el reporte',  d.cuotas.morosos === morosos.data.length)
check('las visitas dentro cuadran con la caseta',    d.visitas.dentro === activas.data.length)
check('los tickets abiertos cuadran con mantenimiento', d.tickets.abiertos === tickets.data.total)
check('los lotes por estado suman el total',
      d.lotes.disponible + d.lotes.proceso + d.lotes.vendido === d.lotes.total)
```

Si alguien cambia el criterio de "moroso" en el módulo de pagos y se olvida del
panel, esta prueba falla. Es el tipo de desincronización que en producción nadie
detecta hasta que alguien compara dos pantallas.

---

## 6. Una barra en vez de una librería de gráficas

La distribución de lotes se muestra con tres `<span>` cuyo ancho es un
porcentaje:

```jsx
<span className="barra-segmento barra--vendido"
      style={{ width: `${(lotes.vendido / lotes.total) * 100}%` }} />
```

Traer Chart.js o Recharts —del orden de 150–400 KB— para representar tres
números sería desproporcionado, sobre todo en un bundle que ya avisa por tamaño.
La barra lleva `role="img"` y un `aria-label` que dice los conteos en texto,
así que también funciona con lector de pantalla.

---

## 7. Las métricas son navegables

Cada tarjeta es un `<button>` que lleva a su módulo: "Tickets abiertos" a
mantenimiento, "Por cobrar" a cuotas, "Visitas hoy" a la bitácora. Un panel que
solo informa obliga a buscar el módulo en el menú; uno que enlaza convierte cada
cifra en el punto de partida de una acción.

Al ser botones reales, se recorren con Tab.

---

## 8. Se elimina `Dashboard.jsx`

Con este PR desaparece la última pantalla con datos inventados. El
`Dashboard.jsx` original mostraba `$1,200.00` escritos a mano, ubicación `Casa`
y notificaciones en inglés. La verificación comprueba explícitamente que esos
textos ya no aparecen en ninguna parte.

---

## Cómo probarlo

```bash
cd server && npm run seed && npm run dev
npm run smoke -- --only=dashboard    # 11 comprobaciones
cd ../client && npm run dev
```

Como `admin@urbanflow.test`:

1. Aterriza en el panel con siete métricas reales.
2. La barra de ocupación coincide con la leyenda del mapa (`/mapa`).
3. "Mayores adeudos" muestra el mismo propietario que la pestaña Morosos de
   Cuotas, con el mismo importe.
4. "Últimos accesos" coincide con la parte alta de la bitácora.
5. Pulsar cualquier métrica lleva a su módulo.

Contraste manual recomendado: abrir el panel y `/cuotas` en dos pestañas y
comprobar que el importe "Por cobrar" es el mismo que el "Pendiente" del
resumen.

Verificado con 11 comprobaciones de API —todas de coherencia entre módulos— y
12 en navegador real.
