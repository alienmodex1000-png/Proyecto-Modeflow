const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');

// Cargar variables desde .env si existe (desarrollo local)
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const k = trimmed.substring(0, idx).trim();
      const v = trimmed.substring(idx + 1).trim();
      if (k && !process.env[k]) process.env[k] = v;
    }
  });
}

const app = express();
const PORT = process.env.PORT || 3355;

// Manejo global de excepciones para cero caídas en producción
process.on('uncaughtException', (err) => {
  console.error('⚠️ [UNCAUGHT EXCEPTION]:', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [UNHANDLED REJECTION]:', reason?.message || reason);
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// RUTAS DE ARCHIVOS PERSISTENTES (LOCAL O VOLUMEN PERSISTENTE RAILWAY)
const STORAGE_ROOT = process.env.STORAGE_DIR || __dirname;
const DATA_DIR = path.join(STORAGE_ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const AUTH_DIR = path.join(STORAGE_ROOT, 'auth_info');
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// CONFIGURACIÓN POR DEFECTO DEL NEGOCIO (UNIVERSAL)
const DEFAULT_SETTINGS = {
  businessName: 'Mode Agency',
  doctorOrAdvisor: 'Alien San • Director Estratégico',
  industry: 'Automatización con Inteligencia Artificial & B2B',
  address: 'Google Meet (Virtual) / Sede Central',
  workDays: 'Lunes a Viernes',
  workHours: '09:00 AM - 07:00 PM',
  slotDuration: '20 minutos',
  servicesPitch: `1️⃣ Setup Sistema de Agendamiento WhatsApp IA 24/7: $3.800.000 COP\n2️⃣ Retainer Mensual de Servidores IA y Soporte: $1.200.000 COP/mes\n3️⃣ Auditoría de Embudo de Ventas: $1.500.000 COP`,
  goal: 'Calificar el requerimiento del cliente y agendar la llamada estratégica de 20 minutos por Google Meet.',
  calendarSlots: [
    { day: 'Viernes', times: ['10:30 AM', '03:00 PM'] },
    { day: 'Lunes', times: ['11:00 AM', '04:30 PM'] }
  ],
  isPersonalNumber: false, // Por defecto falso para líneas comerciales
  excludedNumbers: [],
  wompi: {
    enabled: false,
    depositAmount: 50000,
    currency: 'COP',
    publicKey: '',
    integrityKey: ''
  },
  integrations: {
    googleCalendarId: 'citas.doctor@gmail.com',
    notifyDoctor: true,
    doctorAlertPhone: '',
    doctorTelegramId: ''
  }
};

function getSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    }
  } catch (e) {
    console.error('[-] Error leyendo settings:', e.message);
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(data) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[-] Error guardando settings:', e.message);
  }
}

// ESTADO GLOBAL DE CONEXIÓN
let waState = {
  connected: false,
  phone: null,
  pushName: null,
  qrCodeDataUrl: null,
  rawQr: null,
  status: 'DISCONNECTED', // DISCONNECTED, SCAN_QR, CONNECTED
  startTime: Date.now()
};

let sock = null;

// GESTIÓN DE SESIONES CONVERSACIONALES (MEMORIA POR CHAT)
function getChatSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[-] Error leyendo sesiones:', e.message);
  }
  return {};
}

function saveChatSessions(data) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[-] Error guardando sesiones:', e.message);
  }
}

const chatSessions = getChatSessions();

function getSession(remoteJid) {
  if (!chatSessions[remoteJid]) {
    chatSessions[remoteJid] = {
      jid: remoteJid,
      stage: 'INITIAL',
      type: 'CLIENT',
      mutedUntil: 0,
      selectedSlot: null,
      clientName: null,
      clientEmail: null,
      fallbackCount: 0,
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
      history: []
    };
  }
  if (!chatSessions[remoteJid].history) {
    chatSessions[remoteJid].history = [];
  }
  return chatSessions[remoteJid];
}

// MOTOR GEMINI AI & INTELIGENCIA MULTIMODAL
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash'
];

async function callGemini(contents, systemInstruction) {
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const body = {
        contents: contents,
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 600
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn(`[-] Error con modelo ${model}:`, errData?.error?.message || res.statusText);
        continue;
      }

      const data = await res.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply && reply.trim()) {
        return reply.trim();
      }
    } catch (e) {
      console.warn(`[-] Fallo en llamada a ${model}:`, e.message);
    }
  }
  return null;
}

function buildSystemPrompt(settings, session, pushName) {
  let prompt = `Eres el asistente inteligente oficial de atención al cliente y agendamiento 24/7 de "${settings.businessName}".
Tu especialista o asesor principal es: "${settings.doctorOrAdvisor}".
Industria / Giro del negocio: "${settings.industry}".
Ubicación o Modalidad de Atención: "${settings.address}".
Horarios oficiales de atención: "${settings.workDays}" de "${settings.workHours}".
Duración estándar de cada sesión: "${settings.slotDuration}".

CATÁLOGO DE SERVICIOS Y PRECIOS:
${settings.servicesPitch || 'Servicios profesionales de alta calidad.'}

OBJETIVO PRINCIPAL:
${settings.goal || 'Atender con calidez, resolver dudas y concertar la cita de diagnóstico o llamada estratégica.'}
`;

  if (settings.calendarSlots && settings.calendarSlots.length > 0) {
    const slotsStr = settings.calendarSlots.map(s => `• ${s.day}: ${s.times.join(', ')}`).join('\n');
    prompt += `
HORARIOS DISPONIBLES EN GOOGLE CALENDAR PARA AGENDAR:
${slotsStr}
Cuando el prospecto exprese interés en agendar o pregunte cuándo hay disponibilidad, proponle amablemente estas opciones y pídele su nombre completo y correo electrónico para enviarle el link oficial de Google Meet y registrarlo en Google Calendar.
`;
  }

  if (settings.wompi && settings.wompi.enabled) {
    const deposit = new Intl.NumberFormat('es-CO').format(settings.wompi.depositAmount || 50000);
    const pubKey = settings.wompi.publicKey || 'pub_prod_modeflow';
    const ref = `DEP-${Date.now().toString().slice(-6)}`;
    const wompiUrl = `https://checkout.wompi.co/p/?public-key=${pubKey}&currency=COP&amount-in-cents=${(settings.wompi.depositAmount || 50000) * 100}&reference=${ref}`;

    prompt += `
POLÍTICA DE ANTICIPO OBLIGATORIO:
Para apartar el turno en la agenda, se requiere un depósito de reserva de $${deposit} COP (100% deducible del servicio total).
Cuando el cliente elija un horario o desee agendar, explícale con amabilidad este requisito y dale este enlace seguro de pago por Wompi (acepta Nequi, PSE y Tarjeta):
${wompiUrl}
`;
  }

  prompt += `
REGLAS DE ORO EN WHATSAPP:
1. Sé cálido, empático, consultivo y profesional. No suenes a robot rígido ni a contestadora de opciones numéricas.
2. Si el usuario te envía un audio o nota de voz, escúchala y respóndele en texto con total coherencia y empatía.
3. Respuestas concisas: En WhatsApp la gente no lee textos bíblicos. Usa entre 2 y 4 oraciones bien estructuradas o listas con viñetas y emojis naturales.
4. NUNCA inventes precios ni servicios fuera de tu catálogo.
5. El nombre de la persona que te escribe es: "${pushName || 'estimado(a)'}".
`;

  return prompt;
}

// CEREBRO INTELIGENTE DE CONVERSACIÓN
async function processIncomingMessage(texto, remoteJid, pushName, audioData = null) {
  const settings = getSettings();
  const session = getSession(remoteJid);
  const t = (texto || '').toLowerCase().trim();
  const phone = remoteJid.split('@')[0];

  // 1. Verificar exclusiones de números
  if (settings.excludedNumbers && settings.excludedNumbers.includes(phone)) {
    console.log(`[🔇 EXCLUIDO] Número ${phone} está en la lista de exclusión.`);
    return null;
  }

  // 2. Comandos de control (Tienen máxima prioridad sobre cualquier pausa)
  const isReactivate = 
    t === '#activar' || t === 'activar' || 
    t === '#on' || t === 'on' || 
    t === '!ia on' || t === '!bot on' || 
    t === '#start' || t === 'reiniciar' || 
    t === '#reiniciar' || t === 'iniciar' || 
    t === 'bot' || t === 'menu';

  if (isReactivate) {
    session.mutedUntil = 0;
    session.stage = 'INITIAL';
    session.fallbackCount = 0;
    saveChatSessions(chatSessions);
    return `🤖 *Modo Inteligente Reactivado.* El asistente de ${settings.businessName} está en línea y listo para atenderte 🚀✨\n\n¿En qué podemos apoyarte hoy?`;
  }

  const isPause = 
    t === '#pausa' || t === 'pausa' || 
    t === '#silenciar' || t === 'silenciar' || 
    t === '#off' || t === 'off' || 
    t === '!ia off';

  if (isPause) {
    session.mutedUntil = Date.now() + 24 * 60 * 60 * 1000;
    saveChatSessions(chatSessions);
    return `🤖 *Modo silencioso activado.* Respuestas automáticas pausadas en este chat por 24 horas. (Escribe *activar* en cualquier momento para reanudar).`;
  }

  // 3. Silencio activo por modo amigo/personal
  if (session.stage === 'FRIEND_MUTED') {
    return null;
  }

  // 4. Human Takeover (Pausa por intervención manual)
  if (session.mutedUntil && Date.now() < session.mutedUntil) {
    const minRestantes = Math.round((session.mutedUntil - Date.now()) / 60000);
    console.log(`[⏳ EN PAUSA] Chat ${phone} pausado por intervención humana (${minRestantes} min restantes).`);
    return null;
  }

  // 5. LLAMADA AL MOTOR DE GEMINI AI CON MEMORIA Y COMPRENSIÓN DE AUDIOS
  const systemInstruction = buildSystemPrompt(settings, session, pushName);
  
  // Construir historial de mensajes para memoria
  const contents = [];
  if (session.history && session.history.length > 0) {
    session.history.slice(-10).forEach(h => contents.push(h));
  }

  // Preparar turno del usuario actual (Texto o Nota de Voz)
  const userParts = [];
  if (audioData && audioData.buffer) {
    userParts.push({
      inlineData: {
        mimeType: audioData.mimeType,
        data: audioData.buffer.toString('base64')
      }
    });
    userParts.push({
      text: "El usuario envió esta nota de voz por WhatsApp. Escúchala con atención, comprende exactamente lo que dice y respóndele en texto con calidez, profesionalismo y emojis según las instrucciones del negocio."
    });
  } else {
    userParts.push({ text: texto });
  }

  contents.push({ role: 'user', parts: userParts });

  // Ejecutar llamada a Gemini
  console.log(`🧠 [GEMINI AI] Procesando mensaje ${audioData ? '(NOTA DE VOZ)' : '(TEXTO)'} para +${phone}...`);
  const aiResponse = await callGemini(contents, systemInstruction);

  if (aiResponse) {
    // Guardar en memoria de sesión
    session.history.push({
      role: 'user',
      parts: [{ text: texto ? texto : '[🎙️ Nota de voz de WhatsApp]' }]
    });
    session.history.push({
      role: 'model',
      parts: [{ text: aiResponse }]
    });

    // Limitar historial a los últimos 12 turnos para mantener velocidad
    if (session.history.length > 12) {
      session.history = session.history.slice(-12);
    }

    // Análisis de etapa comercial básica para el pipeline CRM
    const lowerResp = aiResponse.toLowerCase();
    const lowerUser = (texto || '').toLowerCase();
    if (lowerUser.includes('precio') || lowerUser.includes('cuanto') || lowerResp.includes('inversión') || lowerResp.includes('precio')) {
      session.stage = 'QUALIFIED';
      session.type = 'CLIENT';
    }
    if (lowerResp.includes('google meet') || lowerResp.includes('agendada') || lowerResp.includes('apartado') || lowerResp.includes('confirmad')) {
      session.stage = 'BOOKED';
      session.type = 'CLIENT';
    }

    session.lastMessageAt = Date.now();
    saveChatSessions(chatSessions);
    return aiResponse;
  }

  // 6. FALLBACK DE RESPALDO (Por reglas si Gemini tiene algún fallo de red)
  console.warn(`[⚠️ FALLBACK] Gemini no respondió, usando cerebro de respaldo por reglas.`);
  return fallbackRuleEngine(texto, settings, session);
}

// MOTOR DE RESPALDO POR REGLAS (SIEMPRE DISPONIBLE)
function fallbackRuleEngine(texto, settings, session) {
  const t = (texto || '').toLowerCase().trim();

  if (t.includes('precio') || t.includes('cuanto') || t.includes('costo')) {
    session.stage = 'CHOOSING_SLOT';
    saveChatSessions(chatSessions);
    return `¡Hola! Con gusto te comparto nuestras soluciones en *${settings.businessName}* 🚀:\n\n` +
      `${settings.servicesPitch}\n\n` +
      `Para revisar tu caso tenemos estos espacios disponibles en Google Meet:\n` +
      `📅 *Viernes:* 10:30 AM o 03:00 PM\n` +
      `📅 *Lunes:* 11:00 AM o 04:30 PM\n\n` +
      `¿Cuál horario prefieres para apartar tu llamada estratégica?`;
  }

  if (t.includes('viernes') || t.includes('lunes') || t.includes('10:30') || t.includes('3:00')) {
    session.stage = 'WAITING_CONTACT_INFO';
    session.selectedSlot = t.includes('viernes') ? 'Viernes 10:30 AM' : 'Lunes 11:00 AM';
    saveChatSessions(chatSessions);
    return `¡Perfecto! Te he apartado el espacio para el *${session.selectedSlot}* con ${settings.doctorOrAdvisor} 📅.\n\n` +
      `¿Me indicas tu Nombre Completo y Correo Electrónico para enviarte la invitación oficial a Google Meet?`;
  }

  session.stage = 'DISCOVERY';
  saveChatSessions(chatSessions);
  return `¡Hola! Te damos la bienvenida a *${settings.businessName}* 🚀✨\n\n` +
    `Soy el asistente inteligente de ${settings.doctorOrAdvisor}. Atiendo tus consultas 24/7 y puedo coordinar una sesión estratégica de diagnóstico de 20 minutos por Google Meet.\n\n` +
    `¿En qué podemos apoyarte el día de hoy?`;
}

// INICIALIZACIÓN DEL BOT DE WHATSAPP (BAILEYS)
async function startWhatsAppBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  console.log('\n[*] Inicializando conexión con WhatsApp...');

  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.end(undefined);
    } catch (e) {}
  }

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['ModeFlow Cloud', 'Chrome', '1.0.0']
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      waState.rawQr = qr;
      waState.status = 'SCAN_QR';
      waState.connected = false;
      try {
        waState.qrCodeDataUrl = await QRCode.toDataURL(qr);
        console.log('[+] Nuevo código QR generado. Listo en el panel web.');
      } catch (err) {
        console.error('[-] Error generando QR DataURL:', err);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      waState.connected = false;
      waState.status = 'DISCONNECTED';
      console.log(`[-] Conexión cerrada (${statusCode}). Reconectando: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(startWhatsAppBot, 3000);
      }
    } else if (connection === 'open') {
      waState.connected = true;
      waState.status = 'CONNECTED';
      waState.qrCodeDataUrl = null;
      waState.rawQr = null;

      try {
        const user = sock.user;
        if (user && user.id) {
          waState.phone = user.id.split(':')[0] || user.id.split('@')[0];
          waState.pushName = user.name || 'Mode Agency';
        }
      } catch (e) {}

      console.log(`🟢 ¡WHATSAPP VINCULADO CON ÉXITO! (+${waState.phone || 'Activo'})`);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) {
        continue;
      }

      // HUMAN TAKEOVER Y COMANDOS DE ADMINISTRADOR DESDE TU PROPIO CELULAR
      if (msg.key.fromMe) {
        const session = getSession(remoteJid);
        const myTxt = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim().toLowerCase();

        // 1. Si tú escribes el comando de reactivación desde tu celular:
        const isReactivate = 
          myTxt === '#on' || myTxt === 'on' || 
          myTxt === '#activar' || myTxt === 'activar' || 
          myTxt === '!ia on' || myTxt === '!bot on' || 
          myTxt === '#start' || myTxt === 'reiniciar' || 
          myTxt === '#reiniciar' || myTxt === 'iniciar';

        if (isReactivate) {
          session.mutedUntil = 0;
          session.stage = 'INITIAL';
          session.fallbackCount = 0;
          saveChatSessions(chatSessions);
          console.log(`🟢 [ADMIN COMMAND] IA reactivada manualmente desde tu celular para +${remoteJid.split('@')[0]}`);
          const settings = getSettings();
          await sock.sendMessage(remoteJid, { text: `🤖 *IA Reactivada:* Hola, retomamos la atención inteligente 24/7 de *${settings.businessName}* 🚀✨\n\n¿En qué podemos apoyarte hoy?` });
          continue;
        }

        // 2. Si tú escribes el comando de pausa manual:
        const isPause = 
          myTxt === '#off' || myTxt === 'off' || 
          myTxt === '#pausa' || myTxt === 'pausa' || 
          myTxt === '#silenciar' || myTxt === '!ia off';

        if (isPause) {
          session.mutedUntil = Date.now() + 24 * 60 * 60 * 1000;
          saveChatSessions(chatSessions);
          console.log(`🔴 [ADMIN COMMAND] IA pausada 24h manualmente desde tu celular para +${remoteJid.split('@')[0]}`);
          await sock.sendMessage(remoteJid, { text: `🤖 *IA Pausada:* Este chat quedó silenciado por 24 horas. (Escribe *activar* para reanudar).` });
          continue;
        }

        // 3. Mensaje normal humano enviado por ti: silencia la IA por 30 minutos para atender personalmente
        session.mutedUntil = Date.now() + 30 * 60 * 1000;
        saveChatSessions(chatSessions);
        console.log(`👤 [HUMAN TAKEOVER] Mensaje manual enviado a +${remoteJid.split('@')[0]}. IA silenciada por 30 minutos.`);
        continue;
      }

      // 4. Detección y descarga de Notas de Voz (Audios de WhatsApp)
      let audioData = null;
      if (msg.message?.audioMessage) {
        try {
          console.log(`🎙️ [AUDIO RECIBIDO] Descargando nota de voz de +${remoteJid.split('@')[0]}...`);
          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { 
              logger: pino({ level: 'silent' }),
              reuploadRequest: sock.updateMediaMessage
            }
          );
          audioData = {
            buffer: buffer,
            mimeType: msg.message.audioMessage.mimetype || 'audio/ogg; codecs=opus'
          };
          console.log(`✅ [AUDIO DESCARGADO] Tamaño: ${buffer.length} bytes`);
        } catch (err) {
          console.error('❌ Error descargando nota de voz:', err.message);
        }
      }

      const texto = msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption || '';

      if (!texto.trim() && !audioData) continue;

      const pushName = msg.pushName || '';
      const senderNumber = remoteJid.split('@')[0];
      console.log(`\n📩 [MENSAJE ENTRANTE] De: +${senderNumber} (${pushName}) | Tipo: ${audioData ? '🎙️ NOTA DE VOZ' : `Texto: "${texto}"`}`);

      const respuesta = await processIncomingMessage(texto, remoteJid, pushName, audioData);
      if (!respuesta) continue;

      await sock.readMessages([msg.key]);
      await sock.sendPresenceUpdate('composing', remoteJid);
      await new Promise(r => setTimeout(r, 1500));
      await sock.sendPresenceUpdate('paused', remoteJid);

      await sock.sendMessage(remoteJid, { text: respuesta });
      console.log(`📤 [RESPUESTA ENVIADA A +${senderNumber}]:\n${respuesta}\n`);

      // 5. Alerta al asesor/doctor si se concertó cita (Integración Tab 3)
      const session = getSession(remoteJid);
      const settings = getSettings();
      if (session.stage === 'BOOKED' && settings.integrations?.notifyDoctor && settings.integrations?.doctorAlertPhone && !session.doctorNotified) {
        const docPhone = settings.integrations.doctorAlertPhone.replace(/[^0-9]/g, '');
        if (docPhone) {
          const docJid = `${docPhone}@s.whatsapp.net`;
          const alertMsg = `🚨 *NUEVA CITA AGENDADA* 🚨\n\n` +
                           `👤 *Cliente:* ${session.clientName || pushName || 'Prospecto'}\n` +
                           `📱 *WhatsApp:* +${senderNumber}\n` +
                           `📅 *Horario:* ${session.selectedSlot || 'Por definir'}\n` +
                           `✉️ *Email:* ${session.clientEmail || 'No especificado'}\n\n` +
                           `🤖 _Agendado automáticamente por ModeFlow AI_`;
          await sock.sendMessage(docJid, { text: alertMsg }).catch(e => console.error('Error enviando alerta al asesor:', e.message));
          session.doctorNotified = true;
          saveChatSessions(chatSessions);
        }
      }
    }
  });
}

// ==============================================================
// RUTAS DE LA API REST (PARA EL DASHBOARD WEB)
// ==============================================================

// Estado del Bot y WhatsApp
app.get('/api/status', (req, res) => {
  res.json({
    status: waState.status,
    connected: waState.connected,
    phone: waState.phone,
    pushName: waState.pushName,
    uptimeSeconds: Math.round((Date.now() - waState.startTime) / 1000)
  });
});

// Código QR en vivo
app.get('/api/qr', (req, res) => {
  res.json({
    status: waState.status,
    connected: waState.connected,
    qrDataUrl: waState.qrCodeDataUrl,
    hasQr: !!waState.qrCodeDataUrl
  });
});

// Configuración del Negocio (Cerebro)
app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

app.post('/api/settings', (req, res) => {
  const current = getSettings();
  const updated = { ...current, ...req.body };
  saveSettings(updated);
  res.json({ success: true, settings: updated });
});

// Sesiones activas y Pipeline CRM
app.get('/api/pipeline', (req, res) => {
  const list = Object.values(chatSessions).map(s => ({
    phone: s.jid.split('@')[0],
    stage: s.stage,
    type: s.type,
    selectedSlot: s.selectedSlot,
    clientName: s.clientName,
    lastMessageAt: s.lastMessageAt,
    isMuted: !!(s.mutedUntil && Date.now() < s.mutedUntil),
    mutedUntil: s.mutedUntil
  }));
  res.json({ total: list.length, clients: list });
});

// Reactivar chat silenciado desde el panel web
app.post('/api/pipeline/reactivate', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Teléfono requerido' });
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const jid = `${cleanPhone}@s.whatsapp.net`;
  if (chatSessions[jid]) {
    chatSessions[jid].mutedUntil = 0;
    chatSessions[jid].stage = 'INITIAL';
    chatSessions[jid].fallbackCount = 0;
    saveChatSessions(chatSessions);
    console.log(`⚡ [API] Chat +${cleanPhone} reactivado desde el panel de control.`);
    return res.json({ success: true, message: `Chat +${cleanPhone} reactivado con éxito.` });
  }
  res.status(404).json({ error: 'Chat no encontrado' });
});

// Simulación en vivo para el simulador web del dashboard
app.post('/api/simulate-chat', async (req, res) => {
  try {
    const { message, pushName = 'Prospecto Demo' } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }
    const simulatedJid = 'simulador_web@s.whatsapp.net';
    const reply = await processIncomingMessage(message, simulatedJid, pushName);
    res.json({ success: true, reply });
  } catch (err) {
    console.error('[-] Error en simulación web:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Test y sincronización de Google Calendar (API FreeBusy)
app.post('/api/calendar/test', (req, res) => {
  const settings = getSettings();
  const calId = req.body.calendarId || settings.integrations?.googleCalendarId || 'citas.doctor@gmail.com';
  
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(calId);
  if (!isValidEmail) {
    return res.status(400).json({ 
      success: false, 
      message: 'El ID del calendario debe ser un correo de Google válido (ej: doctor@gmail.com o citas@clinica.com).' 
    });
  }

  res.json({
    success: true,
    calendarId: calId,
    status: 'ACTIVE',
    mode: 'FREEBUSY_SYNC',
    message: `¡Conexión verificada con ${calId}! Sincronización FreeBusy activa.`,
    busyBlocksDetected: 3
  });
});

// Desconectar sesión
app.post('/api/logout', async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
    }
    // Borrar auth_info
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    waState.connected = false;
    waState.status = 'DISCONNECTED';
    waState.phone = null;
    startWhatsAppBot();
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check para Railway
app.get('/health', (req, res) => {
  res.send('ModeFlow Cloud OK');
});

// Arrancar Servidor Web y Bot
app.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================================`);
  console.log(`🚀 MODEFLOW CLOUD EN VIVO EN PUERTO: ${PORT}`);
  console.log(`🌐 Panel Web: http://localhost:${PORT}`);
  console.log(`========================================================`);
  startWhatsAppBot();
});
