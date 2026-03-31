import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log('---------------------------------------------------');
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log('---------------------------------------------------');
});

server.on('error', (err) => {
    console.error(`Error al iniciar el servidor: ${err}`);
})