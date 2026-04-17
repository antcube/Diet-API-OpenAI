import { DietRequest } from '../types';
export declare const buildRestrictedTerms: (data: DietRequest) => string[];
export declare const validateDayQuality: (day: any, data: DietRequest, expectedMealNames: string[]) => string[];
