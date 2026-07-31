import {
  HiHome,
  HiBanknotes,
  HiBell,
  HiUsers,
  HiQrCode,
  HiCog6Tooth,
  HiMap,
  HiSquares2X2,
  HiWrenchScrewdriver,
  HiMegaphone,
  HiCalendarDays,
  HiClipboardDocumentList,
} from 'react-icons/hi2'

// Fuente única de la navegación. Antes NAV_ITEMS estaba duplicado en
// SideMenu.jsx y Settings.jsx, así que añadir una entrada obligaba a editar dos
// archivos y era fácil que se desincronizaran.
//
// `roles`    — quién ve la entrada. Es solo la UI: el permiso real lo aplica
//              requireRole en el backend.
// `pendiente` — la pantalla todavía no existe. La lista completa documenta la
//              arquitectura de información objetivo; cada PR de módulo quita su
//              bandera al entregar la pantalla, para no publicar enlaces rotos.
export const NAV_ITEMS = [
  { label: 'Inicio',              icon: HiHome,                  path: '/dashboard',     roles: ['admin', 'propietario'] },
  { label: 'Caseta',              icon: HiQrCode,                path: '/caseta',        roles: ['vigilante', 'admin'] },
  { label: 'Bitácora',            icon: HiClipboardDocumentList, path: '/bitacora',      roles: ['vigilante', 'admin'] },
  { label: 'Lotes',               icon: HiSquares2X2,            path: '/lotes',         roles: ['admin'] },
  { label: 'Mapa',                icon: HiMap,                   path: '/mapa',          roles: ['admin'] },
  { label: 'Propietarios',        icon: HiUsers,                 path: '/owners',        roles: ['admin'] },
  { label: 'Cuotas',              icon: HiBanknotes,             path: '/cuotas',        roles: ['admin'] },
  { label: 'Mi estado de cuenta', icon: HiBanknotes,             path: '/payments',      roles: ['propietario'] },
  { label: 'Mi acceso (QR)',      icon: HiQrCode,                path: '/access',        roles: ['propietario'] },
  { label: 'Mantenimiento',       icon: HiWrenchScrewdriver,     path: '/mantenimiento', roles: ['admin', 'tecnico', 'propietario'] },
  { label: 'Áreas comunes',       icon: HiCalendarDays,          path: '/reservas',      roles: ['admin', 'propietario'],             pendiente: true },
  { label: 'Comunicados',         icon: HiMegaphone,             path: '/comunicados',   roles: ['admin'],                            pendiente: true },
  { label: 'Notificaciones',      icon: HiBell,                  path: '/notifications', roles: ['admin', 'propietario', 'vigilante', 'tecnico'] },
  { label: 'Configuración',       icon: HiCog6Tooth,             path: '/settings',      roles: ['admin', 'propietario', 'vigilante', 'tecnico'] },
]

export function navItemsForRole(rol) {
  if (!rol) return []
  return NAV_ITEMS.filter(item => !item.pendiente && item.roles.includes(rol))
}

// A dónde va cada rol tras iniciar sesión. El vigilante no tiene dashboard: su
// pantalla de trabajo es la caseta.
export const HOME_BY_ROLE = {
  admin: '/dashboard',
  vigilante: '/caseta',
  propietario: '/dashboard',
  tecnico: '/mantenimiento',
}

export function homeForRole(rol) {
  return HOME_BY_ROLE[rol] || '/dashboard'
}
