/**
 * Formato único para mostrar un periodo en pantalla.
 *
 * Desde que `periodos` tiene año, "Primer Periodo" puede existir en varios
 * años a la vez, así que el nombre solo ya no identifica nada. Todo selector,
 * cabecera de boletín y nombre de Excel pasa por aquí para que el año se vea
 * igual en toda la app.
 *
 * El `anio` se muestra solo si existe: así la pantalla no queda con un
 * "(undefined)" colgando si el frontend llegara a cargarse contra una base
 * donde todavía no corrió la migración.
 */
export function etiquetaPeriodo(periodo) {
  if (!periodo) return ''
  return periodo.anio ? `${periodo.nombre} (${periodo.anio})` : periodo.nombre
}

/** Igual que etiquetaPeriodo pero marcando cuál está activo. Para los <option>. */
export function etiquetaPeriodoConEstado(periodo) {
  if (!periodo) return ''
  return `${etiquetaPeriodo(periodo)}${periodo.activo ? ' (activo)' : ''}`
}

/**
 * Año con el que se prellena el formulario de creación. Sale del reloj del
 * navegador (los usuarios están en Colombia), que es lo mismo que calcula el
 * default de la columna en la base salvo en el cambio de año. Es solo un
 * valor sugerido: el admin puede corregirlo antes de guardar.
 */
export function anioActual() {
  return new Date().getFullYear()
}
