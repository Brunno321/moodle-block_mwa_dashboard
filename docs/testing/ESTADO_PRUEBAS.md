# Estado de pruebas y continuidad del proyecto

## Referencia registrada

- Fecha: 13 de octubre de 2026, America/Mexico_City.
- Rama: `feature/dashboard-es-mx`.
- Revisión probada: `6c1b7b742e8b3648c8d1a1181f615c8729d09e7f`.
- Versión del código: release `4.4`, versión interna `2026092804`.
- Entorno utilizado: Node `24.13.0` en Windows; PHP CLI `8.2.33` en Debian/WSL.
- Alcance: dashboard Moodle UADY, español de México y zona America/Merida. IA fuera del alcance.

Esta referencia documenta las pruebas automatizadas ejecutadas durante el trabajo
en la rama. No certifica todos los recorridos de la interfaz ni la entrega real de
mensajes. No se dispone de un registro adicional de pruebas manuales realizadas
por el usuario que permita contabilizarlas como aprobadas.

## Resultado actual

| Suite o comprobación | Resultado | Código de salida |
|---|---|---:|
| Funcional JS, `test_functional.js` | 83 casos: 76 aprobados y 7 fallidos | 1 |
| Contratos PHP aislados, `test_php_contract.php` | 56 aprobados, 0 fallidos | 0 |
| Empaquetado AMD, `test_build_contract.js` | 2 bloqueos | 1 |
| Clasificación histórica y códigos, `test_classify.js` | Aprobada | 0 |
| Fechas, idioma y avisos, `test_locale.js` | Aprobada | 0 |
| Catálogos, `check_lang.js` | 1,733 claves por idioma; 0 errores de paridad/placeholders | 0 |
| Claves JS literales, `check_js_keys.js` | 1,181 usos; 0 errores | 0 |

**La suite funcional no está en verde.** Los siete casos fallidos se conservan
como regresiones reproducibles: no se omitieron pruebas ni se relajaron
aserciones para ocultarlos. No deben sumarse los dos bloqueos de build a los
83 casos funcionales; pertenecen a una comprobación diferente.

La paridad de idiomas es estructural, no una certificación lingüística: parte
del catálogo inicial `pt_br` conserva textos ingleses. Las claves calculadas
dinámicamente tampoco quedan cubiertas por el chequeo de claves literales.

### Evidencias versionadas

- [Resultado de los 83 casos, en JSON](functional-results-2026-10-13.json).
- [Comandos, códigos de salida y salidas literales](execution-2026-10-13.json).
- [Guía para ejecutar pruebas y matriz de validación integral](../../tools/TESTING.md).

Los archivos de esta referencia son históricos. En una ejecución futura guardar
resultados en otro archivo y registrar la revisión probada; no reemplazar esta
evidencia para aparentar que una revisión anterior pasó.

## Cobertura y significado de las pruebas

Se ejecutan las funciones reales de `amd/src`, con servicios AJAX y DOM
simulados, estudiantes ficticios y un reloj fijo. Las funciones internas se
exponen por instrumentación en memoria: no se modifica el código de producción.
El navegador se simula en UTC para detectar dependencias de la zona del equipo.

La cobertura incluye:

- Centro de acciones: calificación inferior a 60 %, máximo variable del curso,
  cero frente a ausencia de calificación, exclusión de aprobados, estudiantes sin
  acceso, selección masiva y deduplicación de destinatarios, objetivos pendientes.
- Mensajes: solicitudes para Moodle/correo/ambos, identificador de destinatario y
  curso, campos obligatorios, personalización, HTML escapado y fallos del servicio.
- Lista, perfil y calificaciones: presencia, cálculo de sesiones, notas durante
  la sesión, búsqueda sin acentos, progreso, protección CSV y calificaciones nulas.
- Actividades: tipos estables, entrega frente a visualización, ocultar y cambiar
  seguimiento mediante solicitudes simuladas, cancelación y errores.
- Alertas: ausencia de acceso, caída, inactividad temprana, acceso simbólico,
  madrugada, reactivación y el reconocimiento de finalización H5P.
- Intervenciones: historial y JSON inválido, notas aisladas por curso, plantillas,
  cancelación y solicitud de eliminación.
- Reporte: eventos posteriores del estudiante correcto, objetivos, agrupamiento
  de intervenciones, estados de seguimiento y registro histórico inválido.
- Fechas: cambio de día a medianoche en Mérida; escapado HTML en siete módulos.

No es cobertura de líneas ni cobertura integral de todas las funciones. Por
ejemplo, probar una solicitud AJAX de ocultar no demuestra su persistencia en la
base de datos, y probar el canal de correo no demuestra que un correo llegue.

PHP se prueba sin cargar Moodle: se sustituyen las funciones de configuración,
idioma y cadenas, y se comprueban helpers reales de API y compatibilidad. No se
prueban allí SQL, capacidades, autenticación, transacciones o entrega de mensajes.

## Regresiones pendientes de corregir

Las ubicaciones corresponden a la revisión registrada; pueden cambiar de línea.

| ID | Ubicación | Hallazgo reproducido | Prioridad | Corrección propuesta |
|---|---|---|---|---|
| F01 | `amd/src/interventions.js:460`, `doSend` | Dos invocaciones mientras el envío está pendiente generan dos solicitudes | Media | Guardia de envío en curso; evaluar idempotencia del servidor |
| F02 | `amd/src/activities.js:268`, `buildActMap` | Dos CMID distintos con igual nombre quedan en una sola actividad | Alta | Identidad por CMID; nombre solo para presentación y fallback legado |
| F03 | `amd/src/alerts.js:73`, `isSubmitEvent` | No reconoce `completion_updated` con la etiqueta española de H5P | Media | Preferir el código estable, conservando el reconocimiento histórico |
| F04 | `amd/src/alerts.js:327`, agrupamiento simbólico | Dos días de Mérida se cuentan como uno desde un navegador UTC | Media | Clave de calendario basada en la zona configurada, sin `toDateString()` local |
| F05 | `amd/src/teacherfeedback.js:207`, `sameTarget` | Nombres iguales hacen coincidir objetivos con CMID diferentes | Alta | Si ambos CMID existen, compararlos exclusivamente |
| F06 | `amd/src/teacherfeedback.js:248`, `trackedResources` | Un evento `deleted` puede completar un objetivo de acceso a recurso | Alta | Exigir acceso válido además de coincidencia del objetivo |
| F07 | `amd/src/teacherfeedback.js:169`, `isSubmission` | Finalización H5P depende del texto e ignora el código estable | Media | Compartir la clasificación estable de finalización |

F01 demuestra reentrada en la función pública, no dos entregas reales: el
navegador normalmente impide pulsar un botón deshabilitado. Falta comprobar la
protección del servidor. Los fixes aún no se han implementado ni desplegado.

Priorizar F02, F05 y F06 por su impacto en identidad de actividades y resultados
del seguimiento. Mantener las pruebas fallidas y añadir casos próximos al borde
de cada corrección; no eliminar compatibilidad con datos históricos.

## Código fuente, build y Moodle local

El código fuente y los archivos compilados todavía no están sincronizados:

1. Falta `amd/build/classify.min.js`.
2. El `dashboardstore.min.js` existente no implementa `tr`, `parseLogDate`,
   `dateParts`, `formatDate`, `formatTime`, `formatDateTime`, `formatNumber` ni
   `reasonCode` del código nuevo.

En la última inspección local no había `node_modules`, `vendor/bin/phpunit` ni
`phpunit.xml` en la raíz de Moodle. No se instalaron dependencias ni se creó una
base de datos PHPUnit. Reconfirmar ese entorno antes de continuar.

La ejecución documentada prueba el **fuente del repositorio**, no una sesión del
Moodle desplegado. El despliegue local fue parcial: catálogos, marca y estados;
la versión registrada en la última comprobación seguía siendo `2026092802`.
Los cambios posteriores de logo, release 4.4 y favicon quedaron en el repo.
La copia del favicon estaba pendiente de aprobación al registrar esta referencia.
No asumir que el Moodle local representa el estado completo de esta rama.

## Qué falta para validar integralmente

Usar la matriz de [TESTING.md](../../tools/TESTING.md): navegación, cursos y grupos,
permisos reales, envíos a cuentas ficticias y recepción efectiva, persistencia,
filtros/paginación, gráficas, exportación CSV/XLSX, impresión/PDF, accesibilidad y
consola del navegador. No hay resultados aprobados para esas verificaciones.

Primero preparar build y un entorno de pruebas aislado. Para cada nueva ejecución
registrar revisión del repo, versión desplegada, versiones de Node/PHP, zona del
navegador, fixtures utilizados, comando, salida y resultado. No usar estudiantes
reales ni publicar credenciales o datos personales en evidencias.

## Cómo continuar esta rama

1. Leer esta referencia y ejecutar los comandos de `tools/TESTING.md`.
2. Comprobar que los siete fallos se reproducen; una desaparición inesperada
   requiere revisar datos de prueba y cambios del entorno.
3. Corregir por cambio lógico, preservando claves JSON y compatibilidad histórica.
4. Ejecutar la regresión afectada y luego la suite completa; registrar los nuevos
   resultados por separado.
5. Compilar AMD con las herramientas de Moodle, sin editar `.min.js` a mano.
6. Preparar la lista exacta para un despliegue aprobado, respaldar y validar en
   Moodle con cuentas ficticias antes de certificar el plugin completo.

Mantener UTF-8 sin BOM y los saltos de línea existentes. No modificar la IA,
renombrar el componente o sus claves JSON, ni hacer push sin confirmación.
