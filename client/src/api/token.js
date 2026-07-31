// El access token vive SOLO en memoria. Al recargar la página se vuelve a pedir
// con POST /auth/refresh usando la cookie httpOnly, que el navegador manda sola.
//
// Por qué una variable de módulo y no estado de React: el interceptor de axios
// corre fuera del árbol de React y necesita leer el token de forma síncrona y
// siempre actualizada. Guardarlo en estado provoca un stale closure (el
// interceptor captura el token del render en que se registró) y un import
// circular entre client.js y AuthContext.jsx.

let accessToken = null

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token) {
  accessToken = token
}

export function clearAccessToken() {
  accessToken = null
}
