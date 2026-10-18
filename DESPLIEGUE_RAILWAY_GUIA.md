# 🚀 GUÍA DE DESPLIEGUE DE MODEFLOW CLOUD EN RAILWAY (PASO A PASO)

¡Todo el código de **ModeFlow Cloud** está empaquetado, verificado y listo para producción con seguridad total! 

Sigue estos 4 pasos sencillos para tener tu plataforma corriendo 24/7 en la nube bajo tu propio dominio.

---

### Paso 1: Subir el proyecto a GitHub

El repositorio local ya está inicializado y con `.gitignore` blindado.

1. Ve a **[GitHub.com/new](https://github.com/new)**.
2. Crea un nuevo repositorio:
   * **Nombre:** `modeflow-cloud`
   * **Visibilidad:** 🔒 **Private** (Privado)
   * *(No agregues README, ni .gitignore, ni licencia, ya los tenemos listos)*.
3. Copia el enlace HTTPS de tu repositorio (ejemplo: `https://github.com/TU_USUARIO/modeflow-cloud.git`).
4. En tu terminal o consola, dentro de `MODEFLOW_CLOUD`, ejecuta:

```bash
git remote add origin https://github.com/TU_USUARIO/modeflow-cloud.git
git branch -M main
git push -u origin main
```

---

### Paso 2: Crear el Proyecto en Railway

1. Entra a **[railway.app](https://railway.app)** e inicia sesión con tu cuenta de **GitHub**.
2. Haz clic en el botón morado: **`New Project`**.
3. Selecciona: **`Deploy from GitHub repo`**.
4. Elige tu repositorio: **`modeflow-cloud`**.
5. Haz clic en **`Deploy Now`**.

*(Railway detectará automáticamente el archivo `Dockerfile` y empezará a compilar el contenedor en ~60 segundos).*

---

### Paso 3: Activar el Disco Persistente (Volumen Cloud)

Para que el bot **NUNCA** se desconecte ni vuelva a pedirte el código QR si Railway se actualiza o reinicia:

1. En el panel de Railway, haz clic sobre la tarjeta de tu servicio desplegado.
2. Ve a la pestaña **`Volumes`** (o haz clic en los 3 puntos del servicio > **`Add Volume`**).
3. En la ruta de montaje (**Mount Path**), escribe:
   👉 **`/app/storage`**
4. En la pestaña **`Variables`** de tu servicio en Railway, agrega una variable:
   * **Nombre:** `STORAGE_DIR`
   * **Valor:** `/app/storage`
5. ¡Listo! La sesión de WhatsApp y la base de datos de configuraciones quedan blindadas de por vida en la nube.

---

### Paso 4: Conectar tu Dominio Oficial (`app.modeagency.com`)

1. En Railway, en tu servicio, ve a **`Settings`** ➔ **`Networking`**.
2. En la sección **`Custom Domains`**, haz clic en **`Add Domain`**.
3. Escribe tu subdominio deseado: **`app.modeagency.com`** (o tu dominio principal `modeflow.co`).
4. Railway te entregará un registro **CNAME** (por ejemplo: `modeflow-cloud.up.railway.app`).
5. Ve a tu proveedor donde compraste el dominio (Cloudflare, Namecheap, GoDaddy, etc.) y añade el registro CNAME:
   * **Tipo:** `CNAME`
   * **Nombre / Host:** `app`
   * **Valor / Destino:** El CNAME que te dio Railway.
6. En 2 minutos Railway emitirá automáticamente el certificado SSL con **candado de seguridad (HTTPS)**.

---

### 🌐 ¡Tu Software en Vivo y Operativo 24/7!
Al entrar a `https://app.modeagency.com`:
* Verás tu panel ejecutivo con el logo de **ModeFlow AI (by Mode Agency)**.
* Haces clic en **Vincular WhatsApp (QR)**, apuntas la cámara de tu celular al código QR que aparece en la pantalla, y tu IA quedará atendiendo y agendando citas las 24 horas del día sin necesidad de tener tu computador encendido.
