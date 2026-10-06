# Telecable · Muro corporativo

Sistema de comunicación interna para televisores: eventos, cumpleaños, noticias y listas de videos con reproducción automática.

## Estado actual

Repositorio inicializado. El diseño del muro y la lista de videos tienen una maqueta validada en la conversación de trabajo; su incorporación al repositorio es el siguiente paso. Este repositorio todavía no contiene una aplicación ejecutable ni un despliegue.

## Primer objetivo: piloto en una TV

- Incorporar el diseño aprobado y un modo de pantalla sin controles de edición.
- Alojar los videos de ejemplo junto con el reproductor.
- Publicar un enlace de prueba y verificar reproducción completa, retorno al muro y repetición.
- Probar al menos 90 minutos sin interacción y después una jornada completa. La prevención del protector de pantalla debe comprobarse en la TV; no está garantizada por publicar la página.

## Stack previsto

Python 3.11, Django y PostgreSQL para la administración central. El alojamiento del piloto se definirá antes del despliegue; Azure es una opción.

## Trabajo en equipo

Usar ramas `feature/*` o `fix/*` para los cambios posteriores. Los archivos de entorno, medios cargados y bases de datos locales no se versionan. El repositorio contiene código y ejemplos; el contenido corporativo real se administrará por separado.
