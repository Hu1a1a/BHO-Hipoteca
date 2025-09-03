const cron = require('node-cron');
const axios = require('axios');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const mail = require('./email');
const OpenAI = require('openai');
const path = require('path');
const db = require('./db');
const { createLead } = require('./zoho');
const { crearPdf } = require('./pdf');

const url = 'https://buscadordehipotecas.com/wp-json/gf/v2/entries';

function getUrgencia(entry) {
    return (["He firmado las arras", "Ya he firmado las arras", 'I’ve signed the deposit agreement'].includes(entry[5]) || entry[210]) ? "Urgente" : "No urgente"
}

async function getForm() {
    isRunning = true;
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
        const request_data = { url: url + '?form_ids=[4,10]&sorting[direction]=DESC', method: 'GET', };
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
                        Last_Name: entry.id,
                        Email: entry[42],
                        Phone: entry[41],
                        Lead_Status: "Nuevo",
                        Lead_Source: "Web",
                        Country: "España",
                        Street: entry[6],
                        Scoring_Global: 0, //Scoring global
                        LTV: parseInt(LTV * 100) || 0,
                        Fecha_de_creaci_n: new Date().toISOString().split("T")[0],
                        Urgencia_Lead: getUrgencia(entry),
                    }
                }
                // if (LTV < 0.5) error = "1. LTV menor del 50%"
                // else if (entry[5] === "Estoy buscando opciones") error = "2. Están buscando opciones"
                if (checkAge(entry[17]) || checkAge(entry[71]) || checkAge(entry[72])) error = "3. Menores de 18 o mayores de 60 años"
                else if (entry[115] < 1200) error = "4. Nómina inferior a 1200€"
                // else if (entry[18] === "Autónomo" && (entry[73] === "No" || entry[69] === "No" || entry[74] === "No")) error = "5. Autónomo no español/a"
                // else if (entry[18] === "Contrato temporal") error = "6. Trabajo temporal"
                if (error) {
                    leadData = {
                        ...leadData,
                        ...{
                            Last_Name: entry.id,
                            Rating: "No Viable",
                            Urgencia_Lead: "No urgente",
                            Lead_Status: "No viable",
                        }
                    }
                } else {
                    IAResponse = await getResponseAI(entry);
                    const output_text = JSON.parse(IAResponse.output_text
                        .replaceAll("json", "")
                        .replaceAll("`", "")
                        .replace(/\\n/g, '\\n')
                        .replace(/\“|\”/g, '"')
                        .replace(/\’/g, "'")
                        .replace(/,\s*}/g, '}')
                        .replace(/,\s*]/g, ']'))
                    leadData = {
                        ...leadData,
                        ...output_text.CRM,
                        ...{
                            Broker_asignado: [output_text.CRM.Broker_asignado],
                            PDF_IA_Resumen: process.env.API_LINK + "pdfs/" + IAResponse.id + ".pdf",
                            LTV: parseInt(LTV * 100) || 0,
                            Urgencia_Lead: getUrgencia(entry),
                        }
                    }
                    await crearPdf(output_text.PDF, path.join(__dirname, '../app/outputs/pdfs/' + IAResponse.id + '.pdf'));

                }

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
                        IAResponse ? IAResponse.output_text : null,
                        IAResponse ? 'IA' : error,
                        ZOHO_id
                    ]
                )
                if (error) {
                    await mail.enviarCorreo({
                        to: ['jorgeespallargas@hotmail.com', 'yang.ye.1@hotmail.com'],
                        subject: 'Buscador de Hipoteca ' + entry.id,
                        text: "Usuario rechazado, motivo: " + error,
                    })
                } else {
                    await mail.enviarCorreo({
                        to: ['jorgeespallargas@hotmail.com', 'yang.ye.1@hotmail.com'],
                        subject: 'Buscador de Hipoteca ' + IAResponse.id,
                        text: IAResponse.output_text,
                        attachments: ['app/outputs/pdfs/' + IAResponse.id + '.pdf']
                    })
                }
            } catch (e) {
                console.log(e)
                await mail.enviarCorreo({
                    to: ['yang.ye.1@hotmail.com'],
                    subject: 'Buscador de Hipoteca ERROR',
                    text: e
                })
            }
        }
    } catch (err) {
        console.log(err)
        await mail.enviarCorreo({
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
    try {
        return await openai.responses.create({
            model: 'gpt-4o',
            instructions:
                `
            ⚠️ Formato obligatorio: responde únicamente con un objeto JSON válido, directamente serializable usando JSON.stringify(). No incluyas ningún texto, explicación ni notas fuera del objeto.

            🔑 La respuesta debe contener exactamente dos claves principales:

            1. PDF: debe ser un objeto con una propiedad "content" que contenga un array de elementos válidos según el formato de pdfMake (por ejemplo: objetos con text, style, table, etc.). Este contenido se usará directamente para generar un informe en PDF sin necesidad de transformación adicional.

            2. CRM: debe ser un objeto que contenga la información estructurada y resumida del lead, útil para integrarse en el sistema de gestión comercial (CRM). Incluye datos como nombre, email, teléfono, LTV, scoring, clasificación, motivo, banco recomendado, urgencia, etc.

            ✅ La estructura final debe ser 100% válida para JSON.stringify() y apta para su uso directo en procesos de generación de PDF y registro en CRM.

            ` +
                (await axios.get('https://api.buscadordehipotecas.com/app/prompts/evaluacion_lead.txt')).data +
                "Las preguntas del inputs que esta en formato JSON.stringify() son las siguientes: " +
                JSON.stringify((await axios.get('https://api.buscadordehipotecas.com/app/prompts/preguntas.json')).data) +
                "Los datos de los bancos que esta en formato JSON.stringify() son los siguientes: " +
                JSON.stringify((await axios.get('https://api.buscadordehipotecas.com/app/policies/bancos.json')).data),
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
    } catch (error) {
        console.log(error)
    }
}

function checkAge(age) {
    if (!age) return false
    return age < 18 || age > 60
}
let isRunning = false;

cron.schedule('0 */1 * * * *', async () => {
    if (isRunning) return console.log('La tarea anterior sigue en ejecución. Se omite esta iteración.');
    try {
        await getForm();
    } catch (error) {
        console.error('Error ejecutando getForm:', error);
    } finally {
        isRunning = false;
    }
}, {
    scheduled: true,
    timezone: 'Europe/Madrid'
});
