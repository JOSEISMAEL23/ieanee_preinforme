# Seguimiento Académico — reglas del repositorio

App de seguimiento estudiantil (React + Vite + Supabase + Vercel). **Está en producción en un
colegio real, con datos de menores de edad.** No es un proyecto de práctica: un error aquí lo ve
un docente o un padre de familia.

---

## Comandos

| | |
|---|---|
| `npm run dev` | Servidor local |
| `npm run build` | Compila (Vite) |
| `npm run lint` | oxlint |

## ⚠️ Cómo se prueba

**Abriendo el preview de la rama en Vercel.** `npm run dev -- --mode test` **ya no existe**
(se retiró el 2026-08-05).

- **Preview** (cualquier rama) → base de **staging**
- **Production** (`main`) → base de **producción**

Antes del 2026-08-05 los previews escribían sobre la base real del colegio. Si alguna vez ves un
preview conectado a producción, **eso es el bug**, no una comodidad.

---

## 🔑 Al terminar cualquier cambio

**No crees ramas ni commits por tu cuenta a mitad del trabajo, pero al terminar haz siempre esto:**

```text
- rama nueva desde main actualizado (feature-... o fix-...)
- commit con mensaje que explique el PORQUE, no solo el que
- push
- dame el link del PR
- dame el TITULO y el CUERPO del PR listos para copiar y pegar, dentro
  de un bloque de codigo markdown. Estructura del cuerpo:
    1. Que problema resuelve y como se detecto
    2. ## Cambios  -> por archivo, con el porque de cada uno y el
       sintoma que se veria sin ese cambio
    3. ## Alcance  -> si toca src/ o no
  Sin acentos, para que no se rompan al pegar.
```

**El PR lo abre y lo mergea José Ismael. NO mergees y NO toques `main`.**

> **Por qué el cuerpo estructurado:** el PR es el único sitio donde queda escrito *por qué* se hizo
> un cambio. En seis meses `git log` dirá **qué** cambió; solo el PR dice **por qué**.

**Y verifica antes de decir que terminaste:** `git status` debe decir *working tree clean*. Si hay
archivos en rojo, no subió. Ya pasó **tres veces** que el trabajo parecía aplicado y no lo estaba.
**Crear un PR no es mergearlo:** son dos botones distintos.

---

## ⚠️ El SQL viaja aparte — Git no protege ni un dato

El SQL **no** sube con `commit`: se pega a mano en el SQL Editor de Supabase, y le pega al proyecto
que esté abierto. Orden obligatorio para cualquier cambio con migración:

```
1. SQL en STAGING  →  2. rama + probar contra staging
3. SQL en PRODUCCIÓN  →  4. mergear el PR
```

**El 3 va antes que el 4, nunca al revés.** Si el código llega antes que la columna, la app queda
caída con docentes dentro.

Las migraciones de esquema se hacen con **expand/contract** (tres fases retrocompatibles, ninguna
deja la app caída). Una operación irreversible **no se corre la víspera de un uso real con gente
delante**.

---

## Cosas que no se deducen leyendo el código

- **La anon key es pública y las policies son `FOR ALL`** (incluyen `DELETE`). Cualquiera puede
  llamar `.delete()` desde la consola del navegador. **Que la UI no muestre el botón no protege
  nada: la protección tiene que vivir en Postgres.**
- **`sql/00-esquema-completo.sql` NO es un dump: es un dump MÁS correcciones a mano.** `pg_dump`
  las borra en silencio y devuelve el archivo a una versión ya sabida rota. **Lee su cabecera antes
  de tocarlo.** Banderas: `--schema=public --no-owner --schema-only`. **`--no-privileges` NO** —
  sin los 118 `GRANT` el colegio nuevo instala y recibe `permission denied` en cada pantalla.
  *(El kit se ha fugado 8 veces por 3 raíces distintas. Al tocarlo: ¿necesita filas para arrancar? ·
  ¿tiene ediciones a mano? · diff contra la última versión buena.)*
- **`index.html` va con `<html lang="es">`.** Si vuelve a `en`, el navegador traduce los apellidos
  de los estudiantes ("Saucedo" → "Salsa").
- **Dos borrados en `CASCADE` sin protección**, y son los más destructivos:
  `EstudiantesAdmin.jsx:366` → *"Borrar todos los estudiantes"* (`.delete().gt('id', 0)`, se lleva
  notas, marcas, asistencias e incapacidades de todo el colegio) y `DocentesAdmin.jsx:182-185` →
  quitar una asignación, un `.delete()` pelado **sin confirmar y sin revisar el error**, del que
  cuelgan `notas`, `asistencias` y `subparametros`.
- **`datos-prueba/` es infraestructura de verificación, no basura.** 234 filas con 18 trampas.
  Línea base tras P2: **224 importados / 10 omitidas**. ⚠️ Su `LEEME.md` todavía dice `221 / 13`,
  que es el número de **antes** de P2 — está pendiente de corregir.

---

## Verificar: una comprobación en verde puede mentir

Cinco veces en tres días una comprobación salió en verde sin distinguir *"funciona"* de *"roto en
silencio"*. **Provoca el caso que debería fallar**, no solo el que debería pasar:

- Un **vacío nunca es una respuesta**: no distingue "no hay datos" de "la consulta está rota".
  Provoca el lleno, y comprueba además que lo que *no* debería salir, no sale.
- El `CREATE TABLE` de un dump **no es la tabla**: los `UNIQUE` y `FOREIGN KEY` viven en
  `ALTER TABLE` cientos de líneas más abajo. Antes de migrar:
  `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.LA_TABLA'::regclass;`
- Prueba el **caso mixto**: con todo nuevo funciona y con todo repetido también *parece* funcionar.
  Se rompe con algunas de cada.

---

## Dónde está el resto *(no los leas salvo que haga falta)*

| Archivo | Para qué |
|---|---|
| `ESTRUCTURA.md` | Mapa de `src/`, archivo por archivo |
| `GUIA_TECNICA.md` | Modelo de datos, RLS y detalle técnico |
| `INSTALACION.md` | Montar la app en una institución nueva |
| `GUIA_MODULO_ASISTENCIA.md` | Detalle del módulo de asistencia |
| `../../segundo-cerebro/ESTADO.md` | Estado del negocio y qué sigue |

**Escribe en español.**
