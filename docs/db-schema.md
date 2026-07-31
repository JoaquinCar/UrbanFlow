# DB Schema — Gestión Fraccionamiento

PostgreSQL. `fraccionamiento_id` en las tablas core (SaaS-ready).

> **Estado:** este documento refleja el esquema **implementado**, tras las 11
> migraciones de `server/shared/db/migrations/`. Las diferencias respecto al
> diseño original están anotadas en cada tabla y explicadas en
> [decisiones.md](decisiones.md).
>
> Tres tablas **no** llevan `fraccionamiento_id` y se aíslan por JOIN:
> `documentos` (vía `propietarios`), `pagos` (vía `cuotas`) y `reservaciones`
> (vía `areas_comunes`). Duplicar la columna invita a que las dos copias se
> desincronicen.

---

## fraccionamientos
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID PK | |
| nombre | VARCHAR | |
| direccion | TEXT | |
| config_mapa | JSONB | SVG config, bounds, etapas |
| created_at | TIMESTAMP | |

---

## usuarios
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID PK | |
| fraccionamiento_id | UUID FK | → fraccionamientos |
| nombre | VARCHAR | |
| email | VARCHAR UNIQUE | |
| password_hash | VARCHAR | bcrypt |
| rol | ENUM | admin, vigilante, propietario, tecnico |
| qr_token | VARCHAR | QR de entrada del residente. JWT firmado con `QR_SECRET`, sin expiración; **esta columna es la fuente de verdad para revocarlo** |
| refresh_token | VARCHAR | sha256 del refresh token vigente. Permite invalidar la sesión desde el servidor |
| activo | BOOLEAN | |
| created_at | TIMESTAMP | |

---

## lotes
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID PK | |
| fraccionamiento_id | UUID FK | |
| numero | VARCHAR | ej. "A-12" |
| superficie_m2 | DECIMAL | |
| precio | DECIMAL | |
| etapa | VARCHAR | ej. "Etapa 1" |
| estado | ENUM | disponible, proceso, vendido |
| svg_path_id | VARCHAR | conecta con shape en SVG del mapa |
| propietario_id | UUID FK nullable | → propietarios |

---

## propietarios
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID PK | |
| fraccionamiento_id | UUID FK | |
| usuario_id | UUID FK | → usuarios |
| nombre_completo | VARCHAR | |
| telefono | VARCHAR | |
| whatsapp | VARCHAR | con código país, ej. +521... |
| curp | VARCHAR | |
| num_escritura | VARCHAR | |

---

## documentos
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID PK | |
| propietario_id | UUID FK | |
| tipo | VARCHAR | ine, escritura, comprobante, etc. |
| nombre_archivo | VARCHAR | nombre original que subió el usuario; en disco el archivo lleva un UUID |
| url_archivo | TEXT | nombre del archivo en `UPLOAD_DIR`. **Disco efímero en Railway/Render** |
| mime_type | VARCHAR | para devolver el `Content-Type` correcto al descargar |
| tamano_bytes | INTEGER | |
| created_at | TIMESTAMP | |

---

## cuotas
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID PK | |
| fraccionamiento_id | UUID FK | |
| propietario_id | UUID FK | |
| tipo | ENUM | mensual, extraordinaria |
| monto | DECIMAL | |
| mes_anio | DATE | primer día del mes, ej. 2026-05-01. **Sin `ñ`**: un identificador acentuado obliga a entrecomillarlo en cada consulta |
| estado | ENUM | pendiente, pagado, vencido |
| concepto | VARCHAR | descripción para cuotas extraordinarias |

---

## pagos
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID PK | |
| cuota_id | UUID FK | → cuotas |
| monto_pagado | DECIMAL | |
| metodo | ENUM | online, efectivo, transferencia |
| referencia_mp | VARCHAR | payment_id de MercadoPago |
| pdf_url | TEXT | **siempre NULL**. El recibo se genera bajo demanda en memoria: el plan gratuito de Railway/Render no tiene disco persistente. La columna se conserva para no gastar una migración en eliminarla |
| fecha_pago | TIMESTAMP | |

---

## visitas
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID PK | |
| fraccionamiento_id | UUID FK | |
| lote_destino_id | UUID FK | → lotes |
| nombre_visitante | VARCHAR | |
| placa_vehiculo | VARCHAR | nullable si viene a pie |
| tipo | ENUM | visita, delivery, servicio, **residente**. El cuarto valor se añadió para las entradas por QR, que no encajan en los otros tres |
| entrada_at | TIMESTAMP | |
| salida_at | TIMESTAMP nullable | null = aún dentro |
| registrado_por | UUID FK | → usuarios (vigilante) |
| notas | TEXT | nullable |

---

## solicitudes_mantenimiento
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID PK | |
| fraccionamiento_id | UUID FK | |
| solicitante_id | UUID FK | → usuarios |
| tecnico_id | UUID FK nullable | → usuarios (rol=tecnico) |
| descripcion | TEXT | |
| ubicacion | VARCHAR | área afectada |
| estado | ENUM | abierto, en_proceso, resuelto |
| created_at | TIMESTAMP | |
| resuelto_at | TIMESTAMP nullable | |

---

## comunicados
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID PK | |
| fraccionamiento_id | UUID FK | |
| autor_id | UUID FK | → usuarios (admin) |
| titulo | VARCHAR | |
| cuerpo | TEXT | |
| canales | JSONB | lo que se **pidió** enviar: `{ email: true, whatsapp: false }` |
| resultado_envio | JSONB | lo que **pasó**, por canal: intentados, enviados, fallidos y errores |
| enviado_at | TIMESTAMP | |

---

## areas_comunes
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID PK | |
| fraccionamiento_id | UUID FK | |
| nombre | VARCHAR | salon, alberca, cancha |
| capacidad | INTEGER | personas máx |
| activa | BOOLEAN | |

---

## reservaciones
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID PK | |
| area_id | UUID FK | → areas_comunes |
| propietario_id | UUID FK | |
| fecha | DATE | |
| hora_inicio | TIME | |
| hora_fin | TIME | |
| estado | ENUM | pendiente, confirmada, cancelada |

---

## Relaciones clave

```
fraccionamientos ──1:N── lotes
fraccionamientos ──1:N── usuarios
fraccionamientos ──1:N── cuotas
fraccionamientos ──1:N── visitas
fraccionamientos ──1:N── comunicados

propietarios ──1:N── lotes          (un propietario puede tener varios lotes)
propietarios ──1:N── cuotas
propietarios ──1:N── documentos

usuarios ──1:1── propietarios       (si rol = propietario)

cuotas ──1:N── pagos

visitas.registrado_por ──N:1── usuarios (vigilante)
solicitudes_mantenimiento.tecnico_id ──N:1── usuarios (tecnico)
```

---

## Notas de implementación

- UUIDs generados con `gen_random_uuid()` (PostgreSQL nativo)
- `usuarios.qr_token` = JWT firmado con secret propio, no expira (solo se invalida al desactivar usuario)
- `lotes.svg_path_id` debe coincidir con el atributo `id` del `<path>` en el SVG del mapa
- `cuotas` se generan automáticamente cada mes (cron job) para todos los propietarios activos
- `pagos.referencia_mp` permite reconciliar webhooks de MercadoPago con el pago en BD
- Bitácora de visitas: query con `WHERE entrada_at >= NOW() - INTERVAL '30 days'`

---

## Restricciones que hacen imposibles los datos incoherentes

Además de las claves foráneas, el esquema usa restricciones para que ciertos
errores no puedan llegar a la tabla. Cada una previene un bug concreto:

| Restricción | Tabla | Qué impide |
|---|---|---|
| `chk_ticket_resuelto` | `solicitudes_mantenimiento` | Reabrir un ticket dejando puesta la fecha de resolución. Obliga a que `estado = 'resuelto'` y `resuelto_at IS NOT NULL` vayan siempre juntos |
| `excl_reservaciones_solape` | `reservaciones` | Dos reservas del mismo horario. Es la única protección real: el `SELECT` previo tiene una condición de carrera |
| `uq_pagos_referencia_mp_online` | `pagos` | Que un reintento del webhook de MercadoPago duplique el pago. Acotado a `metodo = 'online'`, porque los folios de caja sí se repiten |
| `uq_cuota_mensual_mes` | `cuotas` | Dos cuotas mensuales del mismo periodo para un propietario. Es parcial (`WHERE tipo = 'mensual'`), así que varias extraordinarias del mismo mes conviven |
| `uq_lotes_fraccionamiento_numero` | `lotes` | Dos lotes con el mismo número **en el mismo fraccionamiento**. Puede haber un A-01 en cada uno |
| `chk_visitas_salida` | `visitas` | Una salida anterior a la entrada |
| `chk_reserva_horas` | `reservaciones` | Una reserva de duración cero o negativa |

## Extensiones de PostgreSQL

| Extensión | Para qué |
|---|---|
| `pgcrypto` | `gen_random_uuid()` en todas las claves primarias |
| `btree_gist` | Permite combinar igualdad (`area_id`) y solapamiento (`&&`) en el mismo índice GiST, que es lo que hace posible `excl_reservaciones_solape` |

## Control de migraciones

`schema_migrations (filename PK, checksum, applied_at)`. Cada archivo se aplica
una sola vez, dentro de su propia transacción, y se guarda el sha256 de su
contenido: si una migración ya aplicada cambia, `npm run migrate` aborta. Las
migraciones son inmutables — para modificar algo se crea un archivo nuevo.
