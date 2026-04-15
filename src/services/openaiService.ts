import OpenAI from 'openai';
import { DietRequest } from '../types';
import { DaySchema, RecommendationsSchema } from './zodDietSchemas';

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
 * Esta función transforma el objeto de alimentos en una lista para el prompt.
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
    .map(([category, list]: any) => {
      const label = categoryNames[category] || category.toUpperCase();
      return `- ${label}: ${list.join(', ')}`;
    });
  
  return categories.length > 0 
    ? categories.join('\n') 
    : 'Usa una variedad saludable de alimentos.';
};

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/* Sistema Atwater */
const calculateCalories = (p: number, f: number, c: number): number =>
  Math.round((p * 4) + (c * 4) + (f * 9));

const roundMacro = (value: number): number => Math.round(value * 10) / 10;

const recomputeMealTotals = (day: any): any => {
  const meals = (day.meals || []).map((meal: any) => {
    const foods = (meal.foods || []).map((food: any) => {
      const p = Number(food?.macros?.p) || 0;
      const f = Number(food?.macros?.f) || 0;
      const c = Number(food?.macros?.c) || 0;
      return {
        ...food,
        macros: { p: roundMacro(p), f: roundMacro(f), c: roundMacro(c) },
        calories: calculateCalories(p, f, c),
      };
    });

    const totalCalories = foods.reduce((sum: number, food: any) => sum + (Number(food.calories) || 0), 0);
    return {
      ...meal,
      foods,
      total_calories: totalCalories,
    };
  });

  return { ...day, meals };
};

const nudgeFoodCalories = (food: any, deltaKcal: number, maxDeltaKcal: number): number => {
  if (!food?.macros) return 0;

  const requestedDelta = Math.sign(deltaKcal) * Math.min(Math.abs(deltaKcal), maxDeltaKcal);
  let remaining = requestedDelta;
  const macros = {
    p: Number(food.macros.p) || 0,
    f: Number(food.macros.f) || 0,
    c: Number(food.macros.c) || 0,
  };

  if (remaining > 0) {
    const addCarbs = remaining / 4;
    macros.c += addCarbs;
    remaining = 0;
  } else if (remaining < 0) {
    // Restamos primero carbohidratos, luego grasas y finalmente proteína.
    const removeFromC = Math.min(macros.c, Math.abs(remaining) / 4);
    macros.c -= removeFromC;
    remaining += removeFromC * 4;

    if (remaining < 0) {
      const removeFromF = Math.min(macros.f, Math.abs(remaining) / 9);
      macros.f -= removeFromF;
      remaining += removeFromF * 9;
    }

    if (remaining < 0) {
      const removeFromP = Math.min(macros.p, Math.abs(remaining) / 4);
      macros.p -= removeFromP;
      remaining += removeFromP * 4;
    }
  }

  food.macros = {
    p: roundMacro(Math.max(0, macros.p)),
    f: roundMacro(Math.max(0, macros.f)),
    c: roundMacro(Math.max(0, macros.c)),
  };

  const kcalBefore = Number(food.calories) || 0;
  food.calories = calculateCalories(food.macros.p, food.macros.f, food.macros.c);
  return food.calories - kcalBefore;
};

const getFoodAdjustmentLimit = (food: any): number => {
  const currentCalories = Number(food?.calories) || 0;
  return Math.max(18, Math.round(currentCalories * 0.12));
};

const rebalanceDayToTargetCalories = (day: any, targetCalories: number): any => {
  if (!day || !Array.isArray(day.meals) || day.meals.length === 0) return day;

  let balancedDay = recomputeMealTotals(day);
  let currentTotal = balancedDay.meals.reduce((sum: number, meal: any) => sum + (Number(meal.total_calories) || 0), 0);
  let diff = targetCalories - currentTotal;

  if (Math.abs(diff) <= 25) return balancedDay;

  for (let pass = 0; pass < 5 && Math.abs(diff) > 25; pass++) {
    const foodRefs = balancedDay.meals.flatMap((meal: any, mealIndex: number) =>
      (Array.isArray(meal.foods) ? meal.foods : []).map((food: any, foodIndex: number) => ({
        mealIndex,
        foodIndex,
        food,
      }))
    );

    if (foodRefs.length === 0) break;

    const totalFoodCalories = foodRefs.reduce(
      (sum: number, item: any) => sum + (Number(item.food?.calories) || 0),
      0
    );

    const orderedRefs = [...foodRefs].sort((a: any, b: any) => {
      const caloriesA = Number(a.food?.calories) || 0;
      const caloriesB = Number(b.food?.calories) || 0;
      return caloriesB - caloriesA;
    });

    for (const ref of orderedRefs) {
      if (Math.abs(diff) <= 25) break;

      const currentCalories = Number(ref.food?.calories) || 0;
      const weight = totalFoodCalories > 0
        ? Math.max(0.08, currentCalories / totalFoodCalories)
        : 1 / orderedRefs.length;
      const desiredShare = diff * weight;
      const maxStep = getFoodAdjustmentLimit(ref.food);
      const actualDelta = nudgeFoodCalories(ref.food, desiredShare, maxStep);
      diff -= actualDelta;
    }

    balancedDay = recomputeMealTotals(balancedDay);
    currentTotal = balancedDay.meals.reduce((sum: number, meal: any) => sum + (Number(meal.total_calories) || 0), 0);
    diff = targetCalories - currentTotal;
  }

  return balancedDay;
};

const isSafeLabelForRestriction = (foodName: string, term: string): boolean => {
  const safePhrases = [
    `sin ${term}`,
    `libre de ${term}`,
    `free ${term}`,
    `${term} free`,
  ];

  return safePhrases.some((phrase) => foodName.includes(phrase));
};

const buildRestrictedTerms = (data: DietRequest): string[] => {
  const allergyTerms = (data.allergies || [])
    .map((item) => normalizeText(String(item).trim()))
    .filter(Boolean);

  const dietType = normalizeText(data.dietType || '');
  const byDietType: Record<string, string[]> = {
    vegan: ['carne', 'pollo', 'pavo', 'pescado', 'atun', 'salmon', 'huevo', 'leche', 'queso', 'yogur', 'marisco', 'miel'],
    vegetariana: ['carne', 'pollo', 'pavo', 'pescado', 'atun', 'salmon', 'marisco'],
    vegetarian: ['carne', 'pollo', 'pavo', 'pescado', 'atun', 'salmon', 'marisco'],
  };

  const dietTerms = Object.entries(byDietType)
    .filter(([key]) => dietType.includes(key))
    .flatMap(([, terms]) => terms);

  return [...new Set([...allergyTerms, ...dietTerms])]
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
};

const normalizeDayCalories = (day: any): any => {
  if (!day || !Array.isArray(day.meals)) return day;

  const meals = day.meals.map((meal: any) => {
    const foods = Array.isArray(meal.foods)
      ? meal.foods.map((food: any) => {
          const p = Number(food?.macros?.p) || 0;
          const f = Number(food?.macros?.f) || 0;
          const c = Number(food?.macros?.c) || 0;
          return {
            ...food,
            calories: calculateCalories(p, f, c),
            macros: { p, f, c },
          };
        })
      : [];

    const totalCalories = foods.reduce((sum: number, food: any) => sum + (Number(food.calories) || 0), 0);

    return {
      ...meal,
      foods,
      total_calories: totalCalories,
    };
  });

  return {
    ...day,
    meals,
  };
};

const validateDayQuality = (
  day: any,
  data: DietRequest,
  expectedMealNames: string[]
): string[] => {
  const issues: string[] = [];

  if (!Array.isArray(day?.meals) || day.meals.length !== data.mealsPerDay) {
    issues.push(`Debe tener exactamente ${data.mealsPerDay} comidas.`);
    return issues;
  }

  const actualNames = day.meals.map((meal: any) => String(meal?.meal_name || '').trim());
  expectedMealNames.forEach((expectedName, idx) => {
    if (actualNames[idx] !== expectedName) {
      issues.push(`La comida ${idx + 1} debe llamarse \"${expectedName}\".`);
    }
  });

  const restrictedTerms = buildRestrictedTerms(data);
  day.meals.forEach((meal: any, mealIndex: number) => {
    (meal.foods || []).forEach((food: any) => {
      const foodName = normalizeText(String(food?.name || ''));
      restrictedTerms.forEach((term) => {
        if (!term) return;
        if (isSafeLabelForRestriction(foodName, term)) return;
        if (foodName.includes(term)) {
          issues.push(`Se detectó alimento restringido en ${expectedMealNames[mealIndex]}: ${food.name}.`);
        }
      });
    });
  });

  let totalCalories = 0;
  let totalP = 0;
  let totalF = 0;
  let totalC = 0;

  day.meals.forEach((meal: any, idx: number) => {
    const foods = Array.isArray(meal.foods) ? meal.foods : [];
    const byFoodsCalories = foods.reduce((sum: number, food: any) => sum + (Number(food.calories) || 0), 0);
    const diffMeal = Math.abs((Number(meal.total_calories) || 0) - byFoodsCalories);

    if (diffMeal > 5) {
      issues.push(`La comida ${idx + 1} no cuadra calorías (diferencia ${diffMeal} kcal).`);
    }

    totalCalories += Number(meal.total_calories) || 0;
    foods.forEach((food: any) => {
      totalP += Number(food?.macros?.p) || 0;
      totalF += Number(food?.macros?.f) || 0;
      totalC += Number(food?.macros?.c) || 0;
    });
  });

  const caloriesTolerance = Math.max(60, Math.round(data.calories * 0.05));
  if (Math.abs(totalCalories - data.calories) > caloriesTolerance) {
    issues.push(`Calorías diarias fuera de tolerancia: ${totalCalories} kcal vs objetivo ${data.calories} kcal.`);
  }

  const pTolerance = Math.max(15, Math.round(data.proteins * 0.35));
  const fTolerance = Math.max(10, Math.round(data.fats * 0.35));
  const cTolerance = Math.max(20, Math.round(data.carbs * 0.35));

  if (Math.abs(totalP - data.proteins) > pTolerance) {
    issues.push(`Proteína diaria fuera de tolerancia: ${Math.round(totalP)} g vs objetivo ${data.proteins} g.`);
  }
  if (Math.abs(totalF - data.fats) > fTolerance) {
    issues.push(`Grasas diarias fuera de tolerancia: ${Math.round(totalF)} g vs objetivo ${data.fats} g.`);
  }
  if (Math.abs(totalC - data.carbs) > cTolerance) {
    issues.push(`Carbohidratos diarios fuera de tolerancia: ${Math.round(totalC)} g vs objetivo ${data.carbs} g.`);
  }

  return issues;
};

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
    - Calorías: ${data.calories} kcal
    - Proteínas: ${data.proteins} g
    - Grasas: ${data.fats} g
    - Carbohidratos: ${data.carbs} g

    DISTRIBUCIÓN:
    - ${data.mealsPerDay} comidas al día
    - Objetivo aproximado por comida: ${targetPerMeal} kcal
    - Nombres exactos de comidas (en orden): ${mealNamesStr}

    REGLAS CLÍNICO-PRÁCTICAS (OBLIGATORIAS):
    1. Seguridad primero: excluye por completo alergias/restricciones y respeta el tipo de dieta.
    2. Usa solo alimentos reales y comunes en supermercado/mercado local (sin marcas, sin suplementos inventados).
    3. Cada comida debe ser viable para vida real (preparación razonable y porciones realistas).
    4. Da preferencia a estos alimentos elegidos por el usuario: ${userFoodPreferences}
    5. Cada quantity debe tener formato con espacio: "100 g", "250 ml", "2 unidades".
    6. Idioma 100% español.

    REGLAS MATEMÁTICAS (AUDITORÍA ESTRICTA):
    1. calories por alimento = (p*4) + (c*4) + (f*9).
    2. total_calories por comida = suma exacta de calories de foods.
    3. Suma diaria de total_calories cercana al objetivo diario (máx ±8%).
    4. Macros diarios cercanos al objetivo (máx ±20%).

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

  const { selectedFoods } = data;

  const userFoodPreferences = formatFoodPreferences(selectedFoods);

  const isRecipeMode = data.suggestionType === 'recipes';

  const dayPrompt = `Genera solo un JSON para el día ${day} de un plan de dieta semanal con ${data.mealsPerDay} comidas. Usa estos datos del usuario:\n${JSON.stringify(data)}\n\nOBJETIVO PRINCIPAL:\nCrear un día de alimentación PERSONALIZADO según el objetivo (${data.goal}), calorías y macros objetivo, tipo de dieta (${data.dietType}) y alergias/restricciones (${JSON.stringify(data.allergies)}).\n\nREGLAS OBLIGATORIAS:\n- Devuelve exclusivamente JSON válido, sin texto adicional.\n- Las comidas deben ser exactamente: ${mealNamesStr}.\n- Debe haber exactamente ${data.mealsPerDay} comidas (ni más ni menos).\n- No fuerces platos de una gastronomía específica. Prioriza adherencia, practicidad y objetivo nutricional.\n- Si propones platos preparados o combinaciones, deben ser coherentes con el objetivo y las restricciones del usuario.\n- Nunca incluyas alimentos incompatibles con alergias/restricciones o tipo de dieta.\n- Los alimentos, platos preparados, combinaciones o bebidas deben ir solo en el array foods.\n- Usa alimentos reales en español y de disponibilidad común en supermercados/mercados (sin marcas, sin nombres inventados).\n- Las cantidades SIEMPRE deben tener espacio entre número y unidad (ejemplo: '100 g', '250 ml', '2 unidades').\n- Mantén consistencia calórica: total_calories por comida debe aproximar la suma de calorías de foods.\n- Mantén consistencia de macros: p, f y c deben ser valores numéricos realistas por alimento.\n\nEstructura ejemplo:\n{\n  \"day_number\": number,\n  \"meals\": [\n    {\n      \"meal_name\": string,\n      \"time_suggestion\": string,\n      \"total_calories\": number,\n      \"foods\": [\n        {\n          \"name\": string,\n          \"quantity\": string,\n          \"calories\": number,\n          \"macros\": {\"p\": number, \"f\": number, \"c\": number}\n        }\n      ],\n      \"tips\": string\n    }\n  ]\n}\n`;

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
          issue.includes('Se detectó alimento restringido') ||
          issue.includes('Debe tener exactamente') ||
          issue.includes('debe llamarse')
        );

        if (blockingIssues.length > 0 && i < retries - 1) {
          previousIssues = blockingIssues.join(' | ');
          console.warn(`Reintentando día ${day}... (Intento ${i + 2}) - ${previousIssues}`);
          continue;
        }

        if (blockingIssues.length > 0) {
          console.warn(`Día ${day} con incidencias de restricción tras reintentos: ${blockingIssues.join(' | ')}`);
        }

        const nonBlockingIssues = qualityIssues.filter((issue) => !blockingIssues.includes(issue));
        if (nonBlockingIssues.length > 0) {
          console.warn(`Día ${day} generado con desviaciones nutricionales moderadas: ${nonBlockingIssues.join(' | ')}`);
        }
      }

      return balancedDay;
    } catch (error) {
      previousIssues = error instanceof Error ? error.message : 'Error de validación desconocido';
      if (i === retries - 1) throw new Error(`Fallo crítico generando el día ${day}`);
      console.warn(`Reintentando día ${day}... (Intento ${i + 2}) - ${previousIssues}`);
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