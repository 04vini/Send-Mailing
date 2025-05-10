const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const venom = require('venom-bot');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

// Garante que as pastas existam
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('public')) fs.mkdirSync('public');

// Configuração do Multer para múltiplos arquivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Cria o servidor
const app = express();

// Middlewares para processar o corpo da requisição ANTES do Multer
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Envio de mensagem
app.post('/enviar', upload.fields([
  { name: 'pdf', maxCount: 1 },  // Espera pelo campo 'pdf' no formulário
  { name: 'excel', maxCount: 1 } // Espera pelo campo 'excel' no formulário
]), async (req, res) => {
  const mensagem = req.body.mensagem;
  const arquivoPDF = req.files['pdf'] ? req.files['pdf'][0] : null;
  const arquivoExcel = req.files['excel'] ? req.files['excel'][0] : null;

  if (!arquivoExcel) {
    return res.status(400).send('Erro: planilha com números não foi enviada.');
  }

  const numeros = lerNumerosDoExcel(arquivoExcel.path);

  try {
    const client = await venom.create({
      session: 'envio-planilha',
      headless: true,
      browserArgs: ['--headless=new'],
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });

    for (let i = 0; i < numeros.length; i++) {
      const numero = numeros[i];
      await new Promise(resolve => setTimeout(resolve, i * 3000)); // 3 segundos entre envios

      try {
        await client.sendText(numero, mensagem);
        console.log(`✅ Mensagem enviada para ${numero}`);
        if (arquivoPDF) {
          await client.sendFile(numero, arquivoPDF.path, arquivoPDF.originalname, 'Aqui está o PDF que você solicitou.');
          console.log(`✅ PDF enviado para ${numero}`);
        }
      } catch (erro) {
        console.error(`❌ Erro ao enviar para ${numero}:`, erro);
      }
    }

    res.send('Mensagens sendo enviadas...');
    client.close(); // Fechar a sessão do Venom ao finalizar
  } catch (erro) {
    console.error('Erro ao iniciar o bot:', erro);
    res.status(500).send('Erro ao iniciar o bot');
  }
});

// Leitura dos números da planilha
function lerNumerosDoExcel(caminho) {
  const workbook = xlsx.readFile(caminho);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const dados = xlsx.utils.sheet_to_json(sheet);
  return dados.map(item => item.numero + '@c.us'); // Adiciona o sufixo para WhatsApp
}

// Inicia o servidor
app.listen(3000, () => {
  console.log('✅ Servidor rodando em http://localhost:3000');
});
