# DB Schema — Gestión Fraccionamiento

PostgreSQL. `fraccionamiento_id` en todas las tablas core (SaaS-ready).

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
| qr_token | VARCHAR | QR único para entrada residente |
| activo | BOOLEAN | |

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
| url_archivo | TEXT | ruta local o URL S3 |
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
| mes_año | DATE | primer día del mes, ej. 2025-05-01 |
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
| pdf_url | TEXT | recibo generado |
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
| tipo | ENUM | visita, delivery, servicio |
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
| canales | JSONB | { email: true, whatsapp: true } |
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
