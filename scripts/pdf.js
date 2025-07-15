const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake');

const fonts = {
    Roboto: {
        normal: path.join(__dirname, 'fonts', 'Roboto-Regular.ttf'),
        bold: path.join(__dirname, 'fonts', 'Roboto-Medium.ttf'),
    },
};

const printer = new PdfPrinter(fonts);

/**
 * Crea un PDF desde una estructura tipo pdfmake
 * @param {Object} json - Objeto con la clave `PDF` y propiedad `content`
 * @param {string} rutaSalida - Ruta del archivo PDF de salida
 */
async function crearPdf(json, rutaSalida) {
    const dir = path.dirname(rutaSalida);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const docDefinition = {
        content: json.content,
        styles: {
            header: { fontSize: 20, bold: true, margin: [0, 0, 0, 15] },
            subheader: { fontSize: 14, bold: true, margin: [0, 10, 0, 5] },
            bold: { bold: true }
        },
        defaultStyle: {
            font: 'Roboto',
            fontSize: 11
        },
        pageMargins: [40, 60, 40, 60]
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const stream = fs.createWriteStream(rutaSalida);
    pdfDoc.pipe(stream);
    pdfDoc.end();

    return new Promise((resolve, reject) => {
        stream.on('finish', () => {
            console.log(`✅ PDF generado en: ${rutaSalida}`);
            resolve();
        });
        stream.on('error', reject);
    });
}

module.exports = { crearPdf };
