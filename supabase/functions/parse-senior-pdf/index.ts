const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AI_GATEWAY = 'https://ai-gateway.lovable.dev'
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

type ExtractedPlayer = { name: string; license: string }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function extractOutputText(result: Record<string, unknown>): string {
  if (typeof result.output_text === 'string') return result.output_text
  const output = Array.isArray(result.output) ? result.output : []
  return output.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : []
    return content.flatMap((part) => {
      if (!part || typeof part !== 'object') return []
      const text = (part as { text?: unknown }).text
      return typeof text === 'string' ? [text] : []
    })
  }).join('')
}

function parsePlayers(raw: string): ExtractedPlayer[] {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1))
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const name = typeof (item as { name?: unknown }).name === 'string'
      ? (item as { name: string }).name.trim()
      : ''
    const license = typeof (item as { license?: unknown }).license === 'string'
      ? (item as { license: string }).license.replace(/\s+/g, '').trim()
      : ''
    return name ? [{ name, license }] : []
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'Cal iniciar sessió com a administrador.' }, 401)

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!lovableApiKey) return jsonResponse({ error: 'El lector de classificacions no està configurat.' }, 500)

    const body = await req.json()
    const fileBase64 = typeof body.file_base64 === 'string'
      ? body.file_base64
      : typeof body.pdf_base64 === 'string' ? body.pdf_base64 : ''
    const mimeType = typeof body.mime_type === 'string' ? body.mime_type : 'application/pdf'
    const filename = typeof body.filename === 'string' ? body.filename : mimeType === 'application/pdf' ? 'classificacio.pdf' : 'classificacio'

    if (!fileBase64) return jsonResponse({ error: 'El fitxer està buit.' }, 400)
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return jsonResponse({ error: 'Format no admès. Utilitza PDF, JPG, PNG o WEBP.' }, 400)
    }

    const content = mimeType === 'application/pdf'
      ? [
          { type: 'input_text', text: 'Extract every senior player shown in this golf classification PDF.' },
          { type: 'input_file', filename, file_data: `data:${mimeType};base64,${fileBase64}` },
        ]
      : [
          { type: 'input_text', text: 'Extract every senior player shown in this golf classification screenshot.' },
          { type: 'input_image', image_url: `data:${mimeType};base64,${fileBase64}` },
        ]

    const response = await fetch(`${AI_GATEWAY}/v1/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-6-astra',
        reasoning: { effort: 'low' },
        instructions: 'Extract golf senior-classification data. Return only a JSON array. Each item must have exactly two string fields: "name" and "license". Copy every visible player row, including rows where the position number is omitted because of ties. Never infer age or senior status: every player in the supplied senior classification is senior. Preserve names as printed. Remove spaces from license numbers. Do not include headings, totals, dates, scores, handicaps, or explanations.',
        input: [
          {
            role: 'user',
            content,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      const safeMessage = errorBody && typeof errorBody === 'object' && typeof errorBody.message === 'string'
        ? errorBody.message
        : 'No s’ha pogut llegir la classificació.'
      return jsonResponse({ error: safeMessage }, response.status)
    }

    const aiResult = await response.json() as Record<string, unknown>
    const players = parsePlayers(extractOutputText(aiResult))
    if (players.length === 0) return jsonResponse({ error: 'No s’han trobat noms i llicències llegibles al fitxer.' }, 422)
    return jsonResponse({ players })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconegut'
    return jsonResponse({ error: message }, 500)
  }
})
