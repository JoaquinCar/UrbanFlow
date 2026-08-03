# Despliegue en AWS EC2

**Producción:** https://urbanflowfullstack.duckdns.org

---

## Qué hay montado

| Pieza | Detalle |
|---|---|
| Instancia | EC2 `t2.micro`, Amazon Linux 2023, 2 vCPU, 912 MB RAM |
| Node | 20 LTS |
| Base de datos | PostgreSQL 16, solo en `127.0.0.1` |
| Servidor web | nginx como proxy inverso |
| Certificado | Let's Encrypt, renovación automática |
| Dominio | DuckDNS |

La API corre bajo systemd como el usuario `urbanflow`; nginx sirve el cliente ya
construido desde `client/dist` y hace de proxy a la API y al WebSocket.

---

## Actualizar

```bash
ssh -i fullstack.pem ec2-user@107.22.26.213 'sudo urbanflow-deploy'
```

Hace `git pull`, instala dependencias, corre migraciones, reconstruye el cliente
y reinicia el servicio. Si la API no responde después, imprime el log y sale con
error en lugar de dejar el despliegue a medias.

---

## Decisiones y por qué

### Swap de 2 GB

La instancia tiene 912 MB y el `t2.micro` no trae swap. El build de Vite y la
compilación de los binarios nativos de `bcrypt` mueren por falta de memoria sin
él. Se añadió con `vm.swappiness=20`: se prefiere usar swap antes que que el
kernel mate un proceso.

### Postgres solo escucha en localhost

`listen_addresses = 'localhost'` y autenticación `scram-sha-256`. La API corre
en la misma máquina, así que no hay razón para exponer el 5432 ni a la red
interna. La contraseña se generó en el servidor y vive en `/etc/urbanflow/dbpass`
con permisos `0600`.

### La aplicación no corre como root

Usuario `urbanflow`, de sistema, sin shell de login. El servicio de systemd está
acotado:

```ini
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/urbanflow/uploads   # lo único que necesita escribir
PrivateTmp=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
```

Si alguien lograra ejecutar código a través de la aplicación, no podría escribir
en el sistema de archivos fuera de la carpeta de documentos.

### Cortafuegos en la máquina, además del Security Group

El Security Group de AWS ya filtra en la nube, pero nftables es la segunda capa:
si alguien abre un puerto por error en el SG, aquí sigue cerrado.

Política `drop` por defecto; abiertos solo 22, 80 y 443. Los puertos 3000 (API)
y 5432 (Postgres) **no** se abren: se llega a ellos solo desde la propia máquina.

### Secretos generados en el servidor

`JWT_SECRET`, `JWT_REFRESH_SECRET` y `QR_SECRET` se generaron con
`openssl rand -hex 48` durante el aprovisionamiento. Los valores del
`.env.example` (`change_this_secret_key`) son de ejemplo: cualquiera que lea el
repositorio podría firmar tokens válidos con ellos.

### Actualizaciones de seguridad automáticas

`dnf-automatic` con `upgrade_type = security`: aplica solo parches de seguridad,
no actualizaciones que puedan romper la aplicación.

### Logs acotados

`journald` limitado a 300 MB y 30 días. Sin límite, el log del servicio acabaría
llenando los 8 GB de disco.

---

## Problemas que aparecieron al desplegar

Cuatro fallos que **solo se manifiestan en un entorno limpio**. Los cuatro
estaban en `main` y se corrigieron.

### `vexor` y `stripe` sin declarar (PR #24)

`payments.vexorpay.js` los requería, pero no estaban en `package.json`. En
cualquier clon nuevo el servidor no arranca:

```
Error: Cannot find module 'vexor'
```

No se notó antes porque quien lo desarrolló ya los tenía instalados de otra
prueba.

### El cliente llamaba al localhost del visitante (PR #26)

La URL de la API iba grabada en el build (`http://localhost:3000/api`), así que
el navegador de cada visitante intentaba llamar a **su propio** localhost:

```
Access to XMLHttpRequest at 'http://localhost:3000/api/auth/refresh'
from origin 'http://107.22.26.213' has been blocked by CORS policy
```

Ahora, sin `VITE_API_URL`, se usa el mismo origen que sirvió la página. Eso
además permitió pasar de IP a dominio y de HTTP a HTTPS **sin reconstruir el
cliente**.

### La sesión no sobrevivía a un cambio de página (PR #27)

La cookie de refresh se marcaba `Secure` según `NODE_ENV=production`, pero el
servidor aún servía por HTTP. El navegador descarta las cookies `Secure`
recibidas por conexión no cifrada, así que `/auth/refresh` devolvía 401 en bucle.

Ahora depende de `req.secure`, que Express resuelve leyendo `X-Forwarded-Proto`
que envía nginx. Se marca `Secure` en cuanto hay HTTPS, sin configurar nada.

Ligar una propiedad del transporte a una variable de entorno era el error de
fondo: `NODE_ENV` dice en qué modo corre la aplicación, no si la conexión va
cifrada.

### El bloque por defecto de nginx tapaba el nuestro

Amazon Linux trae un `server` con `default_server` en `nginx.conf`. El nuestro
no lo tenía, así que todas las peticiones caían en el suyo y devolvían su página
404. Se comentó el de la distribución y el nuestro pasó a ser `default_server`.

---

## HTTPS

Let's Encrypt **no emite certificados para dominios `*.amazonaws.com`**, así que
con la URL que da AWS por defecto no hay forma de tener HTTPS válido. Se
registró un subdominio gratuito en DuckDNS apuntando a la IP de la instancia.

Sin HTTPS había dos cosas que no podían funcionar:

- **El escáner QR de la caseta.** `getUserMedia` no da acceso a la cámara fuera
  de un contexto seguro.
- **El webhook de pagos.** Stripe exige HTTPS válido.

La renovación es automática (`certbot-renew.timer`), verificada con
`certbot renew --dry-run`.

> DuckDNS es gratis y suficiente para la entrega, pero depende de un servicio de
> terceros sin garantías. Para algo serio, un dominio propio.

---

## Qué falta

**Credenciales de Stripe.** `VEXOR_PROJECT`, `VEXOR_PUBLISHABLE_KEY`,
`STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` están vacías, así que el checkout
responde `500` diciendo exactamente qué falta. El resto de la aplicación
funciona.

**Los documentos se pierden al redesplegar** solo si se recrea la instancia: en
EC2 el disco EBS persiste entre reinicios y despliegues, así que la limitación
que había con Railway/Render aquí no aplica.

---

## Acceso

```bash
ssh -i fullstack.pem ec2-user@107.22.26.213
```

| Recurso | Dónde |
|---|---|
| Código | `/opt/urbanflow/app` (propiedad de `urbanflow`) |
| Configuración | `/opt/urbanflow/app/server/.env` (`0600`) |
| Documentos subidos | `/opt/urbanflow/uploads` |
| Contraseña de la base | `/etc/urbanflow/dbpass` (`0600`) |
| Log de la API | `sudo journalctl -u urbanflow -f` |
| Certificados | `/etc/letsencrypt/live/urbanflowfullstack.duckdns.org/` |

```bash
sudo systemctl status urbanflow      # estado de la API
sudo systemctl restart urbanflow     # reiniciar
sudo nft list chain inet filtro entrada   # reglas del cortafuegos
sudo fail2ban-client status sshd     # intentos de acceso bloqueados
```
