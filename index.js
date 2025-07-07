const express = require('express');
const cors = require('cors');           // opcional, pero útil si llamas desde otro dominio
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());                           // quítalo si no lo necesitas
app.use(express.json());                   // para peticiones con JSON
app.use(express.urlencoded({ extended: true })); // para application/x-www-form-urlencoded


app.get('/', (req, res) => {
    res.send('HBO Hipoteca Server');
});

app.get('/form/send', (req, res) => {
    res.status(200).json({
        status: 'ok',
        msg: 'Se ha recibido el body correctamente',
        data: req.body,
    });
});

app.listen(PORT);
