# Telecable · Muro corporativo

Panel central en **Django 5.2 / Python 3.11**, con **PostgreSQL**, archivos persistentes y publicación para las TVs. El reproductor es un carrusel a pantalla completa: fotografías de borde a borde, grupos de proyectos, equipos, cumpleaños y videos.

Para una demostración, sigue [la presentación del muro a gerencia](docs/presentacion-gerencia.md).

## Proyectos, cultura y campo

En el panel, **Añadir proyecto** registra el nombre, una foto de fondo opcional y el porcentaje de avance (0–100) junto con la fecha del reporte. El avance lo ingresa Imagen a partir del dato confirmado por el responsable; vacío significa **Sin avance reportado**, no 0%. Al publicar, los proyectos se muestran en grupos de hasta cuatro, cada uno con su foto y porcentaje. Los destacados van primero. Los grupos entran donde aparece el primer proyecto en el orden y usan la duración más larga del grupo. Todos los proyectos incluidos y vigentes tienen su turno.

Los accesos **Valor de cultura organizacional** y **Evento en campo** permiten añadir valores oficiales y actividades con foto, texto, fecha y lugar. Conservan el mismo proceso de guardar, revisar y publicar, y las fechas de inicio/retiro.

**Nuestros equipos** permite presentar cada área con foto, mensaje y hasta tres funciones separadas por comas. **Videos a pantalla completa** permite subir un MP4 y preparar su contenido; se intercala según su orden, se reproduce completo y continúa con la siguiente escena. Los antiguos ajustes de intervalo y videos por turno se conservan en la base para publicaciones anteriores, pero el carrusel actual utiliza el orden de contenidos.

**Ver ejemplo del carrusel · datos ficticios** abre una demostración privada con proyectos, equipo, cumpleaños, cultura, evento y video ilustrativos. No guarda registros, no publica y no se envía a las TVs. Sirve para revisar el formato antes de cargar los proyectos y valores reales.

## Iniciar en Windows

Desde la carpeta del repositorio, detén primero el servidor estático (`Ctrl+C`) si sigue usando el puerto 8000.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py setup_wall
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver
```

No hace falta activar el entorno. `createsuperuser` pide la cuenta de TI; la contraseña no aparece mientras escribes. Copia `.env.example` solo en la instalación inicial; conserva `.env` al actualizar.

Abre **http://127.0.0.1:8000/panel/** e ingresa con la cuenta de TI. La prueba local usa SQLite y guarda los archivos en `media/`. El despliegue exige PostgreSQL y almacenamiento persistente. En Linux/macOS, usa `python3 -m venv .venv` y `.venv/bin/python`.

## Cuenta del jefe de Imagen

Si una versión anterior muestra **403 — Origin checking failed - null** al iniciar sesión, actualiza `feature/panel-publicacion`, reinicia Django y abre de nuevo la página de acceso desde su enlace; no reenvíes el formulario anterior. Se corrigió `SECURE_REFERRER_POLICY` a `same-origin` para que los formularios conserven el origen requerido por CSRF. No hace falta volver a crear usuarios ni cambiar permisos.

En otra terminal del mismo proyecto:

```powershell
.\.venv\Scripts\python.exe manage.py create_editor jefeimagen
```

El comando solicita una contraseña propia y asigna **Editores de Imagen**. Puede subir archivos, editar, previsualizar, publicar y recuperar versiones. No puede administrar usuarios ni los enlaces de las TVs. Alternativamente, TI crea el usuario en `/admin/` y asigna ese grupo sin marcarlo como personal administrativo.

## Primera publicación

1. **Biblioteca:** sube imágenes, MP4 o música MP3/WAV. Permanecen guardados en el servidor.
2. **Contenido y ajustes:** añade proyectos, equipos, anuncios, mensajes, videos, eventos, reconocimientos y cumpleaños; define orden, duración y fechas de inicio/retiro en hora de Lima.
3. Guarda cada formulario y pulsa **Ver borrador**. Usa el mismo reproductor que la TV y respeta la programación actual.
4. Pulsa **Publicar borrador guardado**: se crea una versión independiente del borrador.
5. Con la cuenta de TI entra a **Pantallas**, crea una y abre su enlace en otra pestaña.
6. Guarda otro borrador: la pantalla conserva lo publicado. Publica de nuevo: consulta cada 30 segundos y actualiza en la siguiente transición, dejando terminar el video actual.

Los videos empiezan silenciados para favorecer autoplay. **OK / Enter → Activar sonido** habilita el sonido y la música seleccionada. El navegador decide si permite reproducción y pantalla completa; no se recarga la página para actualizar.

Los cumpleaños se repiten por día y mes; el 29 de febrero se celebra cuando existe esa fecha. Se oculta el clima de ejemplo porque todavía no hay integración meteorológica. Spotify no está conectado.

## Versiones y acceso

- Los cambios guardados permanecen en borrador hasta publicar.
- El historial conserva contenido y referencias a los archivos originales.
- **Recuperar y publicar** crea una nueva versión desde una anterior sin cambiar el borrador. Mantiene sus fechas: los anuncios vencidos no reaparecen.
- Para reemplazar un archivo, sube uno nuevo y selecciónalo en el borrador. La eliminación definitiva de medios no está implementada, para conservar el historial.
- TI crea un enlace aleatorio por TV y puede renovarlo o deshabilitarlo. Es una credencial de visualización; no permite editar ni leer archivos nunca publicados en ese muro.
- Un guardado se rechaza si otro editor cambió el borrador desde que se abrió el formulario.

## Despliegue

El panel necesita Django y una base de datos compartida. Publicar solo `piloto/` **no publica el panel**. Sigue [la guía de despliegue](docs/panel-y-despliegue.md).

Para Azure, sigue [la preparación y despliegue a App Service](docs/azure.md). Incluye un script de carga del código, arranque automático, comprobación de PostgreSQL/archivos y códigos de incidencia para revisar errores. Requiere un recurso de destino y acceso a Azure; subir código a esta rama no despliega automáticamente.

La aplicación está alojada en el App Service existente `app-muro-telecable`. Cada nueva versión requiere desplegar el código; guardar un commit en GitHub no actualiza Azure automáticamente. El panel no modifica la política de suspensión de la Miray: sigue [la prueba física del piloto](docs/prueba-tv.md).

## Pruebas

```powershell
.\.venv\Scripts\python.exe manage.py test wall
.\.venv\Scripts\python.exe manage.py test muro
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
```

Con Node y Python disponibles (en Windows configura `$env:PYTHON = "python"` si ese ejecutable corresponde a Python 3):

```bash
python3 tests/validate.py
node tests/playback.cjs
node tests/tv-shell.cjs
node tests/managed-sync.cjs
```

Las pruebas cubren permisos, CSRF, cargas, borradores/publicaciones, recuperación, fechas, medios y HTTP Range. JavaScript usa DOM/medios simulados para comprobar transiciones, contador de contenidos y actualización. GitHub Actions ejecuta las comprobaciones con Python 3.11 y PostgreSQL 17; las pruebas locales también pueden usar SQLite. No sustituyen la inspección visual ni la prueba en TV.

## Estructura

- `muro/`: configuración Django y base de datos.
- `wall/`: modelos, migraciones, permisos, panel y API de pantallas.
- `piloto/`: reproductor compartido, diseño y recursos.
- `docs/`: puesta en marcha y pruebas en TV.
- `tests/`: pruebas JavaScript y recursos.

El piloto estático original sigue disponible con `python -m http.server 8001 --directory piloto`, con ajustes locales de demostración separados de las publicaciones centrales.

### Carrusel y compatibilidad

- El QR, si está habilitado, tiene su propia escena. Los cumpleaños se muestran únicamente en su fecha de Lima; el editor puede previsualizar cada tarjeta.
- Las fotos de proyectos, equipos y actividades se recortan para llenar su espacio. Las fotos o flyers de cumpleaños y los videos conservan su proporción completa.
- Un video que no carga se omite tras un aviso breve; si todos fallan, se evita un bucle inmediato de reintentos. Autoplay bloqueado presenta un botón de inicio.
- La migración 0004 añade el formato Equipo y un campo de funciones opcional. No cambia imágenes, proyectos, cumpleaños, usuarios ni publicaciones existentes.
- Pruebas de JS usan una simulación de DOM y medios; no sustituyen la revisión visual y de reproducción en cada TV.
