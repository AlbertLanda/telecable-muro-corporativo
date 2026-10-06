# Telecable · Muro corporativo

Piloto del muro aprobado: escenas corporativas, cumpleaños y eventos de ejemplo, reloj de Lima, animaciones, música instrumental de demostración y una lista automática de videos.

## Ejecutar en Windows

Desde la carpeta del repositorio, con Python 3.11 instalado:

```powershell
py -3.11 -m http.server 8000 --bind 127.0.0.1 --directory piloto
```

Abre **http://localhost:8000/** en el navegador. No requiere instalar paquetes. Para detener el servidor, pulsa `Ctrl+C`.

- **Abrir modo TV:** oculta los ajustes y adapta el muro a la pantalla en formato 16:9.
- **Probar ahora:** reproduce los dos videos completos y regresa al muro.
- **Prueba rápida · 30 s:** reduce a 30 segundos el tiempo de muro entre turnos. Por defecto son 15 minutos.
- En modo TV, **OK / Enter** muestra las opciones y **Esc** vuelve a los ajustes. También puedes hacer clic sobre el muro para mostrar las opciones. Las teclas que el navegador o la TV intercepten pueden funcionar de otra manera.
- **Activar música:** inicia la demo instrumental con una interacción del usuario.

En Linux/macOS usa `python3` en lugar de `py -3.11`.

## URLs del piloto

| Ruta | Uso |
| --- | --- |
| `/` | Vista previa y ajustes de esta sesión |
| `/?tv=1` | Modo TV automático, videos cada 15 minutos de muro |
| `/?tv=1&prueba=1` | Modo TV con turnos cada 30 segundos para verificar el ciclo |

Los parámetros no guardan una configuración central: al recargar se reinicia la lista de ejemplo. `tv=1` inicia el diseño para pantalla sin pedir pantalla completa nativa automáticamente al abrir; esa solicitud puede requerir una pulsación con el control.

## Qué incluye y qué falta

Incluye dos clips MP4 originales sin audio, de seis segundos cada uno. Las imágenes y videos incluidos se sirven desde `piloto/assets/`, por lo que también estarán disponibles en la TV al publicar esa carpeta.

Los archivos añadidos con **Añadir videos** o **Añadir mis canciones**, el orden de la lista y los cambios de contenido solo duran en ese navegador hasta recargar. **No se suben ni se sincronizan con otras pantallas.** Los nombres, cumpleaños, eventos y clima son ejemplos; el reloj sí usa la fecha y hora actuales de Lima. Spotify no está conectado.

El bloqueo de suspensión se solicita solo si el navegador ofrece Screen Wake Lock y permite usarlo. La pantalla completa nativa de video se intenta cuando corresponde, con alternativa dentro de la página si el navegador lo rechaza. **Ninguna de esas solicitudes confirma que el protector de la TV esté desactivado.** Ver el [protocolo de prueba](docs/prueba-tv.md).

Este piloto estático todavía no está publicado desde este repositorio. La fase siguiente contempla administración central con **Django, Python 3.11 y PostgreSQL**. Azure es una opción de alojamiento; no se necesita para ejecutar esta prueba local.

## Estructura

- `piloto/index.html`: contenido y controles del piloto.
- `piloto/wall.css`, `piloto/wall.js`: diseño y reproducción del muro.
- `piloto/tv.css`, `piloto/tv.js`: adaptación a pantalla, controles y solicitudes de pantalla activa.
- `piloto/assets/`: logo, foto ilustrativa, QR y videos de ejemplo.
- `docs/prueba-tv.md`: publicación y validación en equipo real.
- `tests/`: comprobaciones de archivos y comportamiento con DOM/medios simulados.

## Verificación para desarrollo

```bash
python3 tests/validate.py
node --check piloto/wall.js
node --check piloto/tv.js
node tests/playback.cjs
node tests/tv-shell.cjs
```

Node se usa únicamente para estas comprobaciones. En Windows, si `python3` no está disponible, ejecuta `py -3.11 tests/validate.py` y establece `$env:PYTHON = "python"` para la prueba de reproducción cuando `python` corresponda a tu instalación de Python 3.

Las pruebas con DOM y medios simulados validan la lógica; no sustituyen la inspección visual en navegador ni la decodificación en una TV. Usar ramas `feature/*` o `fix/*` para cambios posteriores.
