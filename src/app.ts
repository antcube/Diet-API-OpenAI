import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dietPlanRoutes from './routes/dietPlanRoutes';

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', dietPlanRoutes);

app.get('/', (req: Request, res: Response) => {
    res.send('Infinity Health API Dieta con OpenAI');
});

// Manejo de rutas no encontradas
app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// Middleware de manejo de errores
app.use((err: any, req: Request, res: Response, next: any) => {
    console.log(`Error: ${err.stack}`);
    res.status(500).json({ error: 'Ocurrió un error en el servidor' });
});

export default app;