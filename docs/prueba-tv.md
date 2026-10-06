# Piloto en televisores

## Publicar el piloto

El contenido publicable es **la carpeta `piloto/` completa**, manteniendo las rutas relativas. Puede servirse con un alojamiento estático HTTPS. No hacen falta Django ni PostgreSQL para esta fase. Todavía no se ha configurado alojamiento ni un dominio desde este repositorio.

El enlace de visualización será la URL asignada por el alojamiento seguida de `/?tv=1`. Para probar rápidamente, añade `&prueba=1`. Usar datos de demostración en el piloto público. El meta `noindex` es una indicación para buscadores, no un control de acceso; el muro definitivo necesitará el acceso adecuado al contenido interno.

El alojamiento debe servir `.mp4` como `video/mp4` y admitir solicitudes HTTP Range de los reproductores. Evitar redirecciones de login o páginas HTML en las URLs de video. Los dos clips incluidos son H.264 baseline, 640×360, 24 fps, `yuv420p`, con metadatos al inicio del archivo y sin audio. Los videos propios se validarán en el modelo real; la extensión `.mp4` por sí sola no confirma compatibilidad.

## Prueba opcional en la misma red

Para una comprobación temporal desde una PC y TV en la misma red:

```powershell
py -3.11 -m http.server 8000 --bind 0.0.0.0 --directory piloto
ipconfig
```

En la TV abre `http://IP-DE-LA-PC:8000/?tv=1&prueba=1`, sustituyendo la IP por la IPv4 de la conexión que comparte red con la TV. Si Windows solicita acceso, permítelo únicamente para la red privada donde se realizará la prueba. Esta comprobación exige que la PC siga encendida; el alojamiento HTTPS es el camino para usar la TV sin esa PC.

El servidor integrado de Python es para pruebas. No proporciona un despliegue de producción y puede no cubrir las solicitudes Range de algunos reproductores. Una dirección HTTP de la red local normalmente no permite Screen Wake Lock; registrar esa limitación sin interpretarla como un fallo del muro.

## Protocolo en la Miray con webOS 22

1. Abrir el enlace de prueba rápida, verificar que el muro se ajusta sin recortar y esperar 30 segundos. Los dos clips deben terminar completos y volver al muro. Hacerlo durante tres turnos.
2. Comprobar el sonido con **OK / Enter → Activar música**. Revisar que el navegador no haya bloqueado la reproducción. Los clips de ejemplo son silenciosos.
3. Probar **OK / Enter → Probar videos en pantalla completa** para comprobar si el navegador concede pantalla completa nativa al reproductor. Que el video llene la página no demuestra que el sistema lo reconozca como pantalla completa nativa.
4. Abrir de nuevo el enlace con `?tv=1`, sin `prueba=1`. Verificar que se usan los 15 minutos predeterminados. Iniciar cualquier interacción necesaria para audio/pantalla completa y luego **no tocar el control durante al menos 90 minutos**.
5. Registrar si aparece el reloj o protector, cuánto tiempo pasó desde la última interacción, si había muro o video en ese momento, si volvió al muro, y si hubo errores de formato o carga.
6. Si pasa, extender a una jornada completa. Probar después una interrupción breve de red, recarga y apagado/encendido. Registrar si hace falta volver a abrir el navegador; este piloto no configura el arranque de la TV.

| Comprobación | Resultado esperado | Resultado real |
| --- | --- | --- |
| Muro y videos | Alternan sin cortar clips | Pendiente |
| Sonido | Se oye tras la interacción permitida | Pendiente |
| Pantalla completa nativa | Registrar si se concede | Pendiente |
| 90 min sin tocar el control | No aparece reloj/protector | Pendiente |
| Jornada completa | Reproducción estable | Pendiente |
| Red y reinicio | Registrar recuperación y acciones manuales | Pendiente |

Si aparece el protector, el piloto no cumple todavía el requisito de reproducción continua. Cambiar de alojamiento o de dominio por sí solo no modifica la política del televisor; habrá que evaluar su reproductor, una aplicación compatible o un dispositivo externo según el resultado.

## Referencias y límites

- [Motor web de webOS](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine): webOS TV 22 usa Chromium 87 como referencia de plataforma; el comportamiento real se comprueba en el equipo. Se han retirado `light-dark()`, unidades `cqw` y consultas de contenedor de este piloto.
- [Protector de pantalla de webOS](https://webostv.developer.lge.com/develop/guides/screensaver): documenta una excepción durante video a pantalla completa en el contexto de aplicaciones webOS. No valida automáticamente el navegador de la Miray.
- [Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API): depende de soporte, contexto seguro y visibilidad; el sistema puede liberarlo o rechazarlo.
- [requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen): puede requerir activación del usuario y ser rechazado.

El logo proviene de los archivos proporcionados por Telecable. La foto del equipo es una imagen ilustrativa generada, señalizada como tal. El QR lleva a `https://telecable.pe/`. Los dos clips y la demo instrumental se crearon para la demostración.
