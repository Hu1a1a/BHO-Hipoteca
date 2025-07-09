const cron = require('node-cron');
const axios = require('axios');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const mail = require('./email');
const OpenAI = require('openai');



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

getForm()
async function getForm() {
    try {
        const { data } = await axios.get(request_data.url, { headers: { ...authHeader, Accept: 'application/json' } });
        getResponseAI(data.entries[0])
    } catch (err) {
        console.log(err)
    }
}


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
async function getResponseAI(form) {
    const response = await openai.responses.create({
        model: 'gpt-4o-mini',                    // el modelo que prefieras
        instructions: `
Prompt de Análisis para IA
Archivo: /prompts/evaluacion_lead.txt
Fecha: 2025-07-05

Eres un analista hipotecario sénior en banca española.
Tu tarea es analizar el perfil completo de un usuario que solicita una hipoteca, compararlo con las políticas de los 13 principales bancos españoles (adjuntas en formato JSON estructurado), y entregar un informe profesional, riguroso y fácilmente exportable.

Sigue estrictamente estos pasos:

Analiza todos los datos de entrada del usuario, sin omitir ninguno.

Clasifica el caso en una de estas categorías:

“Viable”

“Mejorable”

“No viable”

Si el usuario ha firmado arras, añade siempre la subetiqueta “Urgente”.

Si la clasificación es “Mejorable” o “No viable”, añade SIEMPRE subetiquetas explicando el/los motivos principales (ejemplo: “Ahorro insuficiente”, “Contrato temporal no admitido”, “Deuda excesiva”, “Antigüedad insuficiente”, “Falta de aval”, “Ingresos insuficientes”...).

Para cada banco, estima el porcentaje de éxito del lead y justifica técnica y claramente la decisión (motivo, condiciones, exclusiones relevantes).

Si hay incertidumbre (por datos límite, perfil atípico o política ambigua), añade el campo "requiere_revision_manual": true y explica el motivo en "motivo_incertidumbre".

Devuelve siempre todos los datos de entrada del usuario junto al análisis, para auditoría y exportación a CRM.

La salida debe ser SIEMPRE JSON válido, siguiendo exactamente este esquema y sin errores de formato:


{
    "input_usuario": {...
    }, // Incluye todos los campos del cuestionario
    "viabilidad_general": "...",
    "subetiquetas": [
        "..."
    ],
    "urgente": true/false,
    "scoring_cliente": ...,
    "matching_bancario": [
        {
            "banco": "...",
            "porcentaje_exito": ...,
            "motivo": "..."
        },
        // ...
    ],
    "recomendaciones": [
        "..."
    ],
    "explicacion_detallada": "...",
    "requiere_revision_manual": true/false,
    "motivo_incertidumbre": null
}
Nunca generes comentarios, explicaciones ni texto fuera del JSON. Si falta algún dato clave, indícalo en motivo_incertidumbre y marca requiere_revision_manual como true.

Notas para IA:

No omitas ningún banco ni ningún campo obligatorio.

Sé riguroso, preciso y profesional en el análisis.

No inventes datos ni rellenes valores ficticios si faltan datos de entrada.

Si un perfil es dudoso, prioriza la cautela y recomienda revisión manual.

Fin del prompt profesional para IA.

[
    {
        "nombre": "ING",
        "productos": [
            {
                "tipo": "primera_vivienda",
                "LTV_max": 80,
                "LTV_joven": 100,
                "aportacion_minima": 0.05,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido",
                    "autonomo_2a",
                    "temporal_12m"
                ],
                "plazo_max": 40,
                "notas": "Hipoteca joven hasta 100% LTV sin aval para <36 años. Nómina >= 600€. No admite doble garantía. No viviendas <80k."
            },
            {
                "tipo": "segunda_vivienda",
                "LTV_max": 75,
                "aportacion_minima": 0.25,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido",
                    "autonomo_2a"
                ],
                "plazo_max": 30
            }
        ],
        "no_residentes": {
            "LTV_max": 65,
            "plazo_max": 25,
            "requisitos": "Residentes UE-27/UK/Suiza, estudios caso-a-caso, excluidos cambio de casa y alquiler inversor"
        },
        "exclusiones": [
            "LTV > 95% salvo Hipoteca Joven <36 años (100% sin aval)",
            "No doble garantía",
            "No viviendas <80k",
            "No admite cambio de casa con LTV >80%",
            "No admite doble garantía"
        ]
    },
    {
        "nombre": "Banco Sabadell",
        "productos": [
            {
                "tipo": "primera_vivienda",
                "LTV_max": 80,
                "LTV_joven": 95,
                "LTV_ICO": 100,
                "aportacion_minima": 0.05,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido"
                ],
                "plazo_max": 30,
                "notas": "\"Mi Primera Vivienda\" y ICO para jóvenes: hasta 95-100% LTV."
            },
            {
                "tipo": "segunda_vivienda",
                "LTV_max": 70,
                "aportacion_minima": 0.3,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido",
                    "temporal"
                ],
                "plazo_max": 30
            },
            {
                "tipo": "autoconstrucción",
                "LTV_max": 70,
                "aportacion_minima": 0.3,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido"
                ],
                "plazo_max": 30
            }
        ],
        "no_residentes": {
            "LTV_max": 70,
            "plazo_max": 30
        },
        "exclusiones": [
            "Garantías >100k; Sin ascensor (>3ª) requiere aportación >40%",
            "No admite subrogación con LTV >80%"
        ]
    },
    {
        "nombre": "BBVA",
        "productos": [
            {
                "tipo": "primera_vivienda",
                "LTV_max": 80,
                "LTV_joven": 95,
                "LTV_ICO": 100,
                "aportacion_minima": 0.05,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido",
                    "autonomo_2a",
                    "temporal_12m"
                ],
                "plazo_max": 30,
                "notas": "Hipoteca joven y aval ICO disponibles."
            },
            {
                "tipo": "autoconstrucción",
                "LTV_max": 80,
                "aportacion_minima": 0.2,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido"
                ],
                "plazo_max": 30
            }
        ],
        "no_residentes": {
            "disponible": false
        },
        "exclusiones": [
            "No residentes",
            "Reforma solo post-obra",
            "No viviendas <80k"
        ]
    },
    {
        "nombre": "Kutxabank",
        "productos": [
            {
                "tipo": "primera_vivienda",
                "LTV_max": 80,
                "LTV_joven": 95,
                "aportacion_minima": 0.05,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido",
                    "autonomo_2a"
                ],
                "plazo_max": 30
            },
            {
                "tipo": "autoconstrucción",
                "LTV_max": 75,
                "aportacion_minima": 0.25,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido"
                ],
                "plazo_max": 30
            }
        ],
        "no_residentes": {
            "LTV_max": 70,
            "plazo_max": 25
        },
        "exclusiones": []
    },
    {
        "nombre": "Santander",
        "productos": [
            {
                "tipo": "primera_vivienda",
                "LTV_max": 80,
                "LTV_joven": 95,
                "aportacion_minima": 0.05,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido"
                ],
                "plazo_max": 30,
                "notas": "Hipoteca joven 95% con aval solidario"
            },
            {
                "tipo": "autoconstrucción",
                "LTV_max": 80,
                "aportacion_minima": 0.2,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido"
                ],
                "plazo_max": 30
            }
        ],
        "no_residentes": {
            "LTV_max": 70,
            "producto": "Hipoteca Mundo"
        },
        "exclusiones": []
    },
    {
        "nombre": "Bankinter",
        "productos": [
            {
                "tipo": "primera_vivienda",
                "LTV_max": 80,
                "aportacion_minima": 0.2,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido"
                ],
                "plazo_max": 30
            },
            {
                "tipo": "reforma",
                "LTV_max": 75,
                "aportacion_minima": 0.25,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido",
                    "autonomo"
                ],
                "plazo_max": 25
            }
        ],
        "no_residentes": {
            "LTV_max": 70,
            "divisa": "euro"
        },
        "exclusiones": [
            "No oferta oficial de autopromotor",
            "No reforma de viviendas <1 año"
        ]
    },
    {
        "nombre": "MyInvestor",
        "productos": [
            {
                "tipo": "primera_vivienda",
                "LTV_max": 80,
                "aportacion_minima": 0.2,
                "empleo_requerido": [
                    "indefinido"
                ],
                "plazo_max": 30,
                "notas": "Requiere ingresos >= 4000€/mes. Sin productos para reforma, autoconstrucción ni no residentes."
            }
        ],
        "no_residentes": {
            "disponible": false
        },
        "exclusiones": []
    },
    {
        "nombre": "EVO Banco",
        "productos": [
            {
                "tipo": "primera_vivienda",
                "LTV_max": 80,
                "aportacion_minima": 0.2,
                "empleo_requerido": [
                    "indefinido"
                ],
                "plazo_max": 30,
                "notas": "Edad + plazo <= 75 años"
            },
            {
                "tipo": "segunda_vivienda",
                "LTV_max": 60,
                "aportacion_minima": 0.4,
                "empleo_requerido": [
                    "indefinido"
                ],
                "plazo_max": 30
            }
        ],
        "no_residentes": {
            "disponible": false
        },
        "exclusiones": [
            "No autopromotor",
            "No NR"
        ]
    },
    {
        "nombre": "Openbank",
        "productos": [
            {
                "tipo": "primera_vivienda",
                "LTV_max": 80,
                "aportacion_minima": 0.2,
                "empleo_requerido": [
                    "indefinido",
                    "autonomo"
                ],
                "plazo_max": 30,
                "notas": "Edad + plazo <= 80 años"
            },
            {
                "tipo": "segunda_vivienda",
                "LTV_max": 70,
                "aportacion_minima": 0.3,
                "empleo_requerido": [
                    "indefinido"
                ],
                "plazo_max": 30
            }
        ],
        "no_residentes": {
            "disponible": false
        },
        "exclusiones": [
            "No NR",
            "No autopromotor"
        ]
    },
    {
        "nombre": "Triodos Bank",
        "productos": [
            {
                "tipo": "primera_vivienda",
                "LTV_max": 80,
                "aportacion_minima": 0.2,
                "empleo_requerido": [
                    "indefinido"
                ],
                "plazo_max": 30,
                "notas": "Diferencial baja con certificación energética A-B. Hipoteca verde."
            }
        ],
        "no_residentes": {
            "disponible": false
        },
        "exclusiones": [
            "No NR",
            "No autopromotor",
            "No inversión pura"
        ]
    },
    {
        "nombre": "ABANCA",
        "productos": [
            {
                "tipo": "primera_vivienda",
                "LTV_max": 80,
                "LTV_joven": 100,
                "aportacion_minima": 0.2,
                "empleo_requerido": [
                    "indefinido"
                ],
                "plazo_max": 30,
                "notas": "Hipoteca joven hasta 100% para <45 años, programa Mi Primera Vivienda."
            },
            {
                "tipo": "segunda_vivienda",
                "LTV_max": 60,
                "aportacion_minima": 0.4,
                "empleo_requerido": [
                    "indefinido"
                ],
                "plazo_max": 30
            }
        ],
        "no_residentes": {
            "disponible": false
        },
        "exclusiones": []
    },
    {
        "nombre": "Ibercaja",
        "productos": [
            {
                "tipo": "primera_vivienda",
                "LTV_max": 80,
                "LTV_joven": 95,
                "aportacion_minima": 0.2,
                "empleo_requerido": [
                    "indefinido"
                ],
                "plazo_max": 25,
                "notas": "Hipoteca Vamos 95% jóvenes <=35 años"
            },
            {
                "tipo": "autoconstrucción",
                "LTV_max": 80,
                "aportacion_minima": 0.2,
                "empleo_requerido": [
                    "indefinido"
                ],
                "plazo_max": 25
            }
        ],
        "no_residentes": {
            "disponible": false
        },
        "exclusiones": []
    },
    {
        "nombre": "UCI",
        "productos": [
            {
                "tipo": "primera_vivienda",
                "LTV_max": 80,
                "LTV_joven": 95,
                "aportacion_minima": 0.05,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido",
                    "autonomo_3a"
                ],
                "plazo_max": 30,
                "notas": "Requiere justificación de destino de fondos, consultable en política interna"
            },
            {
                "tipo": "segunda_vivienda",
                "LTV_max": 60,
                "aportacion_minima": 0.3,
                "empleo_requerido": [
                    "funcionario",
                    "indefinido",
                    "autonomo_3a"
                ],
                "plazo_max": 30
            }
        ],
        "no_residentes": {
            "LTV_max": 70,
            "plazo_max": 30,
            "países_aceptados": [
                "UE",
                "UK",
                "Suiza",
                "Noruega",
                "Canadá",
                "EEUU"
            ]
        },
        "exclusiones": [
            "No admite asalariados temporales ni eventuales en NR",
            "No viviendas <80k",
            "Exclusiones geográficas según valor vivienda y municipio"
        ]
    }
]
`.trim(),
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
        to: 'yang.ye.1@hotmail.com',
        subject: 'Oferta personalizada',
        text: response.output_text,
        // attachments: ['./oferta.pdf']
    })
    console.log(response.output_text)
}

