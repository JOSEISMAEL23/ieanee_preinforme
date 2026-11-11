import * as XLSX from 'xlsx'
import { desempenoDe, fraseObservacion } from './escala.js'

/**
 * ACES FINAL — lo que no es pantalla: el formato del consecutivo y el Excel
 * que descarga el admin cuando los docentes terminan.
 *
 * Ese Excel es la entrada con la que Claude genera, fuera de la app, las actas
 * en Word y la planilla de control (spec §7). El desempeño y la frase de
 * observaciones salen de escala.js: la misma fuente que ve el docente en
 * pantalla, para que el acta impresa diga lo mismo.
 *
 * ⚠️ El Excel lleva nombres de estudiantes (menores): se guarda en D:, nunca
 * en un repositorio.
 */

/** 2026, 1 → '2026 - 001' (como sale en el acta). */
export const consecutivoATexto = (anio, n) => `${anio} - ${String(n).padStart(3, '0')}`

export const ENCABEZADO = [
  'Acta', 'Consecutivo', 'Año', 'Docente', 'Grupo', 'Área', 'Estudiante',
  'Temáticas', 'Desempeño general', 'Actividades',
  'Nota', 'Desempeño', 'Observación', 'Última modificación',
]

const ANCHOS = [12, 11, 6, 30, 12, 24, 36, 40, 40, 40, 7, 10, 60, 32]

/** Una fila de Excel por acta, en orden de consecutivo. */
export function filasExcel(filas, anio) {
  return [...filas]
    .sort((a, b) => a.consecutivo - b.consecutivo)
    .map(f => [
      consecutivoATexto(anio, f.consecutivo),
      f.consecutivo,
      anio,
      f.docentes?.nombre ?? '',
      f.grupo,
      f.area,
      f.estudiante,
      f.tematicas ?? '',
      f.desempeno_general ?? '',
      f.actividades ?? '',
      f.nota, // número; sin nota = celda vacía
      desempenoDe(f.nota) ?? '',
      fraseObservacion(f.nota) ?? '',
      // Tal cual la base (ISO, con zona): el spec §7 compara esta columna con
      // la hora de exportación para saber si alguien cambió algo después.
      f.updated_at ?? '',
    ])
}

/**
 * Libro con dos hojas: "Actas" y "Exportacion" (cuándo se sacó y cuántas
 * actas trae, con y sin nota).
 */
export function libroAcesFinal(filas, anio, ahora = new Date()) {
  const actas = XLSX.utils.aoa_to_sheet([ENCABEZADO, ...filasExcel(filas, anio)])
  actas['!cols'] = ANCHOS.map(wch => ({ wch }))

  const conNota = filas.filter(f => f.nota !== null).length
  const exportacion = XLSX.utils.aoa_to_sheet([
    ['Exportado', ahora.toISOString()],
    ['Año', anio],
    ['Actas', filas.length],
    ['Con nota', conNota],
    ['Sin nota', filas.length - conNota],
  ])
  exportacion['!cols'] = [{ wch: 12 }, { wch: 28 }]

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, actas, 'Actas')
  XLSX.utils.book_append_sheet(libro, exportacion, 'Exportacion')
  return libro
}

/** 'ACES_final_2026_exportado_2026-11-19_1530.xlsx' (hora local). */
export function nombreArchivo(anio, ahora = new Date()) {
  const p = n => String(n).padStart(2, '0')
  const fecha = `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}`
  return `ACES_final_${anio}_exportado_${fecha}_${p(ahora.getHours())}${p(ahora.getMinutes())}.xlsx`
}
