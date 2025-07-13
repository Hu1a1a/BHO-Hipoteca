const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const app = express();
require('./scripts/server')
require('./scripts/zoho');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/pdfs', express.static(path.join(__dirname, 'app/outputs/pdfs')));

app.get('/', (req, res) => {
    console.log(req)
    res.send('HBO Hipoteca Server');
});

app.use(express.static(path.join(__dirname, 'app')));

app.listen(3000);
