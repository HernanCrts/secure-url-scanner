## Resumen

Añadir auth con Lovable Cloud, roles (admin/user), historial persistido de búsquedas (con scoping por rol), y tres herramientas nuevas: revisión de IPs (AbuseIPDB), análisis de cabeceras de correo, y CyberChef.

## 1. Backend (Lovable Cloud)

Activar Lovable Cloud y crear:

**Tablas**
- `profiles` (id uuid PK = auth.users.id, email, display_name, created_at) + trigger `handle_new_user` que la rellena al registrarse.
- `user_roles` (id, user_id → auth.users, role app_role) — enum `app_role = ('admin','user')`. Tabla aparte para evitar escalada de privilegios.
- `search_history` (id, user_id, kind ['url'|'ip'|'email_headers'], input text, result jsonb, created_at).

**Función SECURITY DEFINER**
- `has_role(_uid, _role)` para usar en RLS sin recursión.

**RLS**
- `profiles`: el usuario lee/edita solo el suyo; admin lee todos.
- `user_roles`: solo admin escribe; cada uno lee los suyos.
- `search_history`: insert solo el dueño; select = dueño OR `has_role(uid,'admin')`.

**Primer admin**: te indico el SQL para que tú mismo te promociones tras registrarte (`insert into user_roles ... 'admin'`).

## 2. Auth UI

- `/login` — email + password con tabs login/registro (defecto Lovable Cloud, sin OAuth salvo que lo pidas).
- Layout `_authenticated` con `beforeLoad` que redirige a `/login` si no hay sesión.
- Header global con nav: Análisis URL · IP · Cabeceras · CyberChef · Historial · (Admin) · Logout.

## 3. Historial

- Modificar `analyzeUrl` (y las nuevas funciones) para que, si hay sesión, inserten en `search_history`.
- Página `/_authenticated/history` con tabla, filtros por tipo, búsqueda por texto, paginación. Si eres admin: columna “usuario” + filtro por usuario. Botón “rehacer” que rellena el formulario correspondiente.

## 4. Panel admin (`/_authenticated/admin`)

- Lista de usuarios (de `profiles`) con su rol, total de búsquedas, última actividad.
- Toggle para promover/demover admin.
- Acceso solo si `has_role(uid,'admin')` — gateado en `beforeLoad`.

## 5. Revisión de IPs (AbuseIPDB)

- Página `/_authenticated/ip`.
- Server fn `checkAbuseIp(ip)` → llama a `https://api.abuseipdb.com/api/v2/check?ipAddress=…&maxAgeInDays=90&verbose` con header `Key: $ABUSEIPDB_API_KEY`.
- Muestra: score de abuso, país, ISP, dominio, uso, total de reportes, lista de reportes con comentario, categoría y fecha (verbose=true los devuelve).
- Guarda en `search_history` (kind='ip').
- **Necesito que añadas el secreto `ABUSEIPDB_API_KEY`** (gratis en abuseipdb.com, 1 000 checks/día).

## 6. Cabeceras de email

- Página `/_authenticated/email-headers`.
- Textarea donde pegas el bloque de cabeceras crudas.
- Parser local (sin API): desplegar todas las cabeceras, extraer y resaltar:
  - SPF / DKIM / DMARC (de `Authentication-Results`).
  - Cadena de `Received:` con timing entre saltos e IPs (cada IP enlazada al verificador del punto 5).
  - From, Reply-To, Return-Path, Message-ID, List-*, X-Originating-IP.
  - Detección de mismatch From vs Return-Path.
- Guarda en `search_history` (kind='email_headers').

## 7. CyberChef

- Página `/_authenticated/cyberchef`.
- Embebido en `<iframe>` apuntando a `https://gchq.github.io/CyberChef/` (CyberChef oficial permite embed).
- Aviso de que se ejecuta en el cliente y los datos no salen del navegador.
- Sin persistencia (CyberChef es stateful en URL).

## Detalles técnicos

- Cliente Supabase del navegador para auth + listener `onAuthStateChange`.
- `requireSupabaseAuth` middleware en cada server fn nueva; `supabaseAdmin` solo para listar usuarios en panel admin.
- `analyzeUrl` actual queda igual pero con un wrapper que registra en historial cuando hay sesión (no rompe el flujo público existente).
- La home `/` sigue accesible sin login (modo invitado, sin historial).

## Lo que NO incluye este plan

- OAuth (Google/Apple) — lo añado si lo pides.
- Reportar tú mismo IPs a AbuseIPDB (solo lectura).
- Tests automáticos.
- Internacionalización.

## Qué necesito de ti antes de empezar

1. Aprobar este plan.
2. Confirmar que activo Lovable Cloud (necesario para auth + DB).
3. Confirmar que añades luego el secreto `ABUSEIPDB_API_KEY`.
