# Importar clasificación sénior desde una captura

## Objetivo
Permitir que, después de cargar los resultados de una jornada, el administrador aporte una o varias capturas de la clasificación sénior. Los jugadores de esas capturas se marcarán como sénior cruzando nombre o licencia con los resultados ya cargados; no se calculará la edad.

## Cambios
- Ampliar el selector de clasificación sénior para aceptar JPG, PNG y WEBP, además de Excel y PDF.
- Enviar cada imagen al lector seguro del servidor con su tipo real de archivo.
- Extraer únicamente todos los nombres y números de licencia visibles.
- Mantener la acumulación de varios archivos o días y el cruce existente por licencia, con el nombre como respaldo.
- Actualizar los textos del administrador para dejar claro que también admite fotos o capturas.
- Mantener sin cambios la importación principal de resultados, rankings y reglas de puntuación.

## Comprobación
- Probar el lector con la captura de ejemplo de Golf Costa Brava.
- Confirmar que devuelve los 33 jugadores sénior visibles y sus licencias.
- Verificar que la pantalla acepta imágenes y muestra el total de coincidencias sin errores.
