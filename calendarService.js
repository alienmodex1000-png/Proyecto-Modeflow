const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

function getServiceAccountCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY.trim();
      if (raw.startsWith('{')) {
        return JSON.parse(raw);
      }
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (e) {
      console.error('[-] Error parseando GOOGLE_SERVICE_ACCOUNT_KEY:', e.message);
    }
  }

  const storageDir = process.env.STORAGE_DIR || __dirname;
  const candidates = [
    path.join(storageDir, 'data', 'service_account.json'),
    path.join(storageDir, 'service_account.json'),
    path.join(__dirname, 'data', 'service_account.json'),
    path.join(__dirname, 'service_account.json')
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        console.error(`[-] Error leyendo ${file}:`, e.message);
      }
    }
  }
  return null;
}

function getCalendarClient() {
  const credentials = getServiceAccountCredentials();
  if (!credentials) return null;

  try {
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      SCOPES
    );
    return google.calendar({ version: 'v3', auth });
  } catch (err) {
    console.error('[-] Error inicializando Google Calendar client:', err.message);
    return null;
  }
}

/**
 * Consulta la API FreeBusy de Google Calendar para detectar horarios ocupados
 */
async function getBusySlots(calendarId, timeMin, timeMax) {
  const calendar = getCalendarClient();
  if (!calendar) {
    console.log('[i] Modo simulación FreeBusy activo (Service account no configurada aún)');
    return [];
  }

  try {
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin || new Date().toISOString(),
        timeMax: timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{ id: calendarId }]
      }
    });

    const busy = res.data?.calendars?.[calendarId]?.busy || [];
    console.log(`[+] Google Calendar: ${busy.length} bloques ocupados detectados para ${calendarId}`);
    return busy;
  } catch (err) {
    console.error(`[-] Error consultando FreeBusy para ${calendarId}:`, err.message);
    return [];
  }
}

/**
 * Inserta automáticamente una cita en Google Calendar con Google Meet
 */
async function scheduleGoogleMeeting(calendarId, { summary, description, startTime, endTime, clientEmail, clientName }) {
  const calendar = getCalendarClient();
  if (!calendar) {
    console.log('[i] Creación simulada de cita (Google Service Account pendiente)');
    return {
      success: true,
      simulated: true,
      meetLink: 'https://meet.google.com/mode-agency-call',
      id: `SIM-${Date.now()}`
    };
  }

  try {
    const event = {
      summary: summary || 'Sesión Estratégica con Mode Agency',
      description: description || `Cita coordinada automáticamente por ModeFlow AI.\nCliente: ${clientName || 'Prospecto'}\nCorreo: ${clientEmail || 'N/A'}`,
      start: {
        dateTime: startTime,
        timeZone: 'America/Bogota'
      },
      end: {
        dateTime: endTime,
        timeZone: 'America/Bogota'
      },
      attendees: clientEmail ? [{ email: clientEmail, displayName: clientName }] : [],
      conferenceData: {
        createRequest: {
          requestId: `mode-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 }
        ]
      }
    };

    const res = await calendar.events.insert({
      calendarId: calendarId,
      requestBody: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all'
    });

    const meetLink = res.data?.hangoutLink || res.data?.conferenceData?.entryPoints?.[0]?.uri || null;
    console.log(`[+] Cita insertada en Google Calendar (${calendarId}). Evento ID: ${res.data?.id} | Meet: ${meetLink}`);

    return {
      success: true,
      id: res.data?.id,
      htmlLink: res.data?.htmlLink,
      meetLink: meetLink
    };
  } catch (err) {
    console.error(`[-] Error insertando evento en Google Calendar:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  getServiceAccountCredentials,
  getCalendarClient,
  getBusySlots,
  scheduleGoogleMeeting
};
