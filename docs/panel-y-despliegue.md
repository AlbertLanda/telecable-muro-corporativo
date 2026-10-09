# Panel central y despliegue

## Flujo

Imagen carga archivos persistentes y edita un borrador. Publicar guarda una instantánea dentro de una transacción y cambia la versión activa. Cada TV consulta cada 30 segundos; aplica los cambios en una transición o al terminar el video actual, sin recargar la página.

Las fechas de inicio/retiro y los cumpleaños se resuelven al consultar el manifiesto en hora de Lima. No hace falta un proceso de tareas programadas. Puede haber una demora de hasta el intervalo de consulta más lo que falte para la transición. Recuperar una publicación crea una nueva versión con el contenido anterior, conserva el borrador y respeta las fechas originales.

El editor permite cambiar contenido, orden, duración y módulos disponibles dentro del diseño aprobado. No es un editor libre de posiciones tipo Canva.

## Cumpleaños con foto y dedicatoria

1. En Biblioteca, cargar una fotografía individual como Imagen. Es opcional; sin foto se muestran las iniciales. La foto se encaja completa en su marco, sin recortarla.
2. En Cumpleaños → Añadir cumpleaños, guardar nombre, área, día, mes y, si se desea, foto y dedicatoria de hasta 180 caracteres. No se registra edad, año de nacimiento ni teléfono.
3. En la lista de cumpleaños, usar **Ver tarjeta**. La vista muestra solo esa celebración, incluso si la fecha está en el futuro o el registro está desactivado. No cambia la fecha, el borrador ni las pantallas.
4. Publicar el borrador para incorporarlo al muro. Cada año se muestra la tarjeta en su día según la hora de Lima. Si coinciden varias personas, cada una tiene su turno de 16 segundos. Los próximos cumpleaños siguen en el listado lateral durante el resto del muro.

Durante la celebración se amplía la tarjeta y se ocultan temporalmente los módulos laterales e inferiores. Se conserva el encabezado con la hora y el pie del muro. La tarjeta incluye nombre, área, foto, dedicatoria y los efectos de celebración automáticos existentes, respetando la preferencia de movimiento reducido. Si la foto falla al cargar, aparecen las iniciales y la reproducción continúa.

Las fotos usan el mismo acceso protegido que el resto de Biblioteca y se incluyen en la publicación. Guardar cambios no altera una publicación anterior. Las publicaciones creadas antes de esta mejora continúan funcionando con iniciales y la dedicatoria predeterminada. Las tarjetas de WhatsApp se pueden conservar como material gráfico en Biblioteca; esta mejora no envía mensajes ni se conecta a los grupos.

El despliegue debe ejecutar la migración `0002_birthday_photo_greeting` y actualizar los recursos estáticos mediante el procedimiento habitual. La migración agrega campos opcionales y conserva los cumpleaños existentes. Después de desplegar, recargar una vez los navegadores de las TV para cargar el nuevo reproductor.

## PostgreSQL

Crea una base dedicada y un usuario con permisos. Configura `DJANGO_USE_SQLITE=0`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST` y `POSTGRES_PORT` en `.env` o en las variables privadas del servicio.

Usa `POSTGRES_SSLMODE=require` para una conexión remota que requiera TLS; para verificar el certificado, configura `verify-full` y la CA conforme al proveedor. Para PostgreSQL local sin TLS, `prefer`. Ejecuta `python manage.py migrate` y `python manage.py setup_wall` contra esa base. La base SQLite y los usuarios locales no se copian automáticamente al despliegue.

## Producción

- `DJANGO_DEBUG=0`: exige PostgreSQL y una clave propia.
- `DJANGO_SECRET_KEY`: clave aleatoria privada; puedes generarla con `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`.
- `DJANGO_ALLOWED_HOSTS`: dominios exactos del servicio, separados por comas.
- `DJANGO_CSRF_TRUSTED_ORIGINS`: origen HTTPS del panel, por ejemplo `https://muro.tudominio.pe`.
- `DJANGO_MEDIA_ROOT`: directorio de un volumen persistente con escritura para la aplicación. No usar almacenamiento efímero del despliegue.
- `DJANGO_TRUST_PROXY=1`: solo detrás de un proxy propio que sobrescriba de forma confiable `X-Forwarded-Proto`.
- La conexión y contraseña PostgreSQL indicadas arriba.

La aplicación redirige a HTTPS en producción y usa cookies seguras. Configura el proxy para evitar un bucle de redirecciones. En Linux:

```bash
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py setup_wall
python manage.py collectstatic --noinput
python manage.py createsuperuser
gunicorn muro.wsgi:application --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 120
```

WhiteNoise sirve los recursos estáticos. Las cargas se entregan por vistas autorizadas con HTTP Range para los videos: **no publiques `MEDIA_ROOT` como una carpeta pública**. Respalda PostgreSQL junto con los archivos; las versiones históricas necesitan sus archivos originales. Varias instancias requieren un almacenamiento de medios compartido. El backend actual usa FileSystemStorage; Azure Blob requerirá una integración posterior si se elige esa arquitectura.

El límite de carga es 15 MB para imágenes, 250 MB para MP4 y 50 MB para MP3/WAV. Configura el tamaño y tiempo de carga del proxy. Pillow verifica imágenes y rechaza SVG/HTML. Se valida el contenedor MP4, pero no se transcodifica ni se certifica su códec: preparar H.264 con audio AAC y comprobarlo en la TV.

## Cuentas y pantallas

| Cuenta | Acceso |
| --- | --- |
| TI, superusuario | Panel, usuarios, publicaciones y enlaces de pantallas |
| Editores de Imagen | Biblioteca, contenido, cumpleaños, vista previa, publicación y recuperación |
| Pantalla con enlace | Contenido publicado y sus archivos; sin acceso al panel |

`create_editor` pide la contraseña interactivamente y no modifica usuarios existentes. TI administra cuentas desde `/admin/`. Los cambios usan POST y CSRF. El enlace aleatorio de cada TV es una credencial de visualización: se puede renovar o deshabilitar. Un enlace no da acceso a archivos que nunca se publicaron en su muro.

## Validación en destino

1. Entrar como editor y comprobar que no puede administrar usuarios ni pantallas.
2. Subir una imagen y un video, crear contenido, guardar y abrir la vista previa.
3. Abrir una pantalla en otra pestaña. Antes de publicar espera la primera publicación.
4. Publicar y esperar hasta 30 segundos más una transición.
5. Guardar otro título sin publicar: la TV debe conservar el anterior.
6. Publicar durante un video: debe terminar ese clip antes de cambiar.
7. Recuperar una versión anterior: se conserva el borrador actual y reaparece su contenido vigente.
8. Programar inicio y retiro próximos, publicar y comprobar ambos cambios.
9. Renovar un enlace: la pantalla anterior debe detenerse al consultar de nuevo. Abrir el enlace nuevo.
10. Ejecutar `python manage.py test wall` contra PostgreSQL de pruebas, con permisos de creación de la base de test; no usar una base de producción.

Las pérdidas de conexión conservan en memoria la versión recibida. No hay modo offline completo: los archivos no cargados requieren conexión. No se configura el arranque del navegador de la TV ni se garantiza que desaparezca su protector. Sigue siendo necesaria la prueba física de 90 minutos y de una jornada.

Referencias: [Django 5.2 y Python 3.11](https://docs.djangoproject.com/en/5.2/faq/install/), [transacciones](https://docs.djangoproject.com/en/5.2/topics/db/transactions/) y [cargas de archivos](https://docs.djangoproject.com/en/5.2/topics/http/file-uploads/).
