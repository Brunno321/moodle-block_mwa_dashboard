# Pruebas funcionales del dashboard

Las pruebas ejecutan el código de `amd/src` con datos sintéticos, reloj fijo y
servicios AJAX simulados. No acceden a Moodle, no envían mensajes y no modifican
la base de datos. El entorno expone funciones internas mediante instrumentación
en memoria; no cambia los archivos de producción. El DOM simulado no valida el
renderizado visual, la interacción completa del navegador ni la accesibilidad.

Desde la raíz del plugin:

```text
node tools/test_functional.js
node tools/test_build_contract.js
node tools/test_classify.js
node tools/test_locale.js
node tools/check_lang.js
node tools/check_js_keys.js
```

Para conservar los resultados JSON, el primer comando admite una ruta de salida.
Un resultado funcional fallido devuelve código de salida 1: no se omiten las
regresiones conocidas para aparentar que todo funciona.

Pruebas PHP aisladas, sin cargar `config.php` de Moodle:

```text
wsl -d Debian -u root -- php "/mnt/d/Elementos importantes/optimizacion/mwa-analytics-dashboard-optimized/tools/test_php_contract.php"
```

Estas pruebas PHP sustituyen únicamente `get_config`, `current_language`,
`get_string` y `core_text`; comprueban helpers reales de API y compatibilidad.
No validan permisos, SQL, entrega de mensajes, correo ni transacciones Moodle.

## Validación integral pendiente

Requiere un Moodle de pruebas con estudiantes ficticios, mensajería controlada,
AMD compilado y PHPUnit con una base de datos independiente:

1. Navegación entre vistas, selector de curso y grupos; permisos de docente,
   administrador y usuario sin acceso.
2. Centro de acciones: seleccionar destinatarios, abrir envío individual y masivo,
   elegir objetivos, revisar el resumen y enviar únicamente a cuentas ficticias.
3. Mensajería: Moodle/correo/ambos, fallos parciales en un lote, reintentos,
   historial guardado y recepción efectiva en los destinos de prueba.
4. Lista, perfil y calificaciones: filtros, búsqueda, paginación, detalles y
   exportaciones CSV/XLSX abiertas en una aplicación de hojas de cálculo.
5. Actividades: ocultar/restaurar, activar/desactivar seguimiento y verificar
   persistencia y exclusión coherente en las otras vistas.
6. Alertas, retención y mapa de calor: selección desde gráficas, filtros de fechas
   y agrupamiento idéntico desde navegadores con zonas diferentes.
7. Intervenciones y reporte docente: eliminación autorizada, notas, objetivos,
   progreso posterior, impresión/PDF y persistencia tras recargar.
8. Revisar consola del navegador y registros PHP durante esos recorridos.

No implementar ni probar servicios de IA: quedan fuera del alcance.
