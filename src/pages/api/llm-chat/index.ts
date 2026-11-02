import { WebhookPayload } from "./webhook-payload.entity";
import { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient } from "@/lib/redis";
import { PETX_SYSTEM_PROMPT } from "@/utils/petx-prompts";
import axios from "axios";
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const FREE_LIMIT = parseInt(process.env.FREE_ANALYSES_LIMIT || '5');
const SUBSCRIPTION_PRICE = process.env.SUBSCRIPTION_PRICE || '9.90';
const SUBSCRIPTION_LINK = process.env.SUBSCRIPTION_LINK || 'https://seu-link-aqui.com';

export const cw = axios.create({
  baseURL: process.env.CW_BASE_URL,
  headers: {
    "api_access_token": process.env.CW_API_TOKEN!,
    "Content-Type": "application/json",
  },
});

async function sendMessageToChatwoot(accountId: string, conversationId: number, text: string) {
  try {
    await cw.post(`/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
      content: text,
      message_type: "outgoing",
    });
  } catch (error) {
    console.error('Error sending message to Chatwoot:', error);
  }
}

// Redis key prefixes
const USAGE_KEY_PREFIX = "petx:usage:";
const CONVERSATION_KEY_PREFIX = "petx:conversation:";

interface PetAnalysisResponse {
  message: string;
  pet_detected: boolean;
  pet_type?: string;
  mood_level?: number;
}

// Contador de uso
async function getUserUsageCount(phoneNumber: string): Promise<number> {
  const redis = getRedisClient();
  const key = `${USAGE_KEY_PREFIX}${phoneNumber}`;
  const count = await redis.get(key);
  return count ? parseInt(count) : 0;
}

async function incrementUserUsage(phoneNumber: string): Promise<number> {
  const redis = getRedisClient();
  const key = `${USAGE_KEY_PREFIX}${phoneNumber}`;
  const newCount = await redis.incr(key);
  
  // Expira em 30 dias
  await redis.expire(key, 30 * 24 * 60 * 60);
  
  return newCount;
}

async function analyzePetImage(imageUrl: string): Promise<PetAnalysisResponse> {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'system',
        content: PETX_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analise esta imagem e me diga o humor/comportamento deste pet de forma divertida.'
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl }
          }
        ]
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "pet_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Interpretação divertida do pet"
            },
            pet_detected: {
              type: "boolean",
              description: "Se um pet foi detectado na imagem"
            },
            pet_type: {
              type: "string",
              description: "Tipo do pet: cachorro, gato, outro"
            },
            mood_level: {
              type: "number",
              description: "Nível de humor de 1 a 10"
            }
          },
          required: ["message", "pet_detected"],
          additionalProperties: false
        }
      }
    }
  });

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('PetX webhook called', req.method);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const payload = req.body as WebhookPayload;
    const conversationId = payload?.conversation?.id;
    const phoneNumber = payload?.sender?.phone_number || '';
    const senderName = payload?.sender?.name || 'amigo';

    // Sistema de comandos (mantido do código original)
    const handled = await handleRequest(payload);
    if (handled) {
      return res.status(200).json({ ok: true, conversationId, reply: { text: handled.message } });
    }

    // Ignora mensagens outgoing
    if (payload.message_type === 'outgoing') {
      return res.status(200).json({ ok: true, message: 'Outgoing message ignored' });
    }

    // Verifica se tem imagem
    const hasImage = payload.attachments && payload.attachments.length > 0;
    
    if (!hasImage) {
      await sendMessageToChatwoot(
        process.env.CW_ACCOUNT_ID!,
        conversationId,
        `Oi, ${senderName}! 👋\n\nSou o PetX! Manda uma foto do seu pet que eu vou te dizer o que ele tá pensando 🐾😄`
      );
      return res.status(200).json({ ok: true });
    }

    // Verifica limite de uso
    const usageCount = await getUserUsageCount(phoneNumber);
    
    if (usageCount >= FREE_LIMIT) {
      const upgradeMessage = `Opa! Você já usou suas ${FREE_LIMIT} análises gratuitas. Seu pet é tão fotogênico que a gente sabia que isso ia acontecer 📸\n\nQuer análises ilimitadas? Assine por R$ ${SUBSCRIPTION_PRICE}/mês e vire o melhor intérprete de pets do Brasil 🐾\n\n👉 ${SUBSCRIPTION_LINK}`;
      
      await sendMessageToChatwoot(
        process.env.CW_ACCOUNT_ID!,
        conversationId,
        upgradeMessage
      );
      return res.status(200).json({ ok: true, limit_reached: true });
    }

    // Analisa a imagem
    const imageUrl = payload.attachments![0].data_url;
    const analysis = await analyzePetImage(imageUrl);

    // Se não for pet, pede nova foto
    if (!analysis.pet_detected) {
      await sendMessageToChatwoot(
        process.env.CW_ACCOUNT_ID!,
        conversationId,
        "Hmm, não consegui identificar um pet nessa foto 🤔\nManda uma foto mais clara do seu bichinho? 📸🐾"
      );
      return res.status(200).json({ ok: true, pet_detected: false });
    }

    // Incrementa contador
    const newCount = await incrementUserUsage(phoneNumber);
    const remaining = FREE_LIMIT - newCount;

    // Envia análise
    let responseMessage = analysis.message;
    
    if (remaining > 0) {
      responseMessage += `\n\n✨ Você tem ${remaining} análise${remaining > 1 ? 's' : ''} gratuita${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}`;
    } else if (remaining === 0) {
      responseMessage += `\n\n🎉 Essa foi sua última análise gratuita! Gostou? Assine para continuar:\n${SUBSCRIPTION_LINK}`;
    }

    await sendMessageToChatwoot(
      process.env.CW_ACCOUNT_ID!,
      conversationId,
      responseMessage
    );

    return res.status(200).json({
      ok: true,
      analysis,
      usage: {
        count: newCount,
        remaining,
        limit: FREE_LIMIT
      }
    });

  } catch (error) {
    console.error('Error handling request:', error);
    const status = (error as Error & { status?: number }).status || 500;
    return res.status(status).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

// Sistema de comandos (mantido do código original, simplificado)
enum COMMANDS {
  RESET = '[command] reset',
  CHATBOT_ON_GLOBAL = '[command] chatbot global on',
  CHATBOT_OFF_GLOBAL = '[command] chatbot global off',
  CHATBOT_ON = '[command] chatbot on',
  CHATBOT_OFF = '[command] chatbot off',
  SHOW_COMMANDS = '[command] show commands',
}

async function handleRequest(payload: WebhookPayload): Promise<{ success: boolean; message: string } | false> {
  const conversationId = payload?.conversation?.id;
  if (!conversationId) {
    return false;
  }

  const redis = getRedisClient();

  // Ignora mensagens outgoing
  if (payload.message_type === 'outgoing') {
    return { success: false, message: "Outgoing message - ignoring" };
  }

  const messageContent = payload?.content.trim().toLowerCase();

  // Comandos administrativos
  if (messageContent === COMMANDS.SHOW_COMMANDS) {
    await sendMessageToChatwoot(process.env.CW_ACCOUNT_ID!, conversationId, "Available commands:\n\n" + Object.values(COMMANDS).join('\n'));
    return { success: true, message: "Commands shown." };
  }

  if (messageContent === COMMANDS.CHATBOT_ON_GLOBAL) {
    await redis.set('chatbot_active_globally', '1');
    await sendMessageToChatwoot(process.env.CW_ACCOUNT_ID!, conversationId, "[command] chatbot global activated.");
    return { success: true, message: "[command] chatbot global activated." };
  }

  if (messageContent === COMMANDS.CHATBOT_OFF_GLOBAL) {
    await redis.set('chatbot_active_globally', '0');
    await sendMessageToChatwoot(process.env.CW_ACCOUNT_ID!, conversationId, "[command] chatbot global deactivated.");
    return { success: true, message: "[command] chatbot global deactivated." };
  }

  if (messageContent === COMMANDS.RESET) {
    const phoneNumber = payload?.sender?.phone_number || '';
    const key = `${USAGE_KEY_PREFIX}${phoneNumber}`;
    await redis.del(key);
    await sendMessageToChatwoot(process.env.CW_ACCOUNT_ID!, conversationId, "[command] reset - ok. Contador zerado.");
    return { success: true, message: "[command] reset - ok." };
  }

  if (messageContent === COMMANDS.CHATBOT_ON) {
    const key = `chatbot_active:${conversationId}`;
    await redis.set(key, '1');
    await sendMessageToChatwoot(process.env.CW_ACCOUNT_ID!, conversationId, "[command] chatbot activated.");
    return { success: true, message: "[command] chatbot activated." };
  }

  if (messageContent === COMMANDS.CHATBOT_OFF) {
    const key = `chatbot_active:${conversationId}`;
    await redis.set(key, '0');
    await sendMessageToChatwoot(process.env.CW_ACCOUNT_ID!, conversationId, "[command] chatbot deactivated.");
    return { success: true, message: "[command] chatbot deactivated." };
  }

  // Verifica se chatbot está ativo globalmente
  const chatbotActiveGlobally = await redis.get('chatbot_active_globally');
  if (chatbotActiveGlobally !== '1') {
    return { success: false, message: "Chatbot is not active globally." };
  }

  // Verifica se está ativo para esta conversa
  const key = `chatbot_active:${conversationId}`;
  const chatbotActiveForChat = await redis.get(key);

  if (chatbotActiveForChat === null) {
    // Auto-ativa para novas conversas
    await redis.set(key, '1');
    return false;
  }

  if (chatbotActiveForChat !== '1') {
    return { success: false, message: "Chatbot is not active." };
  }

  return false;
}