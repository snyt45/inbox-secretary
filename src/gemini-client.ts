interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
    };
  }[];
}

export class GeminiClient {
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

  constructor(
    private apiKey: string,
    private model: string = "gemini-2.5-flash-lite"
  ) {}

  async generateStructured<T>(
    systemInstruction: string,
    prompt: string,
    schema: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${error}`);
    }

    const data: GeminiResponse = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text) as T;
  }
}
