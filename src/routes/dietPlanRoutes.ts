import { Router } from 'express';
import { DietRequest } from '../types';
import { DaysArraySchema } from '../services/zodDietSchemas';
import * as dietController from '../controllers/dietController';

const router = Router();

router.post('/calcMacros', dietController.generatePlan)

export default router;
