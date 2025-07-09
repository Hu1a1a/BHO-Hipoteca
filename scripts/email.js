const nodemailer = require('nodemailer');
const path = require('path');

const transporter = nodemailer.createTransport({
    host: "mail.buscadordehipotecas.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASS
    },
    tls: {}
});

async function enviarCorreo(opts) {
    const {
        to, subject, text, html, cc, bcc, attachments = []
    } = opts;

    return await transporter.sendMail({
        from: `"Buscador de Hipotecas" <${process.env.EMAIL}>`,
        to, cc, bcc,
        subject,
        text,
        html,
        attachments: attachments.map(file => ({
            filename: path.basename(file),
            path: file
        }))
    });
}

module.exports = { enviarCorreo };
