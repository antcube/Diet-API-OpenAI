import { Router } from 'express';
import { generateDietPlan } from '../services/openaiService';
import { DietRequest } from '../types';
import { DaysArraySchema } from '../services/zodDietSchemas';

const router = Router();

// Nueva ruta que divide la generación: resumen, días y recomendaciones
router.post('/calcMacros', async (req, res) => {
  try {
    const data: DietRequest = req.body;
    // 1. Generar plan_summary en backend
    const plan_summary = {
      total_calories: data.calories,
      macros_target: {
        proteins: data.proteins,
        fats: data.fats,
        carbs: data.carbs,
      },
      duration_days: data.planDays,
      diet_type: data.dietType,
    };

    // 2. Prompt solo para recomendaciones generales
    const recsPrompt = `Devuelve solo un array JSON de mínimo 2 y máximo 3 recomendaciones generales para un plan de dieta personalizado, siempre en español, nunca menos de 2 y nunca más de 3.\nEjemplo: [\"Mantente hidratado\", \"Incluye vegetales\", \"Evita azúcares\"]\n\nDatos del usuario:\n${JSON.stringify(data)}\n`;
    const recsJsonStr = await generateDietPlan(recsPrompt);
    let general_recommendations;
    try {
      general_recommendations = JSON.parse(recsJsonStr.replace(/```json|```/g, '').trim());
    } catch (e) {
      return res.status(500).json({ error: 'Error al parsear las recomendaciones generadas por OpenAI.' });
    }

    // 3. Prompts para cada día (en JSON) - en paralelo
    async function getDay(day: number, retries = 3): Promise<any> {
      // Encabezados fijos según mealsPerDay
      const mealNamesByCount = {
        3: ['Desayuno', 'Almuerzo', 'Cena'],
        4: ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'],
        5: ['Desayuno', 'Media Mañana', 'Almuerzo', 'Merienda', 'Cena'],
        6: ['Desayuno', 'Media Mañana', 'Almuerzo', 'Merienda', 'Cena', 'Snack Nocturno'],
        7: ['Desayuno', 'Media Mañana', 'Almuerzo', 'Merienda 1', 'Merienda 2', 'Cena', 'Snack Nocturno'],
      };
      const mealNames = mealNamesByCount[data.mealsPerDay] || Array.from({length: data.mealsPerDay}, (_,i)=>`Comida ${i+1}`);
      const mealNamesStr = mealNames.map((n,i)=>`${i+1}. ${n}`).join('\\n');

      const dayPrompt = `Devuelve solo un JSON para el # DAY ${day} de un plan de dieta semanal, con ${data.mealsPerDay} comidas, usando los siguientes datos:\n${JSON.stringify(data)}\n\nIMPORTANTE:\n- El campo meal_name debe ser uno de estos nombres fijos y en este orden para todas las comidas de todos los días:\n${mealNamesStr}\n- El orden de las comidas y los horarios deben ser siempre los mismos cada día.\n- En Desayuno, Almuerzo y Cena, la comida debe ser un plato preparado, típico peruano o una combinación balanceada (no solo ingredientes sueltos).\n- Los alimentos, platos preparados, combinaciones o bebidas deben ir solo en el array foods.\n- Usa solo alimentos accesibles y comprables en Perú (mercados, supermercados comunes).\n- Cuando sea posible, arma platos preparados o combinaciones típicas de la gastronomía peruana (ejemplo: lomo saltado, arroz con pollo, tacu tacu, ají de gallina, ensalada rusa, etc.), no solo ingredientes sueltos. Si no es posible, combina alimentos para formar una comida balanceada.\n- Es obligatorio que cada día tenga exactamente ${data.mealsPerDay} comidas. Si no puedes inventar una comida nueva, repite una de las anteriores para completar el número exacto de comidas.\n- Usa solo nombres de alimentos reales y en español, evita palabras inventadas, extranjeras o traducciones literales. Ejemplos válidos: huevo, pollo, arroz, zanahorias baby, hummus, palta, etc.\n- Las cantidades SIEMPRE deben tener un espacio entre el número y la unidad (ejemplo: '100 g', '250 ml', '2 unidades').\n\nEstructura ejemplo:\n{\n  \"day_number\": number,\n  \"meals\": [\n    {\n      \"meal_name\": string,\n      \"time_suggestion\": string,\n      \"total_calories\": number,\n      \"foods\": [\n        {\n          \"name\": string,\n          \"quantity\": string,\n          \"calories\": number,\n          \"macros\": {\"p\": number, \"f\": number, \"c\": number}\n        }\n      ],\n      \"tips\": string\n    }\n  ]\n}\n`;
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const dayJsonStr = await generateDietPlan(dayPrompt);
          const dayJson = JSON.parse(dayJsonStr.replace(/```json|```/g, '').trim());
          // Validar con Zod que el día tenga el número correcto de comidas
          const daySchema = DaysArraySchema(data.mealsPerDay).element;
          const valid = daySchema.safeParse(dayJson);
          if (valid.success && dayJson.meals.length === data.mealsPerDay) {
            return dayJson;
          }
        } catch (e) {
          // Continúa al siguiente intento
        }
      }
      throw new Error(`No se pudo generar el día ${day} con el número correcto de comidas tras varios intentos.`);
    }

    let days: any[] = [];
    try {
      days = await Promise.all(
        Array.from({ length: data.planDays }, (_, i) => getDay(i + 1, 3))
      );
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Error al generar los días del plan.' });
    }

    // 4. Validar estructura y cantidad de comidas con Zod
    const daysSchema = DaysArraySchema(data.mealsPerDay);
    const parseResult = daysSchema.safeParse(days);
    if (!parseResult.success) {
      return res.status(500).json({
        error: 'La respuesta de la IA no cumple con la estructura esperada.',
        issues: parseResult.error.issues,
      });
    }

    // 5. Unir todo en el formato NewDiet
    const newDiet = {
      status: 'success',
      content: {
        plan_summary,
        days,
        general_recommendations,
      },
    };
    res.json(newDiet);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al generar el plan de dieta' });
  }
});

export default router;
