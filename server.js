import cron from 'node-cron';
import axios from 'axios';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

const url = 'https://buscadordehipotecas.com/wp-json/gf/v2/entries';

//cron.schedule('0 */15 * * * *', () => getForm(), { scheduled: true, timezone: 'Europe/Madrid' });
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
        const { data } = await axios.get(request_data.url, { headers: { ...authHeader, Accept: 'application/json' } });
        getResponseAI(data.entries[0])
    } catch (err) {
        console.log(err)
    }
}

import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
async function getResponseAI(form) {
    const response = await openai.responses.create({
        prompt: {
            "id": "pmpt_686249db6f0c81949e5accec98e9e13907227395de25f1e6",
            "version": "3"
        },
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
    console.log(response.output_text)
}

