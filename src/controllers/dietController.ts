import { NextFunction, Request, Response } from 'express';
import type { DietRequest } from '../types';
import * as dietService from '../services/openaiService';

export const generatePlan = async (req: Request, res: Response, next: NextFunction) => {
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

        // 2. Llamada al servicio
        const { days, general_recommendations } = await dietService.getCompleteDietPlan(data);

        // 3. El controller responde al cliente
        return res.json({
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

