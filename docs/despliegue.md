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
ssh -i fullstack.pem ec2-user@52.22.90.28 'sudo urbanflow-deploy'
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

El Security Group de AWS ya filtra en la nube, pero **firewalld** es la segunda
capa: si alguien abre un puerto por error en el SG, aquí sigue cerrado.

Abiertos solo `ssh`, `http` y `https`. Los puertos 3000 (API) y 5432 (Postgres)
**no** se abren: se llega a ellos solo desde la propia máquina.

```bash
sudo firewall-cmd --list-all              # ver las reglas
sudo firewall-cmd --permanent --add-service=X && sudo firewall-cmd --reload
```

> **Se usa firewalld y no nftables a mano**, aunque el primer aprovisionamiento
> lo hizo al revés. El motivo está en «El cortafuegos que ganó la carrera de
> arranque», más abajo.

### Un solo gestor de cortafuegos

`nftables.service` queda **deshabilitado** a propósito, y
`/etc/sysconfig/nftables.conf` vacío con una nota. El fichero de reglas antiguo
se conserva como `/etc/nftables/urbanflow.nft.desactivado`, solo como
referencia: empieza con `flush ruleset`, así que arrancarlo borraría las tablas
de firewalld.

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

### El cortafuegos que ganó la carrera de arranque

Este solo apareció al **apagar y encender** la instancia por primera vez, una
semana después. El sitio dejó de responder por completo y el SSH tampoco
entraba.

El aprovisionamiento había montado nftables con su propio fichero de reglas.
Funcionó… mientras nadie reiniciara. Amazon Linux 2023 trae **firewalld activo y
habilitado** de fábrica, y los dos gestores escriben sobre el mismo subsistema
del kernel: no pueden convivir. Al arrancar de nuevo ganó firewalld,
`nftables.service` se saltó en silencio (`ConditionResult=no`, sin una sola
línea en el journal) y quedó mandando la configuración por defecto de firewalld,
que solo permite `ssh`.

El síntoma era desconcertante hasta que se leen los puertos con cuidado:

| Puerto | Respuesta | Quién |
|---|---|---|
| 80, 443 | `connection refused` | firewalld, que **rechaza** |
| 3000, 5432 | timeout | el Security Group, que **descarta** |

Dos cortafuegos distintos respondiendo de dos formas distintas al mismo tiempo.

La solución fue quedarse con **uno**: firewalld, que es el que la distribución
mantiene y el que persiste sus reglas sin ayuda. Precisamente la persistencia era
el problema — las reglas de nftables se habían aplicado en caliente y el fichero
que debía recargarlas nunca ganaba el arranque.

**La lección:** un cortafuegos no está configurado hasta que sobrevive a un
reinicio. Igual que los servicios: `systemctl start` no es `systemctl enable`.
Ahora el despliegue se verifica con un `reboot` de verdad.

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

**Las credenciales de Stripe del servidor.** Ya existen y están probadas en
local (ver [modulos/12-cobro-con-stripe.md](modulos/12-cobro-con-stripe.md)),
pero falta ponerlas en el `.env` de la instancia, dar de alta el webhook en el
panel de Stripe apuntando a `/api/pagos/webhook` con el dominio real, y cambiar
`STRIPE_BACK_URL_*` para que no manden al residente a `localhost`. Sin
`STRIPE_SECRET_KEY` el checkout responde `500` diciendo qué falta; el resto de la
aplicación funciona.

**Actualizar DuckDNS a la Elastic IP.** El registro sigue apuntando a la IP
antigua. El certificado no hace falta reemitirlo: va por dominio, no por IP.

**Los documentos se pierden al redesplegar** solo si se recrea la instancia: en
EC2 el disco EBS persiste entre reinicios y despliegues, así que la limitación
que había con Railway/Render aquí no aplica.

---

## Acceso

```bash
ssh -i fullstack.pem ec2-user@52.22.90.28
```

La IP es una **Elastic IP**, así que ya no cambia al apagar la instancia. Antes
no lo era: apagarla una vez bastó para que AWS la reasignara y DuckDNS quedara
apuntando a una máquina ajena.

Si algún día el puerto 22 deja de responder, la instancia tiene el rol
`UrbanFlowSSM` adjunto: se entra por **Systems Manager → Session Manager** desde
la consola de AWS, que va por conexión saliente y no depende del cortafuegos de
entrada.

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
