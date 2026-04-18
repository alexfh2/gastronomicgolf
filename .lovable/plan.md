
El usuario quiere usar WhatsApp para el sistema de inscripciones. Twilio está disponible como connector en Lovable. Plan: conectar Twilio + MVP del sistema.

# Sistema de inscripciones por WhatsApp (Twilio)

## Paso 1 — Conectar Twilio
Lanzo el conector oficial de Twilio. Necesitarás:
- Cuenta Twilio activa con número WhatsApp Business aprobado (o sandbox para pruebas)
- API Key creada en consola Twilio

Una vez conectado, las credenciales quedan disponibles automáticamente en las edge functions vía gateway. No tienes que pegar tokens manualmente.

## Paso 2 — Estructura de datos (migración)

Tablas nuevas:
- **player_contacts**: `player_id`, `phone_e164`, `whatsapp_opt_in`, `verified_at`
- **registrations**: `round_id`, `player_id`, `status` (invited/confirmed/declined/waitlist/cancelled), `invited_at`, `responded_at`, `notes`
- **whatsapp_messages**: log de entrada/salida (auditoría)

Campos nuevos en **rounds**: `max_players`, `registration_deadline`

Todo con RLS (admin gestiona, jugador solo lee lo suyo).

## Paso 3 — Edge functions

1. **send-tournament-invitations** — envía template WhatsApp a jugadores activos para una jornada (lanzable manual desde admin o por cron)
2. **whatsapp-webhook** — recibe respuestas entrantes de Twilio, identifica jugador por teléfono, parsea SI/NO/ESPERA, actualiza `registrations` y responde confirmación
3. **send-reminders** — recordatorio a quien no ha respondido (manual o cron)

Todas usan el gateway de Twilio (`https://connector-gateway.lovable.dev/twilio/Messages.json`).

## Paso 4 — UI Admin

Nueva pestaña **"Inscripcions"** dentro de cada jornada en el admin:
- Lista de jugadores con estado (pendiente/confirmado/rechazado/lista espera)
- Botón "Enviar invitaciones" → llama a edge function
- Botón "Enviar recordatorio"
- Capacidad visible (X/Y) y gestión de cierre
- Inscripción manual / cambio de estado por admin
- Gestión de teléfonos y opt-in en ficha jugador

## Paso 5 — Flujo conversacional

```text
Bot → "Hola Marta, t'invitem a la J5 - Empordà (15 nov).
       Confirmes? Respon SI / NO / ESPERA"
Marta → "SI"
Bot → "Inscripció confirmada! Rebràs detalls 3 dies abans."
```

Comandos reconocidos: SI/SÍ/OK/CONFIRMO, NO/CANCELO, ESPERA, AJUDA. Fallback con menú.

## Webhook URL para Twilio

Tras desplegar `whatsapp-webhook`, te daré la URL pública para pegarla en la consola Twilio (Messaging → Sandbox o número productivo → "When a message comes in").

## Roadmap propuesto (este turno)

Para no abarcar demasiado de golpe, propongo ejecutar **ahora**:
1. Conectar Twilio
2. Crear migración de tablas
3. UI Admin de inscripciones (manual, sin enviar aún)
4. Edge function `send-tournament-invitations` + botón en admin
5. Edge function `whatsapp-webhook` + parser básico

**Después** (siguiente iteración): recordatorios automáticos, lista de espera con auto-promoción, dashboard de tasas de respuesta.

## Consideraciones importantes

- Meta exige **plantillas pre-aprobadas** para mensajes salientes fuera de ventana de 24h. Para empezar puedes usar el **Sandbox de Twilio WhatsApp** (gratis, jugadores deben unirse con código)
- **GDPR**: opt-in explícito antes de enviar; comando STOP para baja
- Coste real Twilio: ~0.005-0.05€/mensaje según país y tipo

¿Apruebas para empezar con la conexión Twilio y el MVP de los pasos 1-5?
