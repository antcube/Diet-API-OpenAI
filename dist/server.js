"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = __importDefault(require("./app"));
const PORT = process.env.PORT || 3000;
const server = app_1.default.listen(PORT, () => {
    console.log('---------------------------------------------------');
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log('---------------------------------------------------');
});
server.on('error', (err) => {
    console.error(`Error al iniciar el servidor: ${err}`);
});
//# sourceMappingURL=server.js.map