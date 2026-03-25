import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ success: false, error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the webpage content
    const pageResponse = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GolfBot/1.0)" },
    });
    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch URL: ${pageResponse.status}`);
    }
    const html = await pageResponse.text();

    // Use Lovable AI to extract par data from the HTML
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Truncate HTML to avoid token limits (keep first 15k chars)
    const truncatedHtml = html.substring(0, 15000);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a golf course data extractor. Extract the par for each hole from the provided webpage HTML. 
Return ONLY a JSON array of 18 integers representing the par for holes 1-18. 
Example: [4, 4, 5, 3, 5, 3, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4]
If you cannot find par data for all 18 holes, return an error message instead.
Look for patterns like "Par 4", "Par 5", "Par 3" associated with hole numbers.`,
          },
          {
            role: "user",
            content: `Extract the par for each of the 18 holes from this golf course webpage:\n\n${truncatedHtml}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_par",
              description: "Return the par values for all 18 holes of the golf course",
              parameters: {
                type: "object",
                properties: {
                  par: {
                    type: "array",
                    items: { type: "integer" },
                    description: "Array of 18 par values, one per hole",
                  },
                  course_name: {
                    type: "string",
                    description: "Name of the golf course if found",
                  },
                  total_par: {
                    type: "integer",
                    description: "Total par for the course",
                  },
                },
                required: ["par"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_par" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ success: false, error: "Rate limit exceeded, try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ success: false, error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errorText);
      throw new Error("AI extraction failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("AI did not return structured data");
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    const par: number[] = extracted.par;

    if (!Array.isArray(par) || par.length !== 18) {
      throw new Error(`Expected 18 holes but got ${par?.length || 0}. Try entering the par manually.`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      par, 
      course_name: extracted.course_name,
      total_par: par.reduce((a: number, b: number) => a + b, 0),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("extract-course-par error:", e);
    return new Response(JSON.stringify({ 
      success: false, 
      error: e instanceof Error ? e.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
