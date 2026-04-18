"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecommendationsSchema = exports.DaysArraySchema = exports.DaySchema = exports.MealSchema = exports.FoodSchema = exports.DietRequestSchema = void 0;
const zod_1 = require("zod");
const NonEmptyTextSchema = zod_1.z.string().trim().min(1);
const AllergyOptionSchema = zod_1.z.enum(['lacteos', 'gluten', 'frutos-secos']);
const SelectedFoodsSchema = zod_1.z.object({
    proteins: zod_1.z.array(NonEmptyTextSchema).default([]),
    carbohydrates: zod_1.z.array(NonEmptyTextSchema).default([]),
    fats: zod_1.z.array(NonEmptyTextSchema).default([]),
    dairy: zod_1.z.array(NonEmptyTextSchema).default([]),
    fruits: zod_1.z.array(NonEmptyTextSchema).default([]),
    vegetables: zod_1.z.array(NonEmptyTextSchema).default([]),
    seasonings: zod_1.z.array(NonEmptyTextSchema).default([]),
});
exports.DietRequestSchema = zod_1.z.object({
    calories: zod_1.z.coerce.number().positive().max(10000),
    proteins: zod_1.z.coerce.number().min(0).max(1000),
    fats: zod_1.z.coerce.number().min(0).max(500),
    carbs: zod_1.z.coerce.number().min(0).max(1500),
    name: NonEmptyTextSchema,
    goal: NonEmptyTextSchema,
    gender: NonEmptyTextSchema,
    age: zod_1.z.coerce.number().int().min(1).max(120),
    weight: zod_1.z.coerce.number().positive().max(500),
    height: zod_1.z.coerce.number().positive().max(280),
    activity: NonEmptyTextSchema,
    mealsPerDay: zod_1.z.coerce.number().int().min(3, 'mealsPerDay debe estar entre 3 y 6').max(6, 'mealsPerDay debe estar entre 3 y 6'),
    planDays: zod_1.z.coerce.number().int().min(1, 'planDays debe estar entre 1 y 7').max(7, 'planDays debe estar entre 1 y 7'),
    dietType: NonEmptyTextSchema,
    allergies: zod_1.z.array(AllergyOptionSchema).default([]),
    suggestionType: zod_1.z.enum(['recipes', 'ingredients']),
    selectedFoods: SelectedFoodsSchema,
});
const RecipeDetailsSchema = zod_1.z.object({
    plate_name: zod_1.z.string(),
    instructions: zod_1.z.array(zod_1.z.string()),
    prep_time: zod_1.z.string().optional(),
});
exports.FoodSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    quantity: zod_1.z.string().min(1),
    calories: zod_1.z.number().min(0),
    macros: zod_1.z.object({
        p: zod_1.z.number().min(0),
        f: zod_1.z.number().min(0),
        c: zod_1.z.number().min(0),
    }),
    recipe: RecipeDetailsSchema.optional(),
});
exports.MealSchema = zod_1.z.object({
    meal_name: zod_1.z.string().min(2),
    time_suggestion: zod_1.z.string().optional(),
    total_calories: zod_1.z.number().min(0),
    foods: zod_1.z.array(exports.FoodSchema).min(1),
    tips: zod_1.z.string().optional(),
});
exports.DaySchema = zod_1.z.object({
    day_number: zod_1.z.number().min(1),
    meals: zod_1.z.array(exports.MealSchema),
});
const DaysArraySchema = (mealsPerDay) => zod_1.z.array(exports.DaySchema).superRefine((days, ctx) => {
    days.forEach((day, idx) => {
        if (day.meals.length !== mealsPerDay) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: `El día ${day.day_number} tiene ${day.meals.length} comidas, pero se esperaban ${mealsPerDay}.`,
                path: [idx, 'meals'],
            });
        }
    });
});
exports.DaysArraySchema = DaysArraySchema;
exports.RecommendationsSchema = zod_1.z.object({
    recommendations: zod_1.z.array(zod_1.z.string().min(5))
});
//# sourceMappingURL=zodDietSchemas.js.map