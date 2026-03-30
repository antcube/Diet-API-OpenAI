import { z } from 'zod';

export const FoodSchema = z.object({
  name: z.string().min(2),
  quantity: z.string().min(1),
  calories: z.number().min(0),
  macros: z.object({
    p: z.number().min(0),
    f: z.number().min(0),
    c: z.number().min(0),
  }),
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
