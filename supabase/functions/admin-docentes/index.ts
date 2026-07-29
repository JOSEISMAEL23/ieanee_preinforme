import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );

    const supabaseCaller = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabaseCaller.auth.getUser();
    if (userErr || !user) return json({ error: "No autorizado" }, 401);

    const { data: callerDocente } = await supabaseAdmin
      .from("docentes")
      .select("rol")
      .eq("user_id", user.id)
      .single();

    if (!callerDocente || callerDocente.rol !== "admin") {
      return json({ error: "Solo un administrador puede gestionar docentes" }, 403);
    }

    const body = await req.json();
    const { accion } = body;

    if (accion === "crear") {
      const { nombre, email, password, asignaciones } = body;
      if (!nombre || !email || !password) return json({ error: "Faltan datos" }, 400);

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (createErr) return json({ error: createErr.message }, 400);

      const { data: docenteRow, error: insertErr } = await supabaseAdmin
        .from("docentes")
        .insert({ user_id: created.user.id, nombre, email, rol: "docente", debe_cambiar_password: true })
        .select()
        .single();
      if (insertErr) return json({ error: insertErr.message }, 400);

      if (asignaciones && asignaciones.length > 0) {
        const filas = asignaciones.map(a => ({
          docente_id: docenteRow.id, grupo_id: a.grupo_id, materia_id: a.materia_id,
        }));
        const { error: asigErr } = await supabaseAdmin.from("asignaciones").insert(filas);
        if (asigErr) return json({ error: "Docente creado, pero fallaron las asignaciones: " + asigErr.message }, 400);
      }

      return json({ ok: true, docente: docenteRow });
    }

    if (accion === "eliminar") {
      const { docente_id, user_id } = body;
      if (!docente_id || !user_id) return json({ error: "Faltan datos" }, 400);
      await supabaseAdmin.from("docentes").delete().eq("id", docente_id);
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (delErr) return json({ error: delErr.message }, 400);
      return json({ ok: true });
    }

    if (accion === "reset_password") {
  const { user_id, nueva_password } = body;
  if (!user_id || !nueva_password) return json({ error: "Faltan datos" }, 400);
  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
    password: nueva_password,
  });
  if (updErr) return json({ error: updErr.message }, 400);

  await supabaseAdmin.from("docentes").update({ debe_cambiar_password: true }).eq("user_id", user_id);

  return json({ ok: true });
}

    if (accion === "cambiar_email") {
  const { docente_id, user_id, nuevo_email } = body;
  if (!docente_id || !user_id || !nuevo_email) return json({ error: "Faltan datos" }, 400);

  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
    email: nuevo_email,
    email_confirm: true,
  });
  if (updErr) return json({ error: updErr.message }, 400);

  const { error: dbErr } = await supabaseAdmin
    .from("docentes")
    .update({ email: nuevo_email })
    .eq("id", docente_id);
  if (dbErr) return json({ error: dbErr.message }, 400);

  return json({ ok: true });
}

    return json({ error: "Acción no reconocida" }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
});