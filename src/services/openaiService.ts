import OpenAI from 'openai';
import { DietRequest } from '../types';
import { DaysArraySchema, RecommendationsSchema } from './zodDietSchemas';

// 1. Instancia Única (Singleton)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Llama a la API de OpenAI para generar una respuesta en formato JSON.
 */
const callOpenAI = async (prompt: string): Promise<string> => {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Eres un experto en nutrición que responde solo en JSON.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 3000,
  })

  return completion.choices[0]?.message?.content || '{}';
}

/**
 * Lógica de generación de un día individual con reintentos si es necesario.
 */
const generateDay = async (day: number, data: DietRequest, retries = 3) : Promise<any> => {
  // Nombres de comidas según mealsPerDay
  const mealNamesByCount: Record<number, string[]> = {
    3: ['Desayuno', 'Almuerzo', 'Cena'],
    4: ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'],
    5: ['Desayuno', 'Media Mañana', 'Almuerzo', 'Merienda', 'Cena'],
    6: ['Desayuno', 'Media Mañana', 'Almuerzo', 'Merienda', 'Cena', 'Snack Nocturno'],
  };

  const mealNames = mealNamesByCount[data.mealsPerDay] || Array.from({length: data.mealsPerDay}, (_,i)=>`Comida ${i+1}`);
  const mealNamesStr = mealNames.join(', ');

  const dayPrompt = `Genera solo un JSON para el día ${day} de un plan de dieta semanal con ${data.mealsPerDay} comidas. Usa estos datos del usuario:\n${JSON.stringify(data)}\n\nOBJETIVO PRINCIPAL:\nCrear un día de alimentación PERSONALIZADO según el objetivo (${data.goal}), calorías y macros objetivo, tipo de dieta (${data.dietType}) y alergias/restricciones (${JSON.stringify(data.allergies)}).\n\nREGLAS OBLIGATORIAS:\n- Devuelve exclusivamente JSON válido, sin texto adicional.\n- Las comidas deben ser exactamente: ${mealNamesStr}.\n- Debe haber exactamente ${data.mealsPerDay} comidas (ni más ni menos).\n- No fuerces platos de una gastronomía específica. Prioriza adherencia, practicidad y objetivo nutricional.\n- Si propones platos preparados o combinaciones, deben ser coherentes con el objetivo y las restricciones del usuario.\n- Nunca incluyas alimentos incompatibles con alergias/restricciones o tipo de dieta.\n- Los alimentos, platos preparados, combinaciones o bebidas deben ir solo en el array foods.\n- Usa alimentos reales en español y de disponibilidad común en supermercados/mercados (sin marcas, sin nombres inventados).\n- Las cantidades SIEMPRE deben tener espacio entre número y unidad (ejemplo: '100 g', '250 ml', '2 unidades').\n- Mantén consistencia calórica: total_calories por comida debe aproximar la suma de calorías de foods.\n- Mantén consistencia de macros: p, f y c deben ser valores numéricos realistas por alimento.\n\nEstructura ejemplo:\n{\n  \"day_number\": number,\n  \"meals\": [\n    {\n      \"meal_name\": string,\n      \"time_suggestion\": string,\n      \"total_calories\": number,\n      \"foods\": [\n        {\n          \"name\": string,\n          \"quantity\": string,\n          \"calories\": number,\n          \"macros\": {\"p\": number, \"f\": number, \"c\": number}\n        }\n      ],\n      \"tips\": string\n    }\n  ]\n}\n`;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await callOpenAI(dayPrompt);
      const dayJson = JSON.parse(response);
      
      // Validar con Zod antes de darlo por bueno
      const daySchema = DaysArraySchema(data.mealsPerDay).element;
      daySchema.parse(dayJson); 

      return dayJson;
    } catch (error) {
      if (i === retries - 1) throw new Error(`Fallo crítico generando el día ${day}`);
      console.warn(`Reintentando día ${day}... (Intento ${i + 2})`);
    }
  }
}

/**
 * Lógica de generación de recomendaciones con validación estricta
 */
const generateRecommendations = async (data: DietRequest, retries = 2): Promise<string[]> => {
  const prompt = `
    Genera un JSON con una lista de 3 recomendaciones nutricionales breves y prácticas para una persona con este objetivo: ${data.goal}.
    
    REGLAS:
    - Idioma: Español.
    - Formato: { "recommendations": ["string", "string", "string"] }.
    - No incluyas objetos, solo texto simple en el array.
    
    Datos: ${JSON.stringify(data)}
  `;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await callOpenAI(prompt);
      const parsed = JSON.parse(response);
      
      // Validamos que cumpla con el Schema de Zod
      const validData = RecommendationsSchema.parse(parsed);
      return validData.recommendations;
    } catch (error) {
      if (i === retries - 1) {
        console.error("Fallo al generar recomendaciones, usando fallback.");
        return ["Mantente hidratado durante el día.", "Prioriza el descanso nocturno.", "Consume vegetales en cada comida."];
      }
    }
  }
  return []; // Fallback final
};

// Función principal para obtener el plan de dieta completo
export const getCompleteDietPlan = async (data: DietRequest) => {
  try {
    // 1. Preparamos la "promesa" de los días (sin el await todavía)
    const daysPromises = Array.from({ length: data.planDays }, (_, i) => generateDay(i + 1, data));
    const daysTask = Promise.all(daysPromises);

    // 2. Ejecutamos recomendaciones y la tarea de los días en paralelo
    const [recommendations, days] = await Promise.all([
      generateRecommendations(data),
      daysTask
    ]);

    return { days, general_recommendations: recommendations || [] };
  } catch (error) {
    console.error('Error en servicio:', error);
    throw new Error('Error al generar el plan de dieta');
  }
}