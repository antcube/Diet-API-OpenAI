import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import dietPlanRoutes from './routes/dietPlanRoutes';

dotenv.config();

const app = express();

app.use(cors());

app.use(express.json());

app.use('/', dietPlanRoutes)

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('API de dieta con OpenAI');
})

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http:localhost:${PORT}`);
})