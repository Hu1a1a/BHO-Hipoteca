const cron = require('node-cron');
const axios = require('axios');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const mail = require('./email');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('./db');

const prompt = path.join(__dirname, '../app/prompts/evaluacion_lead.txt');
const preguntas = path.join(__dirname, '../app/prompts/preguntas.json');
const banco = path.join(__dirname, '../app/policies/bancos.json');

const url = 'https://buscadordehipotecas.com/wp-json/gf/v2/entries';

cron.schedule('0 */5 * * * *', () => getForm(), { scheduled: true, timezone: 'Europe/Madrid' });
const oauth = new OAuth({
    consumer: { key: process.env.GRAVITY_KEY, secret: process.env.GRAVITY_SECRET },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
        return crypto
            .createHmac('sha1', key)
            .update(base_string)
            .digest('base64');
    }
});
const request_data = {
    url: url + '?form_ids=4',
    method: 'GET'
};
const authHeader = oauth.toHeader(oauth.authorize(request_data));

async function getForm() {
    try {
        console.log("Empezando el procedimiento!")
        const { data } = await axios.get(request_data.url, { headers: { ...authHeader, Accept: 'application/json' } });
        const entryIds = (data?.entries || []).map(e => e.id);
        if (entryIds.length === 0) return;
        const placeholders = entryIds.map(() => '?').join(',');
        const [rows] = await db.query(
            `SELECT id FROM form WHERE id IN (${placeholders})`,
            entryIds
        );
        const existentes = rows.map(r => r.id);
        for (const entry of data.entries) {
            if (existentes.some(a => a == entry.id)) continue;
            console.log("Realizando analisis sobre el formulario: " + entry.id)
            const output = await getResponseAI(entry);
            await db.query(
                'INSERT INTO form (id, form, output) VALUES (?, ?, ?)',
                [
                    entry.id,
                    JSON.stringify(entry),
                    JSON.stringify(output)
                ]
            );
        }
    } catch (err) {
        console.log(err)
    }
    console.log("Se ha realizado todos con exito!")
}


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
async function getResponseAI(form) {
    const response = await openai.responses.create({
        model: 'gpt-4o-mini',
        instructions:
            await fs.readFile(prompt, 'utf8') +
            "Las preguntas del inputs son los siguientes: " +
            await fs.readFile(preguntas, 'utf8') + "Los datos de los bancos son los siguientes: " +
            await fs.readFile(banco, 'utf8')
        ,
        input: [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": JSON.stringify(form)
                    }
                ]
            }
        ],
        reasoning: {},
        max_output_tokens: 2048,
        store: true
    });
    mail.enviarCorreo({
        to: 'jorgeespallargas@hotmail.com',
        subject: 'Buscador de Hipoteca ' + response.id,
        text: response.output_text,
        attachments: ['app/outputs/pdfs/' + response.id + '.pdf']
    })
    const pdfPath = path.join(__dirname, '../app/outputs/pdfs/' + response.id + '.pdf');
    await crearPdf(response.output_text, pdfPath);
    return response.output_text
}

function crearPdf(texto, outputPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const stream = require('fs').createWriteStream(outputPath);

        doc.pipe(stream);
        doc.fontSize(12).text(texto, { align: 'left' });
        doc.end();

        stream.on('finish', () => resolve(outputPath));
        stream.on('error', reject);
    });
}