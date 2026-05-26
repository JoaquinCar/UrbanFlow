-- Migration 001: tablas base (fraccionamientos + usuarios)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS fraccionamientos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      VARCHAR(100) NOT NULL,
  direccion   TEXT,
  config_mapa JSONB DEFAULT '{}',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TYPE rol_usuario AS ENUM ('admin', 'vigilante', 'propietario', 'tecnico');

CREATE TABLE IF NOT EXISTS usuarios (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraccionamiento_id   UUID NOT NULL REFERENCES fraccionamientos(id) ON DELETE CASCADE,
  nombre               VARCHAR(100) NOT NULL,
  email                VARCHAR(150) UNIQUE NOT NULL,
  password_hash        VARCHAR(255) NOT NULL,
  rol                  rol_usuario NOT NULL,
  qr_token             VARCHAR(500),
  refresh_token        VARCHAR(500),
  activo               BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_fraccionamiento ON usuarios(fraccionamiento_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
