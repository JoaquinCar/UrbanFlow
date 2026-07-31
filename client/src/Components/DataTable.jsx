import React from 'react'
import { Spinner } from './Spinner'
import '../styles/table.css'

// Tabla para las vistas de admin en escritorio. En móvil cada fila se apila
// como tarjeta usando data-label (ver styles/table.css), porque una tabla de 6
// columnas en 450px no se lee.
//
//   <DataTable
//     columnas={[
//       { key: 'numero', label: 'Lote' },
//       { key: 'estado', label: 'Estado', render: l => <Badge estado={l.estado} /> },
//     ]}
//     filas={lotes}
//     onRowClick={lote => abrirDetalle(lote)}
//   />
export function DataTable({
  columnas,
  filas,
  cargando = false,
  error = null,
  vacio = 'Sin registros',
  onRowClick,
  rowKey = (f, i) => f.id ?? i,
}) {
  if (cargando) return <Spinner />
  if (error) return <p className="table-error">{error}</p>
  if (!filas || filas.length === 0) return <p className="access-empty">{vacio}</p>

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columnas.map(c => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr
              key={rowKey(fila, i)}
              className={onRowClick ? 'data-row--clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(fila) : undefined}
            >
              {columnas.map(c => (
                <td key={c.key} data-label={c.label}>
                  {c.render ? c.render(fila) : fila[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
