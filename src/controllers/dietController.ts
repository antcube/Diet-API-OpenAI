import { NextFunction, Request, Response } from 'express';
import type { DietRequest } from '../types';
import * as dietService from '../services/openaiService';
import { DietRequestSchema } from '../schemas/zodDietSchemas';

export const generatePlan = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = DietRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                status: 'error',
                message: 'Datos de entrada inválidos',
                issues: parsed.error.issues.map((issue) => ({
                    path: issue.path.join('.'),
                    message: issue.message,
                })),
            });
        }

        const data: DietRequest = parsed.data;
        
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

        // 2. Llamada al servicio
        const { days, general_recommendations } = await dietService.getCompleteDietPlan(data);

        // 3. El controller responde al cliente
        return res.status(200).json({
            status: 'success',
            content: {
                plan_summary,
                days,
                general_recommendations,
            }
        });
    } catch (error) {
        // 4. Pasar el error al middleware de manejo de errores
        next(error);
    }
}

