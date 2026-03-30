import OpenAI from 'openai';

/**
 * Llama a la API de OpenAI para generar un plan de dieta en markdown.
 * @param prompt El prompt o instrucción del usuario.
 * @returns El texto generado por OpenAI.
 */
export async function generateDietPlan(prompt: string): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Eres un experto en nutrición y generas planes de dieta en formato JSON.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 3000,
  });
  return completion.choices[0]?.message?.content || '';
}
