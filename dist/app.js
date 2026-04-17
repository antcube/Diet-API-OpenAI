"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dietPlanRoutes_1 = __importDefault(require("./routes/dietPlanRoutes"));
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Routes
app.use('/api', dietPlanRoutes_1.default);
app.get('/', (req, res) => {
    res.send('Infinity Health API Dieta con OpenAI');
});
// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});
// Middleware de manejo de errores
app.use((err, req, res, next) => {
    console.log(`Error: ${err.stack}`);
    res.status(500).json({ error: 'Ocurrió un error en el servidor' });
});
exports.default = app;
//# sourceMappingURL=app.js.map