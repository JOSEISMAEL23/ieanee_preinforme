/**
 * Escala de desempeño — SIEE 2026, art. 9.
 *
 *   Superior  95,00 – 100,00
 *   Alto      85,00 –  94,99
 *   Básico    70,00 –  84,99
 *   Bajo       0,00 –  69,99
 *
 * La usan la pantalla de ACES final y el generador de actas (fuera de la app),
 * para que el desempeño que ve el docente sea el mismo que sale impreso.
 *
 * ⚠️ El 70 también vive en configuracion.nota_minima: si el colegio cambia el
 * SIEE, se cambian los dos.
 */
const ESCALA = [
  { desde: 95, nombre: 'SUPERIOR' },
  { desde: 85, nombre: 'ALTO' },
  { desde: 70, nombre: 'BÁSICO' },
  { desde: 0, nombre: 'BAJO' },
]

/** 'SUPERIOR' | 'ALTO' | 'BÁSICO' | 'BAJO', o null si no hay nota válida. */
export function desempenoDe(nota) {
  if (typeof nota !== 'number' || Number.isNaN(nota) || nota < 0 || nota > 100) return null
  return ESCALA.find(e => nota >= e.desde).nombre
}

/**
 * Lee una nota escrita a mano. Acepta coma o punto decimal ("84,5"), de 0 a
 * 100 y con máximo dos decimales (lo mismo que deja guardar el CHECK y el
 * numeric(5,2) de aces_final).
 *   ''     → null  (sin calificar)
 *   '84,5' → 84.5
 *   inválida → NaN
 */
export function leerNota(texto) {
  const t = String(texto ?? '').trim()
  if (t === '') return null
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(t)) return NaN
  const n = Number(t.replace(',', '.'))
  return n <= 100 ? n : NaN
}

/** 84.5 → '84,5' · 70 → '70' · null → '' (como se escribe en Colombia). */
export function notaATexto(nota) {
  return nota === null || nota === undefined ? '' : String(nota).replace('.', ',')
}

/** La frase de OBSERVACIONES del acta (spec D12), tal cual sale impresa. */
export function fraseObservacion(nota) {
  const desempeno = desempenoDe(nota)
  if (!desempeno) return null
  return `El estudiante obtuvo una valoración de ${notaATexto(nota)} y un desempeño ${desempeno}.`
}
