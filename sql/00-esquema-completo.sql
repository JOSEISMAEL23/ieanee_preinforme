--
-- PostgreSQL database dump
--

-- ATENCION: ESTE ARCHIVO ES UN DUMP EDITADO A MANO. NO PEGUES UN DUMP CRUDO ENCIMA.
-- Si lo regeneras con pg_dump, vuelve a quitar estas cuatro cosas o el kit no instala:
--   1. los dos metacomandos de psql, restrict y unrestrict (empiezan por barra
--      invertida) -> el SQL Editor de Supabase no los entiende
--   2. CREATE SCHEMA public             -> en Supabase ya existe
--   3. COMMENT ON SCHEMA public         -> no eres dueno del schema
--   4. las 24 ALTER DEFAULT PRIVILEGES  -> permission denied
-- Banderas correctas: --schema=public --no-owner --schema-only
-- NO uses --no-privileges: los 118 GRANT son necesarios.
-- Historia: commit fe3ee83 y el 2026-08-13, cuando se repitieron las cuatro.


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
--



--
--



--
-- Name: current_docente_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_docente_id() RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from docentes where user_id = auth.uid() and activo = true;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from docentes
    where user_id = auth.uid() and rol = 'admin' and activo = true
  );
$$;


--
-- Name: marcar_password_cambiada(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_password_cambiada() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update docentes set debe_cambiar_password = false where user_id = auth.uid();
end;
$$;


--
-- Name: proteger_nota_minima(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proteger_nota_minima() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  if new.nota_minima is distinct from old.nota_minima
     and not (is_admin() or tiene_permiso('configurar_calificaciones')) then
    raise exception 'No tiene permiso para modificar la nota mínima';
  end if;
  return new;
end;
$$;


--
-- Name: tiene_modulo(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tiene_modulo(p_modulo text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select is_admin() or coalesce(
    (select activo from public.docente_modulos
      where docente_id = current_docente_id() and modulo = p_modulo),
    false
  );
$$;


--
-- Name: tiene_permiso(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tiene_permiso(p_permiso text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select is_admin() or coalesce(
    (select activo from public.permisos_usuario
      where docente_id = current_docente_id() and permiso = p_permiso),
    false
  );
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: asignaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asignaciones (
    id integer NOT NULL,
    docente_id uuid NOT NULL,
    grupo_id integer NOT NULL,
    materia_id integer NOT NULL
);


--
-- Name: asignaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asignaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asignaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asignaciones_id_seq OWNED BY public.asignaciones.id;


--
-- Name: asistencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asistencias (
    id integer NOT NULL,
    periodo_id integer NOT NULL,
    asignacion_id integer NOT NULL,
    estudiante_id integer NOT NULL,
    fecha date NOT NULL,
    estado text NOT NULL,
    registrado_por uuid,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT asistencias_estado_check CHECK ((estado = ANY (ARRAY['asiste'::text, 'falta'::text, 'excusa'::text])))
);


--
-- Name: asistencias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asistencias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asistencias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asistencias_id_seq OWNED BY public.asistencias.id;


--
-- Name: configuracion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion (
    id integer DEFAULT 1 NOT NULL,
    nombre_institucion text DEFAULT 'Mi Institución Educativa'::text NOT NULL,
    logo_url text,
    updated_at timestamp with time zone DEFAULT now(),
    eslogan text,
    nota_minima numeric(5,2) DEFAULT 70,
    CONSTRAINT solo_una_fila CHECK ((id = 1))
);


--
-- Name: docente_modulos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.docente_modulos (
    id bigint NOT NULL,
    docente_id uuid NOT NULL,
    modulo text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: docente_modulos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.docente_modulos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.docente_modulos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: docentes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.docentes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    nombre text NOT NULL,
    email text NOT NULL,
    rol text DEFAULT 'docente'::text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    debe_cambiar_password boolean DEFAULT false NOT NULL,
    cargo text,
    CONSTRAINT docentes_rol_check CHECK ((rol = ANY (ARRAY['admin'::text, 'docente'::text])))
);


--
-- Name: estudiantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estudiantes (
    id integer NOT NULL,
    grupo_id integer NOT NULL,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: estudiantes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.estudiantes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: estudiantes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.estudiantes_id_seq OWNED BY public.estudiantes.id;


--
-- Name: grados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grados (
    id integer NOT NULL,
    nombre text NOT NULL,
    orden integer NOT NULL,
    nivel text NOT NULL,
    CONSTRAINT grados_nivel_check CHECK ((nivel = ANY (ARRAY['primaria'::text, 'bachillerato'::text])))
);


--
-- Name: grados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grados_id_seq OWNED BY public.grados.id;


--
-- Name: grupos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grupos (
    id integer NOT NULL,
    grado_id integer NOT NULL,
    nombre text NOT NULL,
    orden integer NOT NULL
);


--
-- Name: grupos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grupos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grupos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grupos_id_seq OWNED BY public.grupos.id;


--
-- Name: incapacidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incapacidades (
    id bigint NOT NULL,
    estudiante_id bigint NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    motivo text,
    registrado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT incapacidades_check CHECK ((fecha_fin >= fecha_inicio))
);


--
-- Name: incapacidades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.incapacidades ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.incapacidades_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: marcas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marcas (
    id integer NOT NULL,
    periodo_id integer NOT NULL,
    estudiante_id integer NOT NULL,
    materia_id integer NOT NULL,
    dificultad boolean DEFAULT false NOT NULL,
    actualizado_por uuid,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: marcas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.marcas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: marcas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.marcas_id_seq OWNED BY public.marcas.id;


--
-- Name: materias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materias (
    id integer NOT NULL,
    grado_id integer NOT NULL,
    nombre text NOT NULL,
    orden integer DEFAULT 0 NOT NULL
);


--
-- Name: materias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.materias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: materias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.materias_id_seq OWNED BY public.materias.id;


--
-- Name: notas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notas (
    id bigint NOT NULL,
    periodo_id integer NOT NULL,
    asignacion_id integer NOT NULL,
    estudiante_id integer NOT NULL,
    subparametro_id bigint NOT NULL,
    valor numeric(5,2) NOT NULL,
    descripcion text,
    registrado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notas_valor_check CHECK (((valor >= (30)::numeric) AND (valor <= (100)::numeric)))
);


--
-- Name: notas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.notas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.notas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: parametros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametros (
    id bigint NOT NULL,
    nombre text NOT NULL,
    porcentaje numeric(5,2) NOT NULL,
    orden integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT parametros_porcentaje_check CHECK (((porcentaje >= (0)::numeric) AND (porcentaje <= (100)::numeric)))
);


--
-- Name: parametros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.parametros ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.parametros_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: periodos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.periodos (
    id integer NOT NULL,
    nombre text NOT NULL,
    activo boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    fecha_inicio timestamp with time zone,
    fecha_limite timestamp with time zone,
    asistencia_fecha_inicio timestamp with time zone,
    asistencia_fecha_limite timestamp with time zone,
    calificacion_fecha_inicio timestamp with time zone,
    calificacion_fecha_limite timestamp with time zone,
    anio integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Bogota'::text)))::integer NOT NULL
);


--
-- Name: periodos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.periodos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: periodos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.periodos_id_seq OWNED BY public.periodos.id;


--
-- Name: permisos_usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permisos_usuario (
    id bigint NOT NULL,
    docente_id uuid NOT NULL,
    permiso text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: permisos_usuario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.permisos_usuario ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.permisos_usuario_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subparametro_plantilla; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subparametro_plantilla (
    id bigint NOT NULL,
    parametro_id bigint NOT NULL,
    orden integer NOT NULL,
    peso numeric(5,2) NOT NULL,
    CONSTRAINT subparametro_plantilla_peso_check CHECK (((peso >= (0)::numeric) AND (peso <= (100)::numeric)))
);


--
-- Name: subparametro_plantilla_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subparametro_plantilla ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subparametro_plantilla_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subparametros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subparametros (
    id bigint NOT NULL,
    asignacion_id integer NOT NULL,
    parametro_id bigint NOT NULL,
    nombre text NOT NULL,
    peso numeric(5,2) NOT NULL,
    orden integer NOT NULL,
    CONSTRAINT subparametros_peso_check CHECK (((peso >= (0)::numeric) AND (peso <= (100)::numeric)))
);


--
-- Name: subparametros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subparametros ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subparametros_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: asignaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones ALTER COLUMN id SET DEFAULT nextval('public.asignaciones_id_seq'::regclass);


--
-- Name: asistencias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias ALTER COLUMN id SET DEFAULT nextval('public.asistencias_id_seq'::regclass);


--
-- Name: estudiantes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estudiantes ALTER COLUMN id SET DEFAULT nextval('public.estudiantes_id_seq'::regclass);


--
-- Name: grados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grados ALTER COLUMN id SET DEFAULT nextval('public.grados_id_seq'::regclass);


--
-- Name: grupos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupos ALTER COLUMN id SET DEFAULT nextval('public.grupos_id_seq'::regclass);


--
-- Name: marcas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcas ALTER COLUMN id SET DEFAULT nextval('public.marcas_id_seq'::regclass);


--
-- Name: materias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materias ALTER COLUMN id SET DEFAULT nextval('public.materias_id_seq'::regclass);


--
-- Name: periodos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos ALTER COLUMN id SET DEFAULT nextval('public.periodos_id_seq'::regclass);


--
-- Name: asignaciones asignaciones_docente_id_grupo_id_materia_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones
    ADD CONSTRAINT asignaciones_docente_id_grupo_id_materia_id_key UNIQUE (docente_id, grupo_id, materia_id);


--
-- Name: asignaciones asignaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones
    ADD CONSTRAINT asignaciones_pkey PRIMARY KEY (id);


--
-- Name: asistencias asistencias_periodo_id_asignacion_id_estudiante_id_fecha_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias
    ADD CONSTRAINT asistencias_periodo_id_asignacion_id_estudiante_id_fecha_key UNIQUE (periodo_id, asignacion_id, estudiante_id, fecha);


--
-- Name: asistencias asistencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias
    ADD CONSTRAINT asistencias_pkey PRIMARY KEY (id);


--
-- Name: configuracion configuracion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT configuracion_pkey PRIMARY KEY (id);


--
-- Name: docente_modulos docente_modulos_docente_id_modulo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.docente_modulos
    ADD CONSTRAINT docente_modulos_docente_id_modulo_key UNIQUE (docente_id, modulo);


--
-- Name: docente_modulos docente_modulos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.docente_modulos
    ADD CONSTRAINT docente_modulos_pkey PRIMARY KEY (id);


--
-- Name: docentes docentes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.docentes
    ADD CONSTRAINT docentes_pkey PRIMARY KEY (id);


--
-- Name: docentes docentes_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.docentes
    ADD CONSTRAINT docentes_user_id_key UNIQUE (user_id);


--
-- Name: estudiantes estudiantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estudiantes
    ADD CONSTRAINT estudiantes_pkey PRIMARY KEY (id);


--
-- Name: grados grados_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grados
    ADD CONSTRAINT grados_nombre_key UNIQUE (nombre);


--
-- Name: grados grados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grados
    ADD CONSTRAINT grados_pkey PRIMARY KEY (id);


--
-- Name: grupos grupos_grado_id_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupos
    ADD CONSTRAINT grupos_grado_id_nombre_key UNIQUE (grado_id, nombre);


--
-- Name: grupos grupos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupos
    ADD CONSTRAINT grupos_pkey PRIMARY KEY (id);


--
-- Name: incapacidades incapacidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incapacidades
    ADD CONSTRAINT incapacidades_pkey PRIMARY KEY (id);


--
-- Name: marcas marcas_periodo_id_estudiante_id_materia_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcas
    ADD CONSTRAINT marcas_periodo_id_estudiante_id_materia_id_key UNIQUE (periodo_id, estudiante_id, materia_id);


--
-- Name: marcas marcas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcas
    ADD CONSTRAINT marcas_pkey PRIMARY KEY (id);


--
-- Name: materias materias_grado_id_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materias
    ADD CONSTRAINT materias_grado_id_nombre_key UNIQUE (grado_id, nombre);


--
-- Name: materias materias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materias
    ADD CONSTRAINT materias_pkey PRIMARY KEY (id);


--
-- Name: notas notas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas
    ADD CONSTRAINT notas_pkey PRIMARY KEY (id);


--
-- Name: parametros parametros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros
    ADD CONSTRAINT parametros_pkey PRIMARY KEY (id);


--
-- Name: periodos periodos_nombre_anio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos
    ADD CONSTRAINT periodos_nombre_anio_key UNIQUE (nombre, anio);


--
-- Name: periodos periodos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos
    ADD CONSTRAINT periodos_pkey PRIMARY KEY (id);


--
-- Name: permisos_usuario permisos_usuario_docente_id_permiso_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_usuario
    ADD CONSTRAINT permisos_usuario_docente_id_permiso_key UNIQUE (docente_id, permiso);


--
-- Name: permisos_usuario permisos_usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_usuario
    ADD CONSTRAINT permisos_usuario_pkey PRIMARY KEY (id);


--
-- Name: subparametro_plantilla subparametro_plantilla_parametro_id_orden_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subparametro_plantilla
    ADD CONSTRAINT subparametro_plantilla_parametro_id_orden_key UNIQUE (parametro_id, orden);


--
-- Name: subparametro_plantilla subparametro_plantilla_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subparametro_plantilla
    ADD CONSTRAINT subparametro_plantilla_pkey PRIMARY KEY (id);


--
-- Name: subparametros subparametros_asignacion_id_parametro_id_orden_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subparametros
    ADD CONSTRAINT subparametros_asignacion_id_parametro_id_orden_key UNIQUE (asignacion_id, parametro_id, orden);


--
-- Name: subparametros subparametros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subparametros
    ADD CONSTRAINT subparametros_pkey PRIMARY KEY (id);


--
-- Name: idx_asistencias_asignacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asistencias_asignacion ON public.asistencias USING btree (asignacion_id);


--
-- Name: idx_asistencias_estudiante; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asistencias_estudiante ON public.asistencias USING btree (estudiante_id);


--
-- Name: idx_asistencias_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asistencias_fecha ON public.asistencias USING btree (fecha);


--
-- Name: idx_asistencias_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asistencias_periodo ON public.asistencias USING btree (periodo_id);


--
-- Name: idx_incapacidades_estudiante; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incapacidades_estudiante ON public.incapacidades USING btree (estudiante_id);


--
-- Name: idx_incapacidades_rango; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incapacidades_rango ON public.incapacidades USING btree (fecha_inicio, fecha_fin);


--
-- Name: idx_notas_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notas_lookup ON public.notas USING btree (periodo_id, asignacion_id, estudiante_id);


--
-- Name: idx_notas_subparametro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notas_subparametro ON public.notas USING btree (subparametro_id);


--
-- Name: idx_subparametros_asignacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subparametros_asignacion ON public.subparametros USING btree (asignacion_id);


--
-- Name: configuracion trg_proteger_nota_minima; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_proteger_nota_minima BEFORE UPDATE ON public.configuracion FOR EACH ROW EXECUTE FUNCTION public.proteger_nota_minima();


--
-- Name: asignaciones asignaciones_docente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones
    ADD CONSTRAINT asignaciones_docente_id_fkey FOREIGN KEY (docente_id) REFERENCES public.docentes(id) ON DELETE CASCADE;


--
-- Name: asignaciones asignaciones_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones
    ADD CONSTRAINT asignaciones_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id) ON DELETE RESTRICT;


--
-- Name: asignaciones asignaciones_materia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones
    ADD CONSTRAINT asignaciones_materia_id_fkey FOREIGN KEY (materia_id) REFERENCES public.materias(id) ON DELETE RESTRICT;


--
-- Name: asistencias asistencias_asignacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias
    ADD CONSTRAINT asistencias_asignacion_id_fkey FOREIGN KEY (asignacion_id) REFERENCES public.asignaciones(id) ON DELETE CASCADE;


--
-- Name: asistencias asistencias_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias
    ADD CONSTRAINT asistencias_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(id) ON DELETE CASCADE;


--
-- Name: asistencias asistencias_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias
    ADD CONSTRAINT asistencias_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.periodos(id) ON DELETE RESTRICT;


--
-- Name: asistencias asistencias_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias
    ADD CONSTRAINT asistencias_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.docentes(id) ON DELETE SET NULL;


--
-- Name: docente_modulos docente_modulos_docente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.docente_modulos
    ADD CONSTRAINT docente_modulos_docente_id_fkey FOREIGN KEY (docente_id) REFERENCES public.docentes(id) ON DELETE CASCADE;


--
-- Name: docentes docentes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.docentes
    ADD CONSTRAINT docentes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: estudiantes estudiantes_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estudiantes
    ADD CONSTRAINT estudiantes_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos(id) ON DELETE RESTRICT;


--
-- Name: grupos grupos_grado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupos
    ADD CONSTRAINT grupos_grado_id_fkey FOREIGN KEY (grado_id) REFERENCES public.grados(id) ON DELETE RESTRICT;


--
-- Name: incapacidades incapacidades_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incapacidades
    ADD CONSTRAINT incapacidades_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(id) ON DELETE CASCADE;


--
-- Name: incapacidades incapacidades_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incapacidades
    ADD CONSTRAINT incapacidades_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.docentes(id);


--
-- Name: marcas marcas_actualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcas
    ADD CONSTRAINT marcas_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES public.docentes(id);


--
-- Name: marcas marcas_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcas
    ADD CONSTRAINT marcas_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(id) ON DELETE CASCADE;


--
-- Name: marcas marcas_materia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcas
    ADD CONSTRAINT marcas_materia_id_fkey FOREIGN KEY (materia_id) REFERENCES public.materias(id) ON DELETE RESTRICT;


--
-- Name: marcas marcas_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcas
    ADD CONSTRAINT marcas_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.periodos(id) ON DELETE RESTRICT;


--
-- Name: materias materias_grado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materias
    ADD CONSTRAINT materias_grado_id_fkey FOREIGN KEY (grado_id) REFERENCES public.grados(id) ON DELETE RESTRICT;


--
-- Name: notas notas_asignacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas
    ADD CONSTRAINT notas_asignacion_id_fkey FOREIGN KEY (asignacion_id) REFERENCES public.asignaciones(id) ON DELETE CASCADE;


--
-- Name: notas notas_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas
    ADD CONSTRAINT notas_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(id) ON DELETE CASCADE;


--
-- Name: notas notas_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas
    ADD CONSTRAINT notas_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.periodos(id) ON DELETE RESTRICT;


--
-- Name: notas notas_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas
    ADD CONSTRAINT notas_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.docentes(id);


--
-- Name: notas notas_subparametro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas
    ADD CONSTRAINT notas_subparametro_id_fkey FOREIGN KEY (subparametro_id) REFERENCES public.subparametros(id) ON DELETE CASCADE;


--
-- Name: permisos_usuario permisos_usuario_docente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_usuario
    ADD CONSTRAINT permisos_usuario_docente_id_fkey FOREIGN KEY (docente_id) REFERENCES public.docentes(id) ON DELETE CASCADE;


--
-- Name: subparametro_plantilla subparametro_plantilla_parametro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subparametro_plantilla
    ADD CONSTRAINT subparametro_plantilla_parametro_id_fkey FOREIGN KEY (parametro_id) REFERENCES public.parametros(id) ON DELETE CASCADE;


--
-- Name: subparametros subparametros_asignacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subparametros
    ADD CONSTRAINT subparametros_asignacion_id_fkey FOREIGN KEY (asignacion_id) REFERENCES public.asignaciones(id) ON DELETE CASCADE;


--
-- Name: subparametros subparametros_parametro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subparametros
    ADD CONSTRAINT subparametros_parametro_id_fkey FOREIGN KEY (parametro_id) REFERENCES public.parametros(id) ON DELETE CASCADE;


--
-- Name: docente_modulos admin docente_modulos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin docente_modulos" ON public.docente_modulos TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: incapacidades admin gestiona incapacidades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin gestiona incapacidades" ON public.incapacidades TO authenticated USING ((public.is_admin() OR public.tiene_permiso('gestionar_incapacidades'::text))) WITH CHECK ((public.is_admin() OR public.tiene_permiso('gestionar_incapacidades'::text)));


--
-- Name: parametros admin parametros; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin parametros" ON public.parametros TO authenticated USING ((public.is_admin() OR public.tiene_permiso('configurar_calificaciones'::text))) WITH CHECK ((public.is_admin() OR public.tiene_permiso('configurar_calificaciones'::text)));


--
-- Name: permisos_usuario admin permisos_usuario; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin permisos_usuario" ON public.permisos_usuario TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: subparametro_plantilla admin plantilla; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin plantilla" ON public.subparametro_plantilla TO authenticated USING ((public.is_admin() OR public.tiene_permiso('configurar_calificaciones'::text))) WITH CHECK ((public.is_admin() OR public.tiene_permiso('configurar_calificaciones'::text)));


--
-- Name: asignaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asignaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: asignaciones asignaciones_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asignaciones_admin_write ON public.asignaciones USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: asignaciones asignaciones_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asignaciones_select ON public.asignaciones FOR SELECT USING (((docente_id = public.current_docente_id()) OR public.is_admin()));


--
-- Name: asistencias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asistencias ENABLE ROW LEVEL SECURITY;

--
-- Name: asistencias asistencias_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asistencias_admin_all ON public.asistencias USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: asistencias asistencias_docente_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asistencias_docente_insert ON public.asistencias FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.asignaciones a
  WHERE ((a.id = asistencias.asignacion_id) AND (a.docente_id = public.current_docente_id())))) AND (EXISTS ( SELECT 1
   FROM public.periodos p
  WHERE ((p.id = asistencias.periodo_id) AND (p.activo = true) AND ((p.asistencia_fecha_inicio IS NULL) OR (now() >= p.asistencia_fecha_inicio)) AND ((p.asistencia_fecha_limite IS NULL) OR (now() <= p.asistencia_fecha_limite)))))));


--
-- Name: asistencias asistencias_docente_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asistencias_docente_select ON public.asistencias FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.asignaciones a
  WHERE ((a.id = asistencias.asignacion_id) AND (a.docente_id = public.current_docente_id())))));


--
-- Name: asistencias asistencias_docente_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asistencias_docente_update ON public.asistencias FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.asignaciones a
  WHERE ((a.id = asistencias.asignacion_id) AND (a.docente_id = public.current_docente_id())))) AND (EXISTS ( SELECT 1
   FROM public.periodos p
  WHERE ((p.id = asistencias.periodo_id) AND (p.activo = true) AND ((p.asistencia_fecha_inicio IS NULL) OR (now() >= p.asistencia_fecha_inicio)) AND ((p.asistencia_fecha_limite IS NULL) OR (now() <= p.asistencia_fecha_limite))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.asignaciones a
  WHERE ((a.id = asistencias.asignacion_id) AND (a.docente_id = public.current_docente_id())))) AND (EXISTS ( SELECT 1
   FROM public.periodos p
  WHERE ((p.id = asistencias.periodo_id) AND (p.activo = true) AND ((p.asistencia_fecha_inicio IS NULL) OR (now() >= p.asistencia_fecha_inicio)) AND ((p.asistencia_fecha_limite IS NULL) OR (now() <= p.asistencia_fecha_limite)))))));


--
-- Name: configuracion; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;

--
-- Name: configuracion configuracion_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY configuracion_admin_write ON public.configuracion FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: configuracion configuracion_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY configuracion_select ON public.configuracion FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: configuracion delegado escribe configuracion; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delegado escribe configuracion" ON public.configuracion TO authenticated USING ((public.is_admin() OR public.tiene_permiso('configurar_institucion'::text) OR public.tiene_permiso('configurar_calificaciones'::text))) WITH CHECK ((public.is_admin() OR public.tiene_permiso('configurar_institucion'::text) OR public.tiene_permiso('configurar_calificaciones'::text)));


--
-- Name: periodos delegado escribe periodos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delegado escribe periodos" ON public.periodos TO authenticated USING ((public.is_admin() OR public.tiene_permiso('gestionar_periodos'::text))) WITH CHECK ((public.is_admin() OR public.tiene_permiso('gestionar_periodos'::text)));


--
-- Name: notas docente escribe notas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "docente escribe notas" ON public.notas TO authenticated USING ((public.tiene_modulo('calificaciones'::text) AND (public.is_admin() OR ((EXISTS ( SELECT 1
   FROM public.asignaciones a
  WHERE ((a.id = notas.asignacion_id) AND (a.docente_id = public.current_docente_id())))) AND (EXISTS ( SELECT 1
   FROM public.periodos p
  WHERE ((p.id = notas.periodo_id) AND (p.activo = true) AND ((p.calificacion_fecha_inicio IS NULL) OR (now() >= p.calificacion_fecha_inicio)) AND ((p.calificacion_fecha_limite IS NULL) OR (now() <= p.calificacion_fecha_limite))))))))) WITH CHECK ((public.tiene_modulo('calificaciones'::text) AND (public.is_admin() OR ((EXISTS ( SELECT 1
   FROM public.asignaciones a
  WHERE ((a.id = notas.asignacion_id) AND (a.docente_id = public.current_docente_id())))) AND (EXISTS ( SELECT 1
   FROM public.periodos p
  WHERE ((p.id = notas.periodo_id) AND (p.activo = true) AND ((p.calificacion_fecha_inicio IS NULL) OR (now() >= p.calificacion_fecha_inicio)) AND ((p.calificacion_fecha_limite IS NULL) OR (now() <= p.calificacion_fecha_limite)))))))));


--
-- Name: subparametros docente/admin subparametros; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "docente/admin subparametros" ON public.subparametros TO authenticated USING ((public.tiene_modulo('calificaciones'::text) AND (public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.asignaciones a
  WHERE ((a.id = subparametros.asignacion_id) AND (a.docente_id = public.current_docente_id()))))))) WITH CHECK ((public.tiene_modulo('calificaciones'::text) AND (public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.asignaciones a
  WHERE ((a.id = subparametros.asignacion_id) AND (a.docente_id = public.current_docente_id())))))));


--
-- Name: docente_modulos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.docente_modulos ENABLE ROW LEVEL SECURITY;

--
-- Name: docentes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.docentes ENABLE ROW LEVEL SECURITY;

--
-- Name: docentes docentes_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY docentes_admin_delete ON public.docentes FOR DELETE USING (public.is_admin());


--
-- Name: docentes docentes_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY docentes_admin_update ON public.docentes FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: docentes docentes_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY docentes_admin_write ON public.docentes FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: docentes docentes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY docentes_select ON public.docentes FOR SELECT USING (((user_id = auth.uid()) OR public.is_admin()));


--
-- Name: estudiantes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estudiantes ENABLE ROW LEVEL SECURITY;

--
-- Name: estudiantes estudiantes_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estudiantes_admin_delete ON public.estudiantes FOR DELETE USING (public.is_admin());


--
-- Name: estudiantes estudiantes_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estudiantes_admin_update ON public.estudiantes FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: estudiantes estudiantes_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estudiantes_admin_write ON public.estudiantes FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: estudiantes estudiantes_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estudiantes_select_admin ON public.estudiantes FOR SELECT USING (public.is_admin());


--
-- Name: estudiantes estudiantes_select_docente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estudiantes_select_docente ON public.estudiantes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.asignaciones a
  WHERE ((a.grupo_id = estudiantes.grupo_id) AND (a.docente_id = public.current_docente_id())))));


--
-- Name: grados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grados ENABLE ROW LEVEL SECURITY;

--
-- Name: grados grados_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grados_admin_write ON public.grados USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: grados grados_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grados_select ON public.grados FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: grupos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;

--
-- Name: grupos grupos_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grupos_admin_write ON public.grupos USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: grupos grupos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grupos_select ON public.grupos FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: incapacidades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incapacidades ENABLE ROW LEVEL SECURITY;

--
-- Name: asignaciones leer asignaciones por permiso delegado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer asignaciones por permiso delegado" ON public.asignaciones FOR SELECT TO authenticated USING (public.tiene_permiso('ver_informes_notas'::text));


--
-- Name: docente_modulos leer docente_modulos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer docente_modulos" ON public.docente_modulos FOR SELECT TO authenticated USING ((public.is_admin() OR (docente_id = public.current_docente_id())));


--
-- Name: docentes leer docentes por permiso delegado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer docentes por permiso delegado" ON public.docentes FOR SELECT TO authenticated USING (public.tiene_permiso('ver_informes_notas'::text));


--
-- Name: incapacidades leer incapacidades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer incapacidades" ON public.incapacidades FOR SELECT TO authenticated USING (true);


--
-- Name: marcas leer marcas por permiso delegado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer marcas por permiso delegado" ON public.marcas FOR SELECT TO authenticated USING (public.tiene_permiso('ver_informes_dificultades'::text));


--
-- Name: notas leer notas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer notas" ON public.notas FOR SELECT TO authenticated USING ((public.tiene_permiso('ver_informes_notas'::text) OR (public.tiene_modulo('calificaciones'::text) AND (public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.asignaciones a
  WHERE ((a.id = notas.asignacion_id) AND (a.docente_id = public.current_docente_id()))))))));


--
-- Name: parametros leer parametros; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer parametros" ON public.parametros FOR SELECT TO authenticated USING (true);


--
-- Name: permisos_usuario leer permisos_usuario; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer permisos_usuario" ON public.permisos_usuario FOR SELECT TO authenticated USING ((public.is_admin() OR (docente_id = public.current_docente_id())));


--
-- Name: subparametro_plantilla leer plantilla; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer plantilla" ON public.subparametro_plantilla FOR SELECT TO authenticated USING (true);


--
-- Name: subparametros leer subparametros; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer subparametros" ON public.subparametros FOR SELECT TO authenticated USING ((public.tiene_permiso('ver_informes_notas'::text) OR public.tiene_modulo('calificaciones'::text)));


--
-- Name: marcas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marcas ENABLE ROW LEVEL SECURITY;

--
-- Name: marcas marcas_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marcas_insert ON public.marcas FOR INSERT WITH CHECK ((public.is_admin() OR ((EXISTS ( SELECT 1
   FROM (public.asignaciones a
     JOIN public.estudiantes e ON ((e.grupo_id = a.grupo_id)))
  WHERE ((e.id = marcas.estudiante_id) AND (a.materia_id = marcas.materia_id) AND (a.docente_id = public.current_docente_id())))) AND (EXISTS ( SELECT 1
   FROM public.periodos p
  WHERE ((p.id = marcas.periodo_id) AND (p.activo = true) AND ((p.fecha_inicio IS NULL) OR (now() >= p.fecha_inicio)) AND ((p.fecha_limite IS NULL) OR (now() <= p.fecha_limite))))))));


--
-- Name: marcas marcas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marcas_select ON public.marcas FOR SELECT USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM (public.asignaciones a
     JOIN public.estudiantes e ON ((e.grupo_id = a.grupo_id)))
  WHERE ((e.id = marcas.estudiante_id) AND (a.materia_id = marcas.materia_id) AND (a.docente_id = public.current_docente_id()))))));


--
-- Name: marcas marcas_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marcas_update ON public.marcas FOR UPDATE USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM (public.asignaciones a
     JOIN public.estudiantes e ON ((e.grupo_id = a.grupo_id)))
  WHERE ((e.id = marcas.estudiante_id) AND (a.materia_id = marcas.materia_id) AND (a.docente_id = public.current_docente_id())))))) WITH CHECK ((public.is_admin() OR ((EXISTS ( SELECT 1
   FROM (public.asignaciones a
     JOIN public.estudiantes e ON ((e.grupo_id = a.grupo_id)))
  WHERE ((e.id = marcas.estudiante_id) AND (a.materia_id = marcas.materia_id) AND (a.docente_id = public.current_docente_id())))) AND (EXISTS ( SELECT 1
   FROM public.periodos p
  WHERE ((p.id = marcas.periodo_id) AND (p.activo = true) AND ((p.fecha_inicio IS NULL) OR (now() >= p.fecha_inicio)) AND ((p.fecha_limite IS NULL) OR (now() <= p.fecha_limite))))))));


--
-- Name: materias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materias ENABLE ROW LEVEL SECURITY;

--
-- Name: materias materias_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materias_admin_write ON public.materias USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: materias materias_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materias_select ON public.materias FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: notas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notas ENABLE ROW LEVEL SECURITY;

--
-- Name: parametros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parametros ENABLE ROW LEVEL SECURITY;

--
-- Name: periodos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.periodos ENABLE ROW LEVEL SECURITY;

--
-- Name: periodos periodos_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY periodos_admin_write ON public.periodos USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: periodos periodos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY periodos_select ON public.periodos FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: permisos_usuario; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permisos_usuario ENABLE ROW LEVEL SECURITY;

--
-- Name: subparametro_plantilla; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subparametro_plantilla ENABLE ROW LEVEL SECURITY;

--
-- Name: subparametros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subparametros ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION current_docente_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_docente_id() TO anon;
GRANT ALL ON FUNCTION public.current_docente_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_docente_id() TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- Name: FUNCTION marcar_password_cambiada(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.marcar_password_cambiada() TO anon;
GRANT ALL ON FUNCTION public.marcar_password_cambiada() TO authenticated;
GRANT ALL ON FUNCTION public.marcar_password_cambiada() TO service_role;


--
-- Name: FUNCTION proteger_nota_minima(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.proteger_nota_minima() TO anon;
GRANT ALL ON FUNCTION public.proteger_nota_minima() TO authenticated;
GRANT ALL ON FUNCTION public.proteger_nota_minima() TO service_role;


--
-- Name: FUNCTION tiene_modulo(p_modulo text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tiene_modulo(p_modulo text) TO anon;
GRANT ALL ON FUNCTION public.tiene_modulo(p_modulo text) TO authenticated;
GRANT ALL ON FUNCTION public.tiene_modulo(p_modulo text) TO service_role;


--
-- Name: FUNCTION tiene_permiso(p_permiso text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tiene_permiso(p_permiso text) TO anon;
GRANT ALL ON FUNCTION public.tiene_permiso(p_permiso text) TO authenticated;
GRANT ALL ON FUNCTION public.tiene_permiso(p_permiso text) TO service_role;


--
-- Name: TABLE asignaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.asignaciones TO anon;
GRANT ALL ON TABLE public.asignaciones TO authenticated;
GRANT ALL ON TABLE public.asignaciones TO service_role;


--
-- Name: SEQUENCE asignaciones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.asignaciones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.asignaciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.asignaciones_id_seq TO service_role;


--
-- Name: TABLE asistencias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.asistencias TO anon;
GRANT ALL ON TABLE public.asistencias TO authenticated;
GRANT ALL ON TABLE public.asistencias TO service_role;


--
-- Name: SEQUENCE asistencias_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.asistencias_id_seq TO anon;
GRANT ALL ON SEQUENCE public.asistencias_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.asistencias_id_seq TO service_role;


--
-- Name: TABLE configuracion; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.configuracion TO anon;
GRANT ALL ON TABLE public.configuracion TO authenticated;
GRANT ALL ON TABLE public.configuracion TO service_role;


--
-- Name: TABLE docente_modulos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.docente_modulos TO anon;
GRANT ALL ON TABLE public.docente_modulos TO authenticated;
GRANT ALL ON TABLE public.docente_modulos TO service_role;


--
-- Name: SEQUENCE docente_modulos_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.docente_modulos_id_seq TO anon;
GRANT ALL ON SEQUENCE public.docente_modulos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.docente_modulos_id_seq TO service_role;


--
-- Name: TABLE docentes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.docentes TO anon;
GRANT ALL ON TABLE public.docentes TO authenticated;
GRANT ALL ON TABLE public.docentes TO service_role;


--
-- Name: TABLE estudiantes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.estudiantes TO anon;
GRANT ALL ON TABLE public.estudiantes TO authenticated;
GRANT ALL ON TABLE public.estudiantes TO service_role;


--
-- Name: SEQUENCE estudiantes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.estudiantes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.estudiantes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.estudiantes_id_seq TO service_role;


--
-- Name: TABLE grados; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.grados TO anon;
GRANT ALL ON TABLE public.grados TO authenticated;
GRANT ALL ON TABLE public.grados TO service_role;


--
-- Name: SEQUENCE grados_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.grados_id_seq TO anon;
GRANT ALL ON SEQUENCE public.grados_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.grados_id_seq TO service_role;


--
-- Name: TABLE grupos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.grupos TO anon;
GRANT ALL ON TABLE public.grupos TO authenticated;
GRANT ALL ON TABLE public.grupos TO service_role;


--
-- Name: SEQUENCE grupos_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.grupos_id_seq TO anon;
GRANT ALL ON SEQUENCE public.grupos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.grupos_id_seq TO service_role;


--
-- Name: TABLE incapacidades; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.incapacidades TO anon;
GRANT ALL ON TABLE public.incapacidades TO authenticated;
GRANT ALL ON TABLE public.incapacidades TO service_role;


--
-- Name: SEQUENCE incapacidades_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.incapacidades_id_seq TO anon;
GRANT ALL ON SEQUENCE public.incapacidades_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.incapacidades_id_seq TO service_role;


--
-- Name: TABLE marcas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.marcas TO anon;
GRANT ALL ON TABLE public.marcas TO authenticated;
GRANT ALL ON TABLE public.marcas TO service_role;


--
-- Name: SEQUENCE marcas_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.marcas_id_seq TO anon;
GRANT ALL ON SEQUENCE public.marcas_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.marcas_id_seq TO service_role;


--
-- Name: TABLE materias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.materias TO anon;
GRANT ALL ON TABLE public.materias TO authenticated;
GRANT ALL ON TABLE public.materias TO service_role;


--
-- Name: SEQUENCE materias_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.materias_id_seq TO anon;
GRANT ALL ON SEQUENCE public.materias_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.materias_id_seq TO service_role;


--
-- Name: TABLE notas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notas TO anon;
GRANT ALL ON TABLE public.notas TO authenticated;
GRANT ALL ON TABLE public.notas TO service_role;


--
-- Name: SEQUENCE notas_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.notas_id_seq TO anon;
GRANT ALL ON SEQUENCE public.notas_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.notas_id_seq TO service_role;


--
-- Name: TABLE parametros; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.parametros TO anon;
GRANT ALL ON TABLE public.parametros TO authenticated;
GRANT ALL ON TABLE public.parametros TO service_role;


--
-- Name: SEQUENCE parametros_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.parametros_id_seq TO anon;
GRANT ALL ON SEQUENCE public.parametros_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.parametros_id_seq TO service_role;


--
-- Name: TABLE periodos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.periodos TO anon;
GRANT ALL ON TABLE public.periodos TO authenticated;
GRANT ALL ON TABLE public.periodos TO service_role;


--
-- Name: SEQUENCE periodos_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.periodos_id_seq TO anon;
GRANT ALL ON SEQUENCE public.periodos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.periodos_id_seq TO service_role;


--
-- Name: TABLE permisos_usuario; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.permisos_usuario TO anon;
GRANT ALL ON TABLE public.permisos_usuario TO authenticated;
GRANT ALL ON TABLE public.permisos_usuario TO service_role;


--
-- Name: SEQUENCE permisos_usuario_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.permisos_usuario_id_seq TO anon;
GRANT ALL ON SEQUENCE public.permisos_usuario_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.permisos_usuario_id_seq TO service_role;


--
-- Name: TABLE subparametro_plantilla; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subparametro_plantilla TO anon;
GRANT ALL ON TABLE public.subparametro_plantilla TO authenticated;
GRANT ALL ON TABLE public.subparametro_plantilla TO service_role;


--
-- Name: SEQUENCE subparametro_plantilla_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.subparametro_plantilla_id_seq TO anon;
GRANT ALL ON SEQUENCE public.subparametro_plantilla_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.subparametro_plantilla_id_seq TO service_role;


--
-- Name: TABLE subparametros; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subparametros TO anon;
GRANT ALL ON TABLE public.subparametros TO authenticated;
GRANT ALL ON TABLE public.subparametros TO service_role;


--
-- Name: SEQUENCE subparametros_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.subparametros_id_seq TO anon;
GRANT ALL ON SEQUENCE public.subparametros_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.subparametros_id_seq TO service_role;


-- (Quitadas a mano: las 24 ALTER DEFAULT PRIVILEGES que pg_dump escribe aqui.
--  En Supabase dan "permission denied": no eres dueno de los roles postgres
--  ni supabase_admin. Los 118 GRANT de arriba SI hacen falta y se quedan.)


--
-- PostgreSQL database dump complete
--


