"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecommendationsSchema = exports.DaysArraySchema = exports.DaySchema = exports.MealSchema = exports.FoodSchema = void 0;
const zod_1 = require("zod");
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