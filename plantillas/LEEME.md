# Plantillas de importación

Archivos `.xlsx` de ejemplo para enviarle al colegio cuando se monta una instancia nueva.
**No contienen datos reales de ningún estudiante ni docente.**

Los nombres de columna de abajo son los que el código realmente lee. Respetarlos evita horas de
limpieza manual del archivo que devuelva el colegio.

| Plantilla | Hoja | Columnas requeridas | Alternativas aceptadas | Lo lee |
|---|---|---|---|---|
| `estudiantes.xlsx` | Estudiantes | `Grupo`, `Nombre` | `grupo`, `nombre`, `Estudiante` | `src/pages/admin/EstudiantesAdmin.jsx` |
| `materias.xlsx` | Materias | `Grado`, `Materia` | `grado`, `materia` | `src/pages/admin/MateriasAdmin.jsx` |
| `docentes.xlsx` | Docentes | `Nombre`, `Email`, `Password`, `Grupo`, `Materia` | `nombre`, `correo`, `contraseña`, `grupo`, `materia` | `src/pages/admin/DocentesAdmin.jsx` |

## Notas importantes

- **El nombre de la hoja no importa**, se lee la primera. Las **columnas sí** importan.
- **Docentes: una fila por asignación.** Un docente que dicta 5 grupos va en 5 filas repitiendo
  su `Nombre` y `Email`; el importador las agrupa por nombre y crea una sola cuenta con sus 5
  `asignaciones`.
- **Grados en palabras o en símbolo**: el importador normaliza `"Séptimo"`, `"Once"`,
  `"Undécimo"` a `"7°"`, `"11°"`. Ambas formas funcionan.
- **`Password` es solo la contraseña inicial.** El sistema marca `debe_cambiar_password = true`,
  así que el docente está obligado a cambiarla en su primer ingreso.
- Los docentes sin correo institucional pueden llevar uno sintético
  `nombre.apellido@colegio.interno`. Es solo para iniciar sesión, no recibe correo real.

## Antes de importar

1. Cargar **materias** y verificar los grados.
2. Cargar **estudiantes** y contar una muestra contra el Excel original.
3. Cargar **docentes** (crea cuentas de Auth reales — revisa el archivo antes).

Proceso completo de puesta en marcha:
`segundo-cerebro/OUTPUTS/checklist-nueva-instancia-2026-07-29.md`.
