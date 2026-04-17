import { DietRequest } from '../types';
export declare const getCompleteDietPlan: (data: DietRequest) => Promise<{
    days: any[];
    general_recommendations: string[];
}>;
