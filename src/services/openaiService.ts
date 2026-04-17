import OpenAI from 'openai';
import { DietRequest } from '../types';
import { DaySchema, RecommendationsSchema } from '../schemas/zodDietSchemas';
import { normalizeDayCalories,  rebalanceDayToTargetCalories} from '../utils/nutritionMath';
import { validateDayQuality } from '../utils/dietAuditor';

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
      {
        role: 'system',
        content:
          'Eres un nutricionista deportivo con enfoque clínico-práctico. Responde exclusivamente JSON válido y prioriza seguridad, adherencia, alimentos reales y coherencia nutricional.'
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 3000,
  })

  return completion.choices[0]?.message?.content || '{}';
}

/**
 * Transforma el objeto de alimentos seleccionados en una lista para el prompt.
 */
const formatFoodPreferences = (foods: any): string => {
  if (!foods || typeof foods !== 'object') return 'Sin preferencias específicas.';
  
  const categoryNames: Record<string, string> = {
    proteins: 'Proteínas',
    carbohydrates: 'Carbohidratos',
    fats: 'Grasas',
    dairy: 'Lácteos',
    fruits: 'Frutas',
    vegetables: 'Vegetales',
    seasonings: 'Condimentos'
  };

  const categories = Object.entries(foods)
    .filter(([_, list]: any) => Array.isArray(list) && list.length > 0)
    .map(([category, list]: any) => `- ${categoryNames[category] || category.toUpperCase()}: ${list.join(', ')}`);
  
  return categories.length > 0 ? categories.join('\n') : 'Usa una variedad saludable de alimentos.';
};

/**
 * Construye el prompt dinámico para un día específico
 */
const buildDayPrompt = (
  day: number,
  data: DietRequest,
  mealNamesStr: string,
  userFoodPreferences: string,
  isRecipeMode: boolean,
  targetPerMeal: number,
  previousIssues?: string
): string => {
  const strictFeedback = previousIssues
    ? `\nERRORES DETECTADOS EN EL INTENTO PREVIO (DEBES CORREGIRLOS TODOS):\n- ${previousIssues}\n`
    : '';

  return `
    Genera solo un JSON para el día ${day} con exactamente ${data.mealsPerDay} comidas.

    PERFIL DEL PACIENTE:
    ${JSON.stringify({
      name: data.name,
      goal: data.goal,
      age: data.age,
      gender: data.gender,
      weight: data.weight,
      height: data.height,
      activity: data.activity,
      dietType: data.dietType,
      allergies: data.allergies,
      suggestionType: data.suggestionType,
    })}

    OBJETIVO NUTRICIONAL DIARIO:
    - Calorías: ${data.calories} kcal | Proteínas: ${data.proteins} g | Grasas: ${data.fats} g | Carbohidratos: ${data.carbs} g
    - ${data.mealsPerDay} comidas (Aprox ${targetPerMeal} kcal por comida).
    - Nombres de comidas obligatorios: ${mealNamesStr}

    REGLAS CLÍNICO-PRÁCTICAS (OBLIGATORIAS):
    1. Seguridad primero: excluye por completo alergias/restricciones y respeta el tipo de dieta.
    2. Usa solo alimentos reales y comunes en supermercado/mercado local en Perú (sin marcas, sin suplementos inventados).
    3. Cada comida debe ser viable para vida real (preparación razonable y porciones realistas).
    4. Da preferencia a estos alimentos elegidos por el usuario: ${userFoodPreferences}
    5. Cada quantity debe tener formato con espacio: "100 g", "250 ml", "2 unidades".
    6. Idioma 100% español.

    MODO DE SALIDA:
    - ${isRecipeMode ? 'RECETAS PASO A PASO para cada elemento foods mediante el campo recipe.' : 'SOLO INGREDIENTES por alimento, sin campo recipe.'}

    ${strictFeedback}

    ESTRUCTURA JSON OBLIGATORIA:
    {
      "day_number": ${day},
      "meals": [
        {
          "meal_name": "Nombre exacto",
          "time_suggestion": "string opcional",
          "total_calories": number,
          "foods": [
            {
              "name": "string",
              "quantity": "string",
              "calories": number,
              "macros": {"p": number, "f": number, "c": number}${isRecipeMode ? ',\n              "recipe": {"plate_name": "string", "instructions": ["string"], "prep_time": "string"}' : ''}
            }
          ],
          "tips": "string opcional"
        }
      ]
    }
  `;
};

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
  const userFoodPreferences = formatFoodPreferences(data.selectedFoods);
  const isRecipeMode = data.suggestionType === 'recipes';
  const targetPerMeal = Math.round(data.calories / data.mealsPerDay);

  let previousIssues = '';

  for (let i = 0; i < retries; i++) {
    try {
      const dayPrompt = buildDayPrompt(
        day,
        data,
        mealNamesStr,
        userFoodPreferences,
        isRecipeMode,
        targetPerMeal,
        previousIssues
      );

      // Llamada a OpenAI para generar el día
      const response = await callOpenAI(dayPrompt);
      const dayJson = JSON.parse(response);

      // Normaliza números para mantener coherencia matemática estricta.
      const normalizedDay = normalizeDayCalories(dayJson);

      // Rebalancea el total diario para mantener una brecha pequeña vs objetivo.
      const balancedDay = rebalanceDayToTargetCalories(normalizedDay, data.calories);

      // Validación estructural estricta con Zod.
      DaySchema.parse(balancedDay);

      // Validación de calidad nutricional y restricciones clínicas.
      const qualityIssues = validateDayQuality(balancedDay, data, mealNames);
      if (qualityIssues.length > 0) {
        const blockingIssues = qualityIssues.filter((issue) =>
          issue.includes('Clínico:') || issue.includes('Estructura:') || issue.includes('Formato:')
        );

        if (blockingIssues.length > 0 && i < retries - 1) {
          previousIssues = blockingIssues.join(' | ');
          console.warn(`[Intento ${i + 1}] Reintentando día ${day} por: ${previousIssues}`);
          continue;
        }

        if (blockingIssues.length > 0) {
          console.error(`Día ${day} descartado tras reintentos: ${blockingIssues.join(' | ')}`);
          throw new Error('No se pudo generar un plan seguro para el paciente.');
        }

        const warnings = qualityIssues.filter(issue => issue.includes('Matemática:'));
        if (warnings.length > 0) {
          console.warn(`Día ${day} generado con advertencias matemáticas: ${warnings.join(' | ')}`);
        }
      }

      return balancedDay;
    } catch (error) {
      previousIssues = error instanceof Error ? error.message : 'Error desconocido';
      if (i === retries - 1) throw new Error(`Fallo crítico generando el día ${day}: ${previousIssues}`);
      console.warn(`[Intento ${i + 1}] Error en JSON de Día ${day}. Reintentando...`);
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
    - Recomendaciones accionables y realistas (hidratación, distribución de proteína, fibra, planificación semanal, adherencia).
    
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