const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const venom = require('venom-bot');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

// Criação dos diretórios necessários
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('public')) fs.mkdirSync('public');

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage });
const app = express();

// Middleware para processar dados do formulário
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

let qrCodeBase64 = '';
let client;

// 🟢 Inicializa o Venom assim que o servidor sobe
venom
  .create(
    {
      session: 'envio-planilha',
      headless: false, // true para produção, false para ver o navegador
      waitForLogin: true, // Espera o login para prosseguir
      browserArgs: ['--no-sandbox'],
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' // Caminho do seu Chrome
    },
    (base64Qrimg) => {
      qrCodeBase64 = base64Qrimg;
      console.log('🔗 QR Code gerado');
    },
    (statusSession) => {
      console.log('📶 Status da sessão:', statusSession);
    }
  )
  .then((_client) => {
    client = _client;
    console.log('✅ Cliente Venom criado com sucesso!');
  })
  .catch((err) => {
    console.error('❌ Erro ao criar cliente Venom:', err);
  });

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para exibir o QR Code
app.get('/qrcode', (req, res) => {
  if (!qrCodeBase64) return res.send('QR Code ainda não gerado.');
  res.send(`
    <h1>Escaneie o QR Code com seu WhatsApp</h1>
    <img src="${qrCodeBase64}" />
  `);
});

// Rota para envio das mensagens e anexos
app.post('/enviar', upload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'excel', maxCount: 1 }
]), async (req, res) => {
  if (!client) return res.status(500).send('Cliente Venom ainda não está pronto.');

  const mensagem = req.body.mensagem;
  const arquivoPDF = req.files['pdf'] ? req.files['pdf'][0] : null;
  const arquivoExcel = req.files['excel'] ? req.files['excel'][0] : null;

  if (!arquivoExcel) return res.status(400).send('Erro: planilha com números não foi enviada.');

  const numeros = lerNumerosDoExcel(arquivoExcel.path);

  // Envia a mensagem para cada número na planilha
  for (let i = 0; i < numeros.length; i++) {
    const numero = numeros[i];
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3 segundos entre envios

    try {
      await client.sendText(numero, mensagem);
      console.log(`✅ Mensagem enviada para ${numero}`);

      if (arquivoPDF) {
        await client.sendFile(
          numero,
          arquivoPDF.path,
          arquivoPDF.originalname,
          'Aqui está o PDF que você solicitou.'
        );
        console.log(`✅ PDF enviado para ${numero}`);
      }

    } catch (erro) {
      console.error(`❌ Erro ao enviar para ${numero}:`, erro);
    }
  }

  res.send('Mensagens sendo enviadas...');
});

// Função para ler os números da planilha Excel
function lerNumerosDoExcel(caminho) {
  const workbook = xlsx.readFile(caminho);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const dados = xlsx.utils.sheet_to_json(sheet);
  return dados.map(item => {
    // Captura o número e converte em string com preservação dos dígitos
    let raw = String(item.telefone || item.numero).replace(/[^0-9]/g, '');
    return raw + '@c.us';
  });
}

// Inicializa o servidor na porta 3000
const PORT = process.env.PORT || 3000; // Usa a porta dinâmica do Heroku ou 3000 localmente
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
