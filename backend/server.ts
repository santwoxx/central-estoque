import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Lazy initialize Gemini API Client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Increase payload limit for base64 uploads
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// API: Parse PDF with Gemini AI
app.post("/api/parse-pdf", async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;

    if (!fileBase64) {
      res.status(400).json({ error: "O conteúdo do arquivo base64 é obrigatório." });
      return;
    }

    const client = getGeminiClient();
    
    const promptText = `
Você é um sistema de Inteligência Artificial especializado em estoque de pneumáticos e auto-peças.
Sua tarefa é analisar o arquivo em anexo (um arquivo PDF ou imagem que contém uma tabela ou lista de estoque de pneus ou produtos correlatos) e extrair os produtos listados de forma estruturada.

Extraia as seguintes colunas para cada produto:
1. "brand" (Marca do produto, ex: Pirelli, Michelin, Goodyear, Bosch, etc.)
2. "model" (Modelo ou nome comercial, ex: Cinturato P7, Primacy 4, H7, etc.)
3. "size" (Medida do pneu, tamanho ou especificações, ex: 205/55R16, 175/70R13, 12V 55W, etc.)
4. "quantity" (Quantidade física em estoque, extraída como número inteiro)
5. "price" (Preço unitário em reais se disponível, se não houver use 0, extraído como número flutuante/decimal)
6. "notes" (Qualquer observação útil, como índice de carga, velocidade, prateleira ou estado, ex: "91V", "Novo")
7. "description" (Uma descrição intuitiva criada por você resumindo a aplicação do produto, ex: "Pneu de alto desempenho indicado para pistas secas e molhadas")

INSTRUÇÕES IMPORTANTES:
- Mapeie campos da melhor forma possível, decifrando abreviações comuns de pneus e produtos automotivos.
- Se o documento tiver outras partes além de pneus, foque nos produtos automotivos de estoque (auto-peças, rodas, ferramentas, pneus).
- Gere IDs virtuais temporários sequenciais no formato "PROD-XXX" para auxiliar (ex: PROD-001, PROD-002...) na propriedade "virtualId".
- Retorne UNICAMENTE uma lista em formato JSON no corpo da resposta, sem blocos de código com crases (\`\`\`), sem explicações e sem introduções adicionais. Retorne apenas o array JSON puro de objetos.

O formato final deve ser estritamente um array JSON válido:
[
  {
    "virtualId": "PROD-001",
    "brand": "Pirelli",
    "model": "Cinturato P7",
    "size": "205/55R16",
    "quantity": 24,
    "price": 489.90,
    "notes": "91V",
    "description": "Pneu de alta performance com foco em frentagem curta e economia de combustível"
  }
]
`;

    // Strip header prefix if present (e.g., data:application/pdf;base64,)
    const cleanBase64 = fileBase64.replace(/^data:.*,/, "");

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            data: cleanBase64,
            mimeType: mimeType || "application/pdf"
          }
        },
        promptText
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const responseText = response.text || "";
    
    // Attempt to sanitize and parse the response JSON
    let parsedData;
    try {
      const sanitizedText = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
      parsedData = JSON.parse(sanitizedText);
    } catch (parseErr) {
      console.error("Failed to parse JSON response from Gemini:", responseText);
      res.status(500).json({ 
        error: "Erro ao estruturar dados extraídos do PDF.", 
        rawText: responseText 
      });
      return;
    }

    res.json({ success: true, items: parsedData });
  } catch (error: any) {
    console.error("Error invoking Gemini API:", error);
    res.status(500).json({ error: error.message || "Erro interno do servidor" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
