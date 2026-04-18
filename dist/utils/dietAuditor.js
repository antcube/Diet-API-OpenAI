"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDayQuality = exports.buildRestrictedTerms = void 0;
/* 1. Normaliza texto quitando tildes y mayúsculas para comparaciones seguras */
const normalizeText = (value) => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
/* 2. Verifica si un alimento tiene un nombre "seguro" (ej: "Leche de almendras" es seguro aunque contenga la palabra "leche") */
const isSafeLabelForRestriction = (foodName, term) => {
    const safePhrases = [
        `sin ${term}`,
        `libre de ${term}`,
        `free ${term}`,
        `${term} free`,
    ];
    if (safePhrases.some((phrase) => foodName.includes(phrase)))
        return true;
    // Excepciones específicas SOLO para la familia de los lácteos
    const dairyTerms = ['leche', 'queso', 'yogur', 'yogurt', 'mantequilla', 'nata', 'crema', 'suero', 'lacteo', 'lactosa'];
    if (dairyTerms.includes(term)) {
        const plantBasedOrigins = [
            'de almendra', 'de almendras', 'de soja', 'de soya', 'de avena', 'de coco',
            'vegetal', 'sin leche', 'milk free', 'de mani', 'de cacahuate',
            'sin lacteos', 'sin lactosa', 'vegano', 'vegana'
        ];
        if (plantBasedOrigins.some((phrase) => foodName.includes(phrase)))
            return true;
    }
    // Excepciones específicas para gluten (ej: "Pan sin gluten", "Harina de trigo sarraceno")
    const glutenTerms = ['pan', 'pasta', 'harina', 'galleta', 'trigo', 'gluten'];
    if (glutenTerms.includes(term)) {
        const glutenFreeOrigins = [
            'sin gluten', 'gluten free', 'de arroz', 'de maiz',
            'de almendra', 'de coco', 'de yuca', 'de avena', 'integral sin gluten'
        ];
        if (glutenFreeOrigins.some((phrase) => foodName.includes(phrase)))
            return true;
    }
    return false;
};
/* 3. Construye la "Lista Negra" de palabras prohibidas basada en alergias y tipo de dieta */
const buildRestrictedTerms = (data) => {
    // 3.1 Procesar alergias explícitas
    const allergyList = (data.allergies || [])
        .map((item) => normalizeText(String(item).trim()))
        .filter(Boolean);
    const byAllergy = {
        lacteos: ['leche', 'queso', 'yogur', 'yogurt', 'mantequilla', 'nata', 'crema', 'suero'],
        gluten: ['trigo', 'pan', 'pasta', 'harina', 'cebada', 'centeno', 'avena', 'galleta'],
        'frutos-secos': ['almendra', 'nuez', 'nueces', 'mani', 'cacahuate', 'avellana', 'pistacho', 'pecana', 'maranon']
    };
    const allergyTerms = allergyList.flatMap(allergy => {
        return byAllergy[allergy] || [allergy];
    });
    // 3.2 Procesar restricciones por tipo de dieta
    const dietType = normalizeText(data.dietType || '');
    const byDietType = {
        vegano: ['carne', 'pollo', 'pavo', 'pescado', 'atun', 'salmon', 'huevo', 'leche', 'queso', 'yogur', 'mantequilla', 'marisco', 'miel', 'cerdo', 'res'],
        vegetariano: ['carne', 'pollo', 'pavo', 'pescado', 'atun', 'salmon', 'marisco', 'cerdo', 'res'],
        pescetariano: ['carne', 'pollo', 'pavo', 'cerdo', 'res'],
    };
    const dietTerms = Object.entries(byDietType)
        .filter(([key]) => dietType.includes(key))
        .flatMap(([, terms]) => terms);
    // 3.3 Unir, eliminar duplicados y términos muy cortos
    return [...new Set([...allergyTerms, ...dietTerms])]
        .map((term) => term.trim())
        .filter((term) => term.length >= 3);
};
exports.buildRestrictedTerms = buildRestrictedTerms;
/* 4. LA FUNCIÓN PRINCIPAL: Revisa el JSON generado por la IA buscando errores críticos o desviaciones */
const validateDayQuality = (day, data, expectedMealNames) => {
    const issues = [];
    // A. Validación de Estructura Básica
    if (!Array.isArray(day?.meals) || day.meals.length !== data.mealsPerDay) {
        issues.push(`Estructura: Debe tener exactamente ${data.mealsPerDay} comidas.`);
        return issues; // Error crítico, abortar validación extra
    }
    // B. Validación de Nombres de Comidas
    const actualNames = day.meals.map((meal) => String(meal?.meal_name || '').trim());
    expectedMealNames.forEach((expectedName, idx) => {
        if (actualNames[idx] !== expectedName) {
            issues.push(`Formato: La comida ${idx + 1} debe llamarse "${expectedName}", pero se llamó "${actualNames[idx]}".`);
        }
    });
    // C. Validación de Restricciones y Alergias (¡Vital para la salud!)
    const restrictedTerms = (0, exports.buildRestrictedTerms)(data);
    day.meals.forEach((meal, mealIndex) => {
        (meal.foods || []).forEach((food) => {
            // Si es receta, revisamos el nombre de la receta Y los ingredientes. Si no, solo el nombre.
            const textsToCheck = [food.name];
            if (food.recipe) {
                textsToCheck.push(food.recipe.plate_name);
                textsToCheck.push(...food.recipe.instructions);
            }
            const fullText = normalizeText(textsToCheck.join(' '));
            restrictedTerms.forEach((term) => {
                if (!term)
                    return;
                // Si el término prohibido está, pero está en un contexto seguro (ej: "sin azúcar"), lo ignoramos
                if (isSafeLabelForRestriction(fullText, term))
                    return;
                const regex = new RegExp(`\\b${term}\\b`, 'i');
                if (regex.test(fullText)) {
                    issues.push(`Clínico: Se detectó alimento restringido ("${term}") en ${expectedMealNames[mealIndex]} (Elemento: ${food.name || food.recipe?.plate_name}).`);
                }
            });
        });
    });
    // D. Validación Matemática (Tolerancias)
    let totalCalories = 0, totalP = 0, totalF = 0, totalC = 0;
    day.meals.forEach((meal, idx) => {
        const foods = Array.isArray(meal.foods) ? meal.foods : [];
        // Sumamos la data de la comida
        totalCalories += Number(meal.total_calories) || 0;
        foods.forEach((food) => {
            totalP += Number(food?.macros?.p) || 0;
            totalF += Number(food?.macros?.f) || 0;
            totalC += Number(food?.macros?.c) || 0;
        });
    });
    // Establecer límites de tolerancia (5% para calorías, 10% para proteínas, 15% para grasas y carbohidratos, con mínimos absolutos)
    const caloriesTolerance = Math.max(50, Math.round(data.calories * 0.05));
    const pTolerance = Math.max(8, Math.round(data.proteins * 0.10));
    const fTolerance = Math.max(5, Math.round(data.fats * 0.15));
    const cTolerance = Math.max(15, Math.round(data.carbs * 0.15));
    if (Math.abs(totalCalories - data.calories) > caloriesTolerance) {
        issues.push(`Matemática: Calorías diarias fuera de tolerancia (${totalCalories} vs meta ${data.calories}).`);
    }
    if (Math.abs(totalP - data.proteins) > pTolerance) {
        issues.push(`Matemática: Proteína fuera de rango (${Math.round(totalP)}g vs meta ${data.proteins}g).`);
    }
    if (Math.abs(totalF - data.fats) > fTolerance) {
        issues.push(`Matemática: Grasas fuera de rango (${Math.round(totalF)}g vs meta ${data.fats}g).`);
    }
    if (Math.abs(totalC - data.carbs) > cTolerance) {
        issues.push(`Matemática: Carbohidratos fuera de rango (${Math.round(totalC)}g vs meta ${data.carbs}g).`);
    }
    return issues;
};
exports.validateDayQuality = validateDayQuality;
//# sourceMappingURL=dietAuditor.js.map