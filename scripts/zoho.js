const axios = require('axios');
const cron = require('node-cron');
const qs = require('qs');
const mail = require('./email');
const db = require('./db');

const data = {
    client_id: process.env.ZOHO_CLIENT,
    client_secret: process.env.ZOHO_SECRET,
    refresh_token: process.env.ZOHO_TOKEN,
    grant_type: 'refresh_token'
};
let access_token = ""
getToken()

async function getToken() {
    try {
        const [[data]] = await db.query(`SELECT * from token WHERE id = 1`)
        access_token = data.token
    } catch (error) {
        mail.enviarCorreo({
            to: ['yang.ye.1@hotmail.com'],
            subject: 'Buscador de Hipoteca',
            text: "Error en el ZOHO CRM: " + JSON.stringify(error),
        })
    }
}

async function refreshToken() {
    try {
        access_token = (await axios.post('https://accounts.zoho.eu/oauth/v2/token', qs.stringify(data), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })).data.access_token
        db.query(`UPDATE token SET token = ? WHERE id = 1;`, [access_token])
    } catch (error) {
        console.log(error)
        mail.enviarCorreo({
            to: ['yang.ye.1@hotmail.com'],
            subject: 'Buscador de Hipoteca',
            text: "Error en el ZOHO CRM: " + JSON.stringify(error),
        })
    }
}
const leadData = {
    First_Name: "Laura",
    Last_Name: "García",
    Email: "laura@empresa.com",
    Phone: "666777888",
    Mobile: "600111222",
    Company: "Empresa de Prueba S.L.",
    Lead_Status: "Nuevo",
    Lead_Source: "Web",
    City: "Madrid",
    State: "Madrid",
    Zip_Code: "28001",
    Country: "España",
    Street: "Calle Ejemplo 123",
    No_of_Employees: 50,
    Annual_Revenue: 1000000,
    Industry: "Tecnología",
    Broker_asignado: [],
    Rating: null,
    Banco: "Banco Santander",
    Documentos_recibidos: "Sí",
    Description: null,
    Link_carpeta_Drive: null,
    Website: null,
    PDF_IA_Resumen: null,
    Edad_del_de_los_solicitantes: null,
    Edad_titular_2: null,
    Categor_a_Lead: null,
    Skype_ID: null,
    Twitter: null,
    Designation: null
};
async function createLead(leadData) {
    try {
        const response = await axios.post(
            'https://www.zohoapis.eu/crm/v2/Leads',
            { data: [leadData] },
            {
                headers: {
                    Authorization: `Zoho-oauthtoken ${access_token}`,
                    'Content-Type': 'application/json'
                }
            }
        )
        if (response.data.data[0].code !== "SUCCESS") throw JSON.stringify(response.data.data[0])
        return response.data.data[0].details.id
    } catch (error) {
        console.log(error)
        if (error.response?.status === 401) {
            await refreshToken()
            await createLead(leadData)
        } else {
            mail.enviarCorreo({
                to: ['yang.ye.1@hotmail.com'],
                subject: 'Buscador de Hipoteca',
                text: "Error en el ZOHO CRM: " + error,
            })
        }
    }
}
module.exports = { createLead };

cron.schedule('0 */50 * * * *', () => refreshToken(), { scheduled: true, timezone: 'Europe/Madrid' });
