// Barrel de la capa de API. `import api from '../api'` sigue funcionando igual
// que antes; los módulos nuevos exponen sus funciones desde archivos propios
// (auth.js, lotes.js, propietarios.js, ...).
export { default } from './client'
export { getAccessToken, setAccessToken, clearAccessToken } from './token'
