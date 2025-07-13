const cron = require('node-cron');
const axios = require('axios');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const mail = require('./email');
const OpenAI = require('openai');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('./db');
const { createLead } = require('./zoho');

const url = 'https://buscadordehipotecas.com/wp-json/gf/v2/entries';

getForm()
async function getForm() {
    try {
        console.log("Empezando el procedimiento!")
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
        const request_data = { url: url + '?form_ids=4&sorting[direction]=DESC', method: 'GET', };
        const authHeader = oauth.toHeader(oauth.authorize(request_data));
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
            let leadData = {}
            let IAResponse = null
            let error = null
            try {
                console.log("Realizando analisis sobre el formulario: " + entry.id)
                const LTV = (entry[215] + entry[202] - entry[114] - entry[209]) / (entry[215] + entry[202]) || 0
                leadData = {
                    ...leadData,
                    ...{
                        First_Name: entry['40.3'].split(" ")[0],
                        Last_Name: entry['40.3'].split(" ")[1] || "-",
                        Email: entry[42],
                        Phone: entry[41],
                        Lead_Status: "Nuevo",
                        Lead_Source: "Web",
                        Country: "España",
                        Street: entry[6],
                        Description: JSON.stringify(entry),
                        Edad_del_de_los_solicitantes: 0, //Scoring global
                        Edad_titular_2: (LTV * 100).toFixed(0) || 0,
                        Fecha_de_creaci_n: new Date().toISOString().split("T")[0],
                        Categor_a_Lead: entry[5] = "Ya tengo elegida la vivienda" ? "Urgente" : "No urgente",

                    }
                }
                if (LTV < 0.5) throw "1. LTV menor del 50%"
                if (entry[5] === "Estoy buscando opciones") throw "2. Están buscando opciones"
                if (checkAge(entry[17]) || checkAge(entry[71]) || checkAge(entry[72])) throw "3. Menores de 18 o mayores de 60 años"
                if (entry[115] < 1200) throw "4. Nómina inferior a 1200€"
                if (entry[18] === "Autónomo" && (entry[73] === "No" || entry[69] === "No" || entry[74] === "No")) throw "5. Autónomo no español/a"
                if (entry[18] === "Contrato temporal") throw "6. Trabajo temporal"
                IAResponse = await getResponseAI(entry);
                leadData = {
                    ...leadData,
                    ...{
                        //  PDF_IA_Resumen: process.env.API_LINK + "pdfs/" + response.id + ".pdf",
                        Resumen_IA: IAResponse.output_text.slice(0, 2000),
                    }
                }
                mail.enviarCorreo({
                    to: ['jorgeespallargas@hotmail.com', 'yang.ye.1@hotmail.com'],
                    subject: 'Buscador de Hipoteca ' + IAResponse.id,
                    text: JSON.stringify(entry) + "\n" + IAResponse.output_text,
                    attachments: ['app/outputs/pdfs/' + IAResponse.id + '.pdf']
                })
                await crearPdf(data.entries + "<br>" + IAResponse.output_text, path.join(__dirname, '../app/outputs/pdfs/' + IAResponse.id + '.pdf'));
            } catch (e) {
                error = e
                leadData = {
                    ...leadData,
                    ...{
                        Rating: "No Viable",
                        Categor_a_Lead: "No urgente",
                        Lead_Status: "No viable",

                    }
                }
                mail.enviarCorreo({
                    to: ['jorgeespallargas@hotmail.com', 'yang.ye.1@hotmail.com'],
                    subject: 'Buscador de Hipoteca ' + entry.id,
                    text: "Usuario rechazado, motivo: " + error + "\n" + JSON.stringify(entry),
                })
            } finally {
                const ZOHO_id = await createLead(leadData)
                await db.query(
                    `INSERT INTO form (id, form, output, estado, zoho_id) 
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                    form = VALUES(form),
                    output = VALUES(output),
                    estado = VALUES(estado),
                    zoho_id = VALUES(zoho_id)`,
                    [
                        entry.id,
                        JSON.stringify(entry),
                        IAResponse ? JSON.stringify(IAResponse) : null,
                        IAResponse ? 'IA' : error,
                        ZOHO_id
                    ]
                )
            }
        }
    } catch (err) {
        console.log(err)
        mail.enviarCorreo({
            to: ['yang.ye.1@hotmail.com'],
            subject: 'Buscador de Hipoteca ERROR',
            text: err
        })
    }
    console.log("Se ha realizado todos con exito!")
}


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
async function getResponseAI(form) {
    return await openai.responses.create({
        model: 'gpt-4o-mini',
        instructions:
            JSON.stringify((await axios.get('https://api.buscadordehipotecas.com/app/policies/bancos.json')).data) +
            "Las preguntas del inputs son los siguientes: " +
            JSON.stringify((await axios.get('https://api.buscadordehipotecas.com/app/prompts/preguntas.json')).data) +
            "Los datos de los bancos son los siguientes: " +
            JSON.stringify((await axios.get('https://api.buscadordehipotecas.com/app/policies/bancos.json')).data)
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
}

function checkAge(age) {
    if (!age) return false
    return age < 18 || age > 60
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

cron.schedule('0 */5 * * * *', () => getForm(), { scheduled: true, timezone: 'Europe/Madrid' });
