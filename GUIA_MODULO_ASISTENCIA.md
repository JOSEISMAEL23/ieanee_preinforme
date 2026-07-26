# Guía del módulo de Asistencia ("Llamado a lista")

> Documento de referencia para segundo cerebro. Describe el módulo de asistencia
> del proyecto **Seguimiento Académico** (IE Andrés Escobar). Sin código, solo
> explicación funcional y estructural.

---

## 1. Qué es el módulo

Es el segundo módulo funcional de la aplicación (el primero es el de marcación de
bajo rendimiento académico / preinformes). Permite que un docente pase lista
**día por día**, por cada combinación de grupo + materia que tiene asignada, y
que luego se genere un informe consolidado de fallas y excusas por periodo.

Se le llama de dos formas en la interfaz:
- **"Llamado a lista"** — la pantalla de registro diario.
- **"Informe de asistencia" / "Informe de fallas"** — la pantalla de reporte.

Es un módulo **independiente** del de dificultades académicas: usa su propia
tabla, sus propias fechas de apertura/cierre y su propio flujo. Solo comparte
las tablas maestras del sistema.

---

## 2. Archivos y rutas

| Elemento | Ubicación / valor |
|---|---|
| Pantalla de registro diario | `src/pages/AsistenciaDashboard.jsx` |
| Pantalla de informe | `src/pages/AsistenciaInforme.jsx` |
| Ruta del registro | `/asistencia` |
| Ruta del informe | `/asistencia/informe` |
| Declaración de rutas | `src/App.jsx` |

Ambas rutas están protegidas por `ProtectedRoute` **sin exigir un rol
específico**. Esto significa que cualquier usuario autenticado (docente o
admin) puede entrar a ambas pantallas. El comportamiento interno sí cambia
según el rol, pero el acceso a la URL no está restringido por rol.

No hay componentes propios del módulo: reutiliza `Layout`, `Header`,
`AuthContext` (para saber quién es el docente) y `lib/supabase.js`.

---

## 3. Cómo se llega al módulo

- **Docente**: desde `DocenteDashboard` (`/docente`) hay un botón verde en la
  cabecera, con ícono de portapapeles, rotulado "Llamado a lista / Módulo de
  asistencia →". Lleva a `/asistencia`.
- **Admin**: desde el menú lateral de `/admin` existe un ítem llamado
  **"Asistencia"** que apunta directamente a `/asistencia/informe` (el admin
  entra por el informe, no por el registro diario).
- Desde `/asistencia` hay un botón "Ver informe de fallas" que lleva a
  `/asistencia/informe`.
- El botón "← Volver" del informe devuelve a `/admin` si el usuario es admin, o
  a `/asistencia` si es docente. El de la pantalla de registro usa historial del
  navegador (`navigate(-1)`).

---

## 4. Modelo de datos

### 4.1 Tabla propia: `asistencias`

El módulo **NO usa la tabla `marcas`** (esa es exclusiva del módulo de
dificultades académicas). Tiene su propia tabla `asistencias`, con estas
columnas usadas por el frontend:

| Columna | Rol |
|---|---|
| `periodo_id` | Periodo académico al que pertenece el registro |
| `asignacion_id` | Identifica grupo + materia + docente en una sola referencia |
| `estudiante_id` | Estudiante marcado |
| `fecha` | Día del llamado a lista, formato `YYYY-MM-DD` |
| `estado` | Texto: `'asiste'`, `'falta'` o `'excusa'` |
| `registrado_por` | Id del docente que hizo la marcación |
| `updated_at` | Marca de tiempo de la última modificación |

**Clave única compuesta:** (`periodo_id`, `asignacion_id`, `estudiante_id`,
`fecha`). Esa combinación es la que usa la operación de guardado tipo *upsert*
para decidir si crea o actualiza. Implica que un mismo estudiante puede tener un
registro por materia por día — la asistencia es **por materia**, no por jornada
escolar completa.

### 4.2 Diferencia estructural con el módulo de dificultades

La tabla `marcas` (dificultades) se organiza por **(periodo, estudiante,
materia)** — una sola fila por periodo, sin fecha, con un booleano.
La tabla `asistencias` se organiza por **(periodo, asignación, estudiante,
fecha)** — muchas filas por periodo, con fecha y con un estado de tres valores.

En resumen: `marcas` es un estado acumulado del periodo; `asistencias` es un
registro histórico día a día. **No comparten tabla, ni columnas, ni lógica de
guardado.**

### 4.3 Tablas compartidas con el resto del sistema

El módulo lee (nunca escribe) estas tablas maestras:

- `periodos` — para el selector de periodo y para las ventanas de tiempo.
- `asignaciones` — para saber qué grupos y materias dicta el docente.
- `estudiantes` — la lista de alumnos del grupo, ordenada por nombre.
- `grupos` y `grados` — para mostrar el nombre legible del curso (ej. "6° A").
- `materias` — para el nombre de la materia.
- `docentes` — en el informe de admin, para mostrar de qué docente es la materia.

### 4.4 Columnas añadidas a `periodos`

Para que las ventanas de tiempo sean independientes, la tabla `periodos` tiene
**dos pares de fechas**:

| Par | Controla |
|---|---|
| `fecha_inicio` / `fecha_limite` | Ventana del módulo de **dificultades** |
| `asistencia_fecha_inicio` / `asistencia_fecha_limite` | Ventana del módulo de **asistencia** |

Ambas son opcionales (pueden ser nulas). Se administran desde
`src/pages/admin/PeriodosAdmin.jsx`, que muestra dos bloques separados:
"🗓 Ventana — Dificultades" y "🗓 Ventana — Asistencia", tanto al crear un
periodo como al editarlo. La pantalla advierte explícitamente al admin que las
dos ventanas son independientes.

Ese desacople fue un cambio deliberado del proyecto (commit "independencia del
periodo de marcar la X ... y el periodo de la asistencia de estudiantes"): el
colegio necesitaba poder cerrar la marcación de preinformes sin cerrar el
llamado a lista, y viceversa.

---

## 5. Pantalla de registro diario (`/asistencia`)

### 5.1 Qué carga al abrir

1. Todos los periodos, ordenados del más reciente al más antiguo. Preselecciona
   el que tenga `activo = true`; si ninguno lo está, toma el primero de la lista.
2. Las asignaciones del docente autenticado, con el nombre del grado, la letra
   del grupo y el nombre de la materia.

Si el docente no tiene ninguna asignación, la pantalla muestra un mensaje
"Sin asignaciones — pídele al administrador que te asigne un grupo y materia" y
no renderiza nada más.

### 5.2 Controles de la cabecera

- **Selector de periodo** — lista todos los periodos, marcando cuál está activo.
- **Selector de fecha** — un campo de fecha, inicializado en el día de hoy.
- **Selector de grupo y materia** — solo aparece si el docente tiene más de una
  asignación; si tiene una sola, se usa esa directamente sin mostrar el selector.

Cada vez que cambia cualquiera de los tres (asignación, periodo o fecha), se
recargan la lista de estudiantes y los registros ya guardados de ese día.

### 5.3 Los tres estados

| Estado | Etiqueta | Color |
|---|---|---|
| `asiste` | Asiste | Verde esmeralda |
| `falta` | Falta | Rojo |
| `excusa` | Excusa | Ámbar |

Cada estudiante aparece en una fila con su nombre y tres botones. El botón del
estado activo se rellena de color; la fila completa se tiñe con un tono suave
del mismo color.

**Comportamiento de alternancia (toggle):** pulsar un estado ya activo lo
**desmarca**, y desmarcar **elimina físicamente la fila** de la base de datos —
no queda un registro con estado nulo. Es decir, "sin marcar" no es un estado
almacenado, es la ausencia de fila.

**Guardado inmediato:** no hay botón "Guardar". Cada clic dispara la escritura
al instante. La interfaz actualiza el estado de forma optimista (pinta el cambio
antes de confirmar) y, si la base de datos devuelve error, revierte visualmente
al estado anterior y muestra el mensaje de error en rojo al pie de la pantalla.
Mientras se guarda un estudiante, sus tres botones quedan deshabilitados.

### 5.4 Contadores en vivo

En la tarjeta de contexto se muestran cuatro contadores calculados en memoria a
partir de lo marcado: cuántos asisten, cuántos faltan, cuántas excusas y cuántos
quedan **sin marcar** (total de estudiantes menos registros existentes). El
contador de "sin marcar" solo aparece si es mayor que cero.

### 5.5 Control de la ventana de tiempo

Antes de permitir cualquier marcación, la pantalla evalúa tres condiciones sobre
el periodo seleccionado:

1. El periodo debe tener `activo = true`.
2. La hora actual no puede ser anterior a `asistencia_fecha_inicio` (si está
   definida).
3. La hora actual no puede ser posterior a `asistencia_fecha_limite` (si está
   definida).

Si alguna falla, se muestra un aviso ámbar en la parte superior con el mensaje
concreto ("La ventana de asistencia abre el ...", "La ventana de asistencia
cerró el ...", o "El periodo no está activo"), **todos los botones de estado
quedan deshabilitados** y aparece un tooltip con el mismo motivo. La consulta de
registros anteriores sí sigue funcionando: el aviso dice explícitamente "solo
puedes consultar registros anteriores".

Nota importante: esta validación es del **frontend**. La protección real y
definitiva depende de las políticas RLS definidas en Supabase para la tabla
`asistencias`, que viven en el dashboard de Supabase y no en este repositorio.

---

## 6. Pantalla de informe (`/asistencia/informe`)

### 6.1 Comportamiento según rol

El informe es la única parte del módulo que se comporta distinto para admin y
docente. El rol se lee del objeto `docente` del contexto de autenticación.

**Como docente:**
- Filtros disponibles: periodo + una de sus propias asignaciones.
- La lista de materias muestra "Grado Letra — Materia".
- Solo puede ver los grupos y materias que tiene asignados.

**Como admin:**
- Filtros disponibles: periodo + grado + letra de grupo (botones A / B / C) +
  materia.
- Al elegir grado y letra se busca el grupo correspondiente y se cargan todas
  las asignaciones de ese grupo, sin importar el docente.
- La lista de materias muestra "Materia — Nombre del docente", y ese nombre
  también aparece junto al título del informe generado.

Las letras de grupo están fijas en el código como A, B y C.

### 6.2 Cómo se construye el informe

1. Se toman todos los estudiantes del grupo, ordenados por nombre.
2. Se consultan todos los registros de `asistencias` de ese periodo y esa
   asignación cuyo estado sea `falta` o `excusa` — **los `asiste` se ignoran por
   completo**, el informe es de ausencias, no de presencias.
3. Se agrupan las fechas por estudiante en dos listas separadas: fechas de
   fallas y fechas de excusas.
4. Se **excluyen** los estudiantes que no tienen ninguna falla ni excusa.
5. Se ordena de mayor a menor cantidad de fallas.

La cabecera del resultado indica "N de M estudiantes con fallas o excusas".
Si nadie tiene registros, muestra un mensaje vacío explícito.

### 6.3 Visualización

Cada estudiante aparece con su nombre, una insignia roja con el total de fallas,
una insignia ámbar con el total de excusas (solo si tiene), y debajo el detalle
de **todas las fechas individuales** como pequeñas etiquetas, en formato
`DD/MM/AAAA`. Las fechas de fallas van en rojo y las de excusas en ámbar.

### 6.4 Exportación a Excel

Botón "Exportar Excel". Usa la librería `xlsx` (la misma que ya usan los módulos
de importación de materias y estudiantes). Genera un archivo con cinco columnas:

`Estudiante | Total Fallas | Fechas de Fallas | Total Excusas | Fechas de Excusas`

Las fechas van concatenadas en una sola celda separadas por comas. El nombre de
la hoja es "Grado Letra Materia" (recortado a 31 caracteres, límite de Excel) y
el archivo se llama `Asistencia_<hoja>_<periodo>.xlsx`.

No hay exportación consolidada de varias materias o varios grupos a la vez: se
exporta un informe a la vez, el que esté generado en pantalla.

---

## 7. Relación con el resto de la aplicación

- **No toca los boletines ni el consolidado.** `ConsolidadoAdmin` y
  `BoletinesImprimir` siguen leyendo únicamente la tabla `marcas`. La asistencia
  no aparece en los preinformes impresos.
- **No modifica ninguna tabla maestra.** Solo escribe en `asistencias`.
- **Depende de que existan asignaciones.** Si el admin no ha asignado
  grupo+materia a un docente, el módulo es inutilizable para él.
- **Depende de que exista un periodo activo** con su ventana de asistencia
  abierta para poder escribir.

---

## 8. Detalles a tener en cuenta / limitaciones conocidas

Son observaciones del estado actual del código, útiles para futuras mejoras:

1. **La fecha por defecto se calcula en UTC.** El valor inicial del campo de
   fecha se obtiene convirtiendo la hora actual a ISO y cortando la parte de
   fecha, lo que es hora UTC. Como Colombia está en UTC−5, a partir de las 7:00
   p.m. hora local la pantalla abre por defecto con **la fecha del día
   siguiente**. El docente puede corregirlo manualmente, pero es una fuente
   silenciosa de registros en el día equivocado.

2. **Desmarcar borra el histórico.** No hay bitácora de cambios ni forma de
   saber que un estado existió y fue retirado.

3. **No hay acción masiva.** Para un grupo de 40 estudiantes hay que pulsar 40
   veces; no existe un "marcar todos como asisten" y luego corregir excepciones,
   que es el flujo natural de un llamado a lista real.

4. **El acceso por URL no distingue rol.** Un admin puede entrar a `/asistencia`
   y ver la pantalla de registro; como consulta sus propias asignaciones y un
   admin normalmente no tiene, verá el mensaje "Sin asignaciones".

5. **En la vista de admin del informe, la cabecera del resultado intenta mostrar
   grado y letra tomándolos del objeto de asignación**, pero la consulta que usa
   el admin no trae esos datos anidados, así que ese fragmento del título puede
   quedar vacío. La materia y el nombre del docente sí se muestran bien.

6. **Las letras de grupo están fijas en A, B y C.** Si el colegio abriera un
   grupo D, habría que tocar el código del informe.

7. **No hay indicador de días ya registrados.** Para saber si se pasó lista un
   día determinado hay que seleccionar esa fecha y ver si aparecen marcas; no
   existe un calendario con los días cubiertos.

---

## 9. Resumen de una línea

El módulo de asistencia es un registro diario de tres estados (asiste / falta /
excusa) por estudiante, materia y fecha, guardado en su propia tabla
`asistencias`, con ventana de tiempo controlada por dos columnas exclusivas de
`periodos`, e informe agregado de ausencias exportable a Excel — totalmente
independiente del módulo de dificultades académicas salvo por las tablas
maestras que ambos consultan.
