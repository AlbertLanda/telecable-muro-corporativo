# Despliegue del muro en Azure App Service

Esta guía y el script preparan el despliegue a **un App Service existente y dedicado al muro**. No crean recursos, no despliegan por un push a GitHub y no usan la aplicación ni la base de SICV/TC Play. El despliegue solo se considera comprobado cuando responde `/health/ready/` y se valida la publicación en el navegador y la TV.

## Destino necesario

- Una suscripción y un grupo de recursos identificados.
- App Service **Linux, Python 3.11**, en un plan que admita Always On (Basic o superior). Puede usar un plan Linux existente con capacidad, pero requiere su propia aplicación.
- Una base PostgreSQL exclusiva del muro y un usuario propio. Si se reutiliza un servidor PostgreSQL existente, crear una base y usuario separados; no ejecutar estas migraciones contra otra aplicación.
- Conectividad desde App Service a PostgreSQL: integración de red y DNS si es privado, o reglas limitadas a las salidas autorizadas de la aplicación si es público. No abrir PostgreSQL a todo Internet.
- Etiqueta del App Service: `project=telecable-muro-corporativo`. El script verifica esta identificación antes de cambiar el recurso.
- Copias de seguridad de la base y de los medios. El directorio persistente permite conservar archivos al reiniciar/desplegar; no sustituye los respaldos.

El plan y la base pueden generar cargos en Azure; su región y capacidad se eligen en la suscripción de Telecable antes de crear recursos. Este repositorio no fija ni presume un presupuesto.

## Variables privadas del App Service

Configurar en **Environment variables / Variables de entorno** del recurso, sin copiarlas al repositorio:

| Variable | Valor |
| --- | --- |
| `DJANGO_SECRET_KEY` | Clave aleatoria privada de al menos 50 caracteres; conservarla al actualizar |
| `POSTGRES_HOST` | Host del servidor PostgreSQL accesible desde la aplicación |
| `POSTGRES_DB` | Base exclusiva del muro |
| `POSTGRES_USER` | Usuario de esa base |
| `POSTGRES_PASSWORD` | Contraseña privada |
| `POSTGRES_PORT` | `5432`, salvo puerto distinto |

El script configura HTTPS, `DEBUG=0`, PostgreSQL, el dominio devuelto por Azure, confianza en el proxy de App Service, compilación Oryx, arranque, Always On, comprobación de salud y logs. Usa TLS para PostgreSQL y conserva `verify-ca` o `verify-full` si ya estaban elegidos. No muestra las variables privadas en la salida.

Los medios se guardan en `/home/telecable-muro/media`, fuera del código reemplazado por cada publicación. Si ya hay `DJANGO_MEDIA_ROOT`, el script lo conserva: TI debe comprobar que apunte a un volumen persistente. No servir ese directorio directamente como archivos públicos. Para varias instancias, comprobar almacenamiento compartido y capacidad.

## Desplegar desde Windows

Para la primera base, TI puede ejecutar interactivamente `scripts/initialize_azure_database.py`
en Cloud Shell con `--subscription`, `--group`, `--app`, `--host` y `--admin`.
Requiere las dependencias de `requirements.txt`. Muestra el destino y solicita confirmación,
la clave administrativa actual y una clave nueva exclusiva del muro, sin mostrarlas.
Crea `telecable_muro` y `telecable_muro_app`, con permisos para migrar y usar sus propias tablas,
sin otorgar administración del servidor. Guarda las variables privadas en el App Service
identificado por la etiqueta del proyecto. No crea planes, servidores ni reglas de red.
Si ya existe la base, el rol o la configuración PostgreSQL, se detiene sin reemplazarlos.
Si hay una interrupción parcial, revisar el estado antes de repetir; no elimina recursos.

Con Azure CLI instalado, dentro del repositorio actualizado:

```powershell
az login
az account list --query "[].{Nombre:name,Id:id}" --output table

.\.venv\Scripts\python.exe scripts\deploy_azure.py `
  --subscription "ID_DE_LA_SUSCRIPCION" `
  --group "GRUPO_DEL_MURO" `
  --app "APP_SERVICE_DEL_MURO"
```

Los tres parámetros son obligatorios para seleccionar el recurso exacto. La sesión debe tener permisos para editar y desplegar ese App Service. El script usa esa suscripción explícitamente y no cambia la suscripción predeterminada de Azure CLI. Verifica la etiqueta y variables antes de realizar cambios. Si faltan recursos o configuración, detiene el despliegue e indica qué completar.

Se empaqueta solo la aplicación, sin `.env`, claves locales, bases SQLite, archivos subidos ni entornos virtuales. Azure instala `requirements.txt`. En el arranque se aplican migraciones bajo un bloqueo PostgreSQL, se prepara el grupo de Imagen, se recopilan los estáticos y se inicia Gunicorn. Reiniciar o volver a desplegar no crea usuarios ni cambia contraseñas.

Si la comprobación de salud falla, el script termina con error: no significa que el sitio esté listo aunque haya terminado la carga del código. Revisa el registro de despliegue y **Log stream** en Azure. Se puede consultar también:

```powershell
az webapp log tail --subscription "ID_DE_LA_SUSCRIPCION" --resource-group "GRUPO_DEL_MURO" --name "APP_SERVICE_DEL_MURO"
```

## Primera puesta en marcha

1. En la consola SSH del App Service, entra en la carpeta de la aplicación y activa el entorno Python usado por el servidor. Ejecuta `python manage.py createsuperuser` y `python manage.py create_editor jefeimagen`. Introduce las contraseñas interactivamente. Las cuentas locales de tu PC no se copian a Azure.
2. Abre el enlace HTTPS del panel, inicia sesión y verifica los permisos de Imagen.
3. Sube una imagen y un MP4, crea contenidos y publica una primera versión. TI genera el enlace de la pantalla.
4. Comprueba el video y HTTP Range. Reinicia el App Service y confirma que siguen disponibles usuarios, publicación y archivos.
5. Guarda un borrador sin publicar y comprueba que la pantalla conserva lo anterior. Publica durante un video: termina ese clip y actualiza.
6. En la TV real, valida reproducción durante al menos 90 minutos y luego durante una jornada. El hosting no cambia por sí mismo el protector de pantalla.

## Diagnóstico y actualizaciones

- `/health/live/` comprueba que Django responde; `/health/ready/` además consulta el muro en PostgreSQL y comprueba lectura/escritura temporal de medios. Devuelve 503 si falla, sin publicar detalles internos.
- Los errores 500 muestran un código de incidencia. Búscalo como `request_id` en Log stream para identificar el error. Los registros de peticiones contienen la ruta lógica, estado y duración, sin contraseñas, cookies, formularios ni enlaces de TV completos.
- El endpoint de salud es una comprobación técnica, no una prueba de que la TV reproduce correctamente ni de que los respaldos funcionan. Las alertas de Azure requieren configuración adicional.
- Actualizaciones: probar en la rama, respaldar base y medios, ejecutar el script contra el mismo destino y volver a validar publicación y archivos. Con una sola instancia puede haber una interrupción durante el despliegue.
- Para volver a un código anterior, desplegar su revisión compatible con el esquema actual. No deshacer migraciones o restaurar la base automáticamente: una recuperación de datos requiere revisar los cambios desde el respaldo.

Referencias: [Python en App Service](https://learn.microsoft.com/en-us/azure/app-service/configure-language-python), [ZIP con compilación](https://learn.microsoft.com/en-us/azure/app-service/deploy-zip), [Health check](https://learn.microsoft.com/en-us/azure/app-service/monitor-instances-health-check).
