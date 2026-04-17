/* 1. Sistema Atwater: 1g Proteína/Carbo = 4 kcal, 1g Grasa = 9 kcal */
export const calculateCalories = (p: number, f: number, c: number): number =>
  Math.round((p * 4) + (c * 4) + (f * 9));

/* 2. Redondeo limpio a 1 decimal para los macros */
export const roundMacro = (value: number): number => Math.round(value * 10) / 10;

/* 3. Recalcula las calorías totales de cada comida basándose en sus macros reales */
export const recomputeMealTotals = (day: any): any => {
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

/* 4. "Empuja" (nudge) las calorías de un alimento sumando o restando macros sutilmente */
const nudgeFoodCalories = (food: any, deltaKcal: number, maxDeltaKcal: number): number => {
  if (!food?.macros) return 0;

  // Obtenemos las calorias actuales basadas en macros para referencia
  const currentCalories = Number(food.calories) || calculateCalories(food.macros.p, food.macros.f, food.macros.c);

  if(currentCalories <= 0) return 0; // No ajustamos alimentos sin calorías claras

  // Calculamos el ajuste real respetando el límite máximo
  const requestedDelta = Math.sign(deltaKcal) * Math.min(Math.abs(deltaKcal), maxDeltaKcal);

  // Calculamos el factor de ajuste proporcional a los macros actuales
  const scaleFactor = 1 + (requestedDelta / currentCalories);

  food.macros = {
    p: roundMacro(Number(food.macros.p) * scaleFactor),
    f: roundMacro(Number(food.macros.f) * scaleFactor),
    c: roundMacro(Number(food.macros.c) * scaleFactor),
  };

  const kcalAfter = calculateCalories(food.macros.p, food.macros.f, food.macros.c);
  food.calories = kcalAfter;

  return kcalAfter - currentCalories;
};

/* 5. Define cuánto se puede alterar un alimento sin que parezca irreal */
const getFoodAdjustmentLimit = (food: any): number => {
  const currentCalories = Number(food?.calories) || 0;
  return Math.max(18, Math.round(currentCalories * 0.12)); // Máximo un 12% de cambio
};

/* 6. LA FUNCIÓN MAESTRA: Toma el día entero y lo cuadra a la meta diaria */
export const rebalanceDayToTargetCalories = (day: any, targetCalories: number): any => {
  if (!day || !Array.isArray(day.meals) || day.meals.length === 0) return day;

  let balancedDay = recomputeMealTotals(day);
  let currentTotal = balancedDay.meals.reduce((sum: number, meal: any) => sum + (Number(meal.total_calories) || 0), 0);
  let diff = targetCalories - currentTotal;

  // Si la diferencia es menor a 25 kcal, lo dejamos pasar (es humano)
  if (Math.abs(diff) <= 25) return balancedDay;

  // Hacemos hasta 5 "pasadas" para ir ajustando poco a poco los alimentos
  for (let pass = 0; pass < 5 && Math.abs(diff) > 25; pass++) {
    const foodRefs = balancedDay.meals.flatMap((meal: any, mealIndex: number) =>
      (Array.isArray(meal.foods) ? meal.foods : []).map((food: any, foodIndex: number) => ({
        mealIndex, foodIndex, food,
      }))
    );

    if (foodRefs.length === 0) break;

    const totalFoodCalories = foodRefs.reduce((sum: number, item: any) => sum + (Number(item.food?.calories) || 0), 0);

    // Ordenamos de mayor a menor caloría (ajustamos los platos grandes primero)
    const orderedRefs = [...foodRefs].sort((a: any, b: any) => {
      const caloriesA = Number(a.food?.calories) || 0;
      const caloriesB = Number(b.food?.calories) || 0;
      return caloriesB - caloriesA;
    });

    for (const ref of orderedRefs) {
      if (Math.abs(diff) <= 25) break;

      const currentCalories = Number(ref.food?.calories) || 0;
      const weight = totalFoodCalories > 0 ? Math.max(0.08, currentCalories / totalFoodCalories) : 1 / orderedRefs.length;
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

/* 7. Normaliza el día completo recién sale de la IA */
export const normalizeDayCalories = (day: any): any => {
  if (!day || !Array.isArray(day.meals)) return day;

  const meals = day.meals.map((meal: any) => {
    const foods = Array.isArray(meal.foods) ? meal.foods.map((food: any) => {
          const p = Number(food?.macros?.p) || 0;
          const f = Number(food?.macros?.f) || 0;
          const c = Number(food?.macros?.c) || 0;
          return { ...food, calories: calculateCalories(p, f, c), macros: { p, f, c } };
        }) : [];

    const totalCalories = foods.reduce((sum: number, food: any) => sum + (Number(food.calories) || 0), 0);

    return { ...meal, foods, total_calories: totalCalories };
  });

  return { ...day, meals };
};