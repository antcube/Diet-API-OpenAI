export interface CalculatorResults {
  calories: number;
  proteins: number;
  fats: number;
  carbs: number;
  name: string;
  goal: string;
}

export interface NutritionPlanInput extends CalculatorResults {
  gender: string;
  age: number;
  weight: number;
  height: number;
  activity: string;
}

export interface DietPreferences {
  mealsPerDay: number;
  planDays: number;
  dietType: string;
  allergies: string[];
}

export interface DietRequest extends NutritionPlanInput, DietPreferences {}