import { z } from 'zod';

const NonEmptyTextSchema = z.string().trim().min(1);
const AllergyOptionSchema = z.enum(['lacteos', 'gluten', 'frutos-secos']);

const SelectedFoodsSchema = z.object({
  proteins: z.array(NonEmptyTextSchema).default([]),
  carbohydrates: z.array(NonEmptyTextSchema).default([]),
  fats: z.array(NonEmptyTextSchema).default([]),
  dairy: z.array(NonEmptyTextSchema).default([]),
  fruits: z.array(NonEmptyTextSchema).default([]),
  vegetables: z.array(NonEmptyTextSchema).default([]),
  seasonings: z.array(NonEmptyTextSchema).default([]),
});

export const DietRequestSchema = z.object({
  calories: z.coerce.number().positive().max(10000),
  proteins: z.coerce.number().min(0).max(1000),
  fats: z.coerce.number().min(0).max(500),
  carbs: z.coerce.number().min(0).max(1500),
  name: NonEmptyTextSchema,
  goal: NonEmptyTextSchema,
  gender: NonEmptyTextSchema,
  age: z.coerce.number().int().min(1).max(120),
  weight: z.coerce.number().positive().max(500),
  height: z.coerce.number().positive().max(280),
  activity: NonEmptyTextSchema,
  mealsPerDay: z.coerce.number().int().min(3, 'mealsPerDay debe estar entre 3 y 6').max(6, 'mealsPerDay debe estar entre 3 y 6'),
  planDays: z.coerce.number().int().min(1, 'planDays debe estar entre 1 y 7').max(7, 'planDays debe estar entre 1 y 7'),
  dietType: NonEmptyTextSchema,
  allergies: z.array(AllergyOptionSchema).default([]),
  suggestionType: z.enum(['recipes', 'ingredients']),
  selectedFoods: SelectedFoodsSchema,
});

const RecipeDetailsSchema = z.object({
  plate_name: z.string(),
  instructions: z.array(z.string()),
  prep_time: z.string().optional(),
});

export const FoodSchema = z.object({
  name: z.string().min(2),
  quantity: z.string().min(1),
  calories: z.number().min(0),
  macros: z.object({
    p: z.number().min(0),
    f: z.number().min(0),
    c: z.number().min(0),
  }),
  recipe: RecipeDetailsSchema.optional(),
});

export const MealSchema = z.object({
  meal_name: z.string().min(2),
  time_suggestion: z.string().optional(),
  total_calories: z.number().min(0),
  foods: z.array(FoodSchema).min(1),
  tips: z.string().optional(),
});

export const DaySchema = z.object({
  day_number: z.number().min(1),
  meals: z.array(MealSchema),
});

export const DaysArraySchema = (mealsPerDay: number) =>
  z.array(DaySchema).superRefine((days, ctx) => {
    days.forEach((day, idx) => {
      if (day.meals.length !== mealsPerDay) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `El día ${day.day_number} tiene ${day.meals.length} comidas, pero se esperaban ${mealsPerDay}.`,
          path: [idx, 'meals'],
        });
      }
    });
  });

export const RecommendationsSchema = z.object({
  recommendations: z.array(z.string().min(5))
});