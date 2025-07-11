const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
require('./scripts/server')
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get('/', (req, res) => {
    res.send('HBO Hipoteca Server');
});

app.use(express.static(path.join(__dirname, 'app')));

app.listen(3000);
