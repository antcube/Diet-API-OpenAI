import { Router } from 'express';
import * as dietController from '../controllers/dietController';

const router = Router();

router.post('/calcMacros', dietController.generatePlan)

export default router;
