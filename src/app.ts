import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dietPlanRoutes from './routes/dietPlanRoutes';
import rateLimit from 'express-rate-limit';

const app: Application = express();

const isProduction = process.env.NODE_ENV === 'production';
const allowRequestsWithoutOrigin =
    !isProduction || process.env.ALLOW_REQUESTS_WITHOUT_ORIGIN === 'true';

const whitelist = isProduction 
    ? (process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS
            .split(',')
        : [])
    : ['http://localhost:3000', 'http://localhost:5174'];

const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
        if (!origin && allowRequestsWithoutOrigin) {
            return callback(null, true);
        }

        if (whitelist.includes(origin || '')) {
            callback(null, true);
        } else {
            console.error(`CORS bloqueó una petición desde: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: {
        status: 'error',
        message: 'Demasiadas solicitudes desde esta IP, por favor intenta de nuevo más tarde.',
    },
    standardHeaders: true,
    legacyHeaders: false,
})

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(limiter);

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