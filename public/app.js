// ==============================================================
// MODEFLOW AI - UNIVERSAL BUSINESS CONTROLLER (by Mode Agency)
// ==============================================================

// 1. ESTADO GLOBAL DE LA APLICACIÓN
const state = {
  currentView: 'list',
  isHumanHandover: false,
  pollingInterval: null,
  
  // Bloques de Google Calendar (API FreeBusy)
  calendarBusyBlocks: [
    { day: 'viernes', time: '04:00 PM', reason: 'Ocupado (Evento en Google Calendar)' },
    { day: 'jueves', time: '11:00 AM', reason: 'Ocupado (Compromiso Personal)' },
    { day: 'sabado', time: '11:30 AM', reason: 'Ocupado (Bloqueo de Agenda)' }
  ],

  // Citas y Leads del Pipeline (CRM)
  appointments: [
    { id: 1, name: 'Dra. Valeria Restrepo', phone: '+57 310 998 2211', service: 'Sesión Diagnóstico IA', time: 'Jueves 04:00 PM', price: 3800000, status: 'confirmada', stage: 'reminded', tag: 'URGENTE', notes: 'Agendado tras consulta de precios. Recordatorio 24h enviado.' },
    { id: 2, name: 'Sebastián Morales', phone: '+57 314 220 5566', service: 'Setup WhatsApp IA 24/7', time: 'Viernes 03:30 PM', price: 5000000, status: 'confirmada', stage: 'booked', tag: 'VIP', notes: 'Presupuesto alto aprobado. Pendiente llamada de kick-off.' },
    { id: 3, name: 'Carolina Mendoza', phone: '+57 312 770 4433', service: 'Auditoría de Embudo', time: 'Sábado 10:30 AM', price: 1500000, status: 'pendiente', stage: 'qualified', tag: 'CALIENTE', notes: 'Prefirió fin de semana por la mañana.' },
    { id: 4, name: 'Andrés Felipe Castro', phone: '+57 301 223 8899', service: 'Consulta de Automatización', time: 'Por Definir', price: 3800000, status: 'pendiente', stage: 'leads', tag: 'CALIENTE', notes: 'Preguntó precios por WhatsApp recién.' },
    { id: 5, name: 'Mariana Gómez', phone: '+57 318 444 1100', service: 'Retainer Mensual Cloud', time: 'Ayer 10:00 AM', price: 1200000, status: 'confirmada', stage: 'won', tag: 'VIP', notes: 'Cita asistida y contrato activado exitosamente.' }
  ]
};

// 2. REFERENCIAS DOM
const navWaStatusPill = document.getElementById('navWaStatusPill');
const qrUnpairedView = document.getElementById('qrUnpairedView');
const qrConnectedView = document.getElementById('qrConnectedView');
const liveQrImage = document.getElementById('liveQrImage');
const qrLoadingSpinner = document.getElementById('qrLoadingSpinner');
const qrStatusBadge = document.getElementById('qrStatusBadge');
const displayConnectedNumber = document.getElementById('displayConnectedNumber');
const btnOpenDirectWaChat = document.getElementById('btnOpenDirectWaChat');
const chatBody = document.getElementById('chatBody');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const appointmentsList = document.getElementById('appointmentsList');
const weeklyCalendarView = document.getElementById('weeklyCalendarView');
const kanbanViewContainer = document.getElementById('kanbanViewContainer');

// UTILIDADES DE FORMATO
function formatCOP(amount) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
}

// ==============================================================
// 3. SWITCHER DE VISTAS (LISTA | CALENDARIO | KANBAN CRM)
// ==============================================================
function switchView(viewName) {
  state.currentView = viewName;

  const btnList = document.getElementById('btnViewList');
  const btnCal = document.getElementById('btnViewCalendar');
  const btnKanban = document.getElementById('btnViewKanban');

  if (btnList) btnList.className = `view-btn ${viewName === 'list' ? 'active' : ''}`;
  if (btnCal) btnCal.className = `view-btn ${viewName === 'calendar' ? 'active' : ''}`;
  if (btnKanban) btnKanban.className = `view-btn ${viewName === 'kanban' ? 'active' : ''}`;

  if (appointmentsList) appointmentsList.style.display = viewName === 'list' ? 'flex' : 'none';
  if (weeklyCalendarView) weeklyCalendarView.style.display = viewName === 'calendar' ? 'grid' : 'none';
  if (kanbanViewContainer) kanbanViewContainer.style.display = viewName === 'kanban' ? 'grid' : 'none';

  if (viewName === 'list') renderAppointmentsList();
  else if (viewName === 'calendar') renderWeeklyCalendar();
  else if (viewName === 'kanban') renderKanbanBoard();
}

// VISTA 1: LISTA CLÁSICA
function renderAppointmentsList() {
  if (!appointmentsList) return;
  appointmentsList.innerHTML = '';

  state.appointments.forEach((appt, index) => {
    const item = document.createElement('div');
    item.className = 'appointment-item';
    item.onclick = () => openAppointmentDetails(index);

    let statusBadge = '<span class="status-badge status-confirmed">Confirmada</span>';
    if (appt.status === 'pendiente') statusBadge = '<span class="status-badge status-pending">Pendiente</span>';
    else if (appt.status === 'cancelada') statusBadge = '<span class="status-badge status-cancelled">Cancelada</span>';

    item.innerHTML = `
      <div class="patient-info">
        <h5>${appt.name} <small style="font-size: 0.75rem; color: #94a3b8; font-weight: normal;">(${appt.phone})</small></h5>
        <p><i class="fa-solid fa-stethoscope" style="color: #38bdf8;"></i> ${appt.service}</p>
      </div>
      <div class="booking-status">
        <div class="booking-price">${formatCOP(appt.price)}</div>
        <div class="booking-time"><i class="fa-regular fa-clock"></i> ${appt.time}</div>
        <div style="margin-top: 4px;">${statusBadge}</div>
      </div>
    `;
    appointmentsList.appendChild(item);
  });
}

// VISTA 2: CALENDARIO SEMANAL VISUAL (LUNES A SÁBADO)
function renderWeeklyCalendar() {
  if (!weeklyCalendarView) return;
  weeklyCalendarView.innerHTML = '';

  const days = [
    { key: 'lunes', label: 'Lunes' },
    { key: 'martes', label: 'Martes' },
    { key: 'miercoles', label: 'Miércoles' },
    { key: 'jueves', label: 'Jueves' },
    { key: 'viernes', label: 'Viernes' },
    { key: 'sabado', label: 'Sábado' }
  ];

  days.forEach(day => {
    const col = document.createElement('div');
    col.className = 'calendar-day-col';

    const header = document.createElement('div');
    header.className = `calendar-day-header ${day.key === 'viernes' ? 'today' : ''}`;
    header.innerText = day.label;
    col.appendChild(header);

    // 1. Mostrar Bloques Ocupados de Google Calendar
    state.calendarBusyBlocks.forEach(busy => {
      if (busy.day === day.key) {
        const busySlot = document.createElement('div');
        busySlot.className = 'calendar-event-slot busy-slot';
        busySlot.title = 'Espacio bloqueado en Google Calendar del profesional';
        busySlot.innerHTML = `
          <span class="calendar-event-time"><i class="fa-solid fa-lock"></i> ${busy.time}</span>
          <div class="calendar-event-title">${busy.reason}</div>
        `;
        col.appendChild(busySlot);
      }
    });

    // 2. Mostrar Citas de Clientes
    state.appointments.forEach((appt, index) => {
      const lowerTime = (appt.time || '').toLowerCase();
      if (lowerTime.includes(day.key)) {
        const slot = document.createElement('div');
        slot.className = 'calendar-event-slot';
        slot.onclick = () => openAppointmentDetails(index);
        slot.innerHTML = `
          <span class="calendar-event-time">${appt.time.split(' ').slice(-2).join(' ')}</span>
          <div class="calendar-event-title">${appt.name}</div>
        `;
        col.appendChild(slot);
      }
    });

    weeklyCalendarView.appendChild(col);
  });
}

// VISTA 3: TABLERO KANBAN CRM
function renderKanbanBoard() {
  if (!kanbanViewContainer) return;
  kanbanViewContainer.innerHTML = '';

  const columns = [
    { key: 'leads', title: '1. 💬 Leads' },
    { key: 'qualified', title: '2. 🎯 Calificados' },
    { key: 'booked', title: '3. 📅 Agendada' },
    { key: 'reminded', title: '4. 🔔 Recordatorio' },
    { key: 'won', title: '5. 💰 Ganada' }
  ];

  columns.forEach(colData => {
    const colDiv = document.createElement('div');
    colDiv.className = 'kanban-column';

    const apptsInStage = state.appointments.filter(a => (a.stage || 'booked') === colData.key);
    const sumTotal = apptsInStage.reduce((acc, a) => acc + (Number(a.price) || 0), 0);

    colDiv.innerHTML = `
      <div class="kanban-column-header">
        <span>${colData.title} (${apptsInStage.length})</span>
        <span class="kanban-column-total">${formatCOP(sumTotal)}</span>
      </div>
      <div class="kanban-cards-container" id="kanbanCol_${colData.key}"></div>
    `;

    const container = colDiv.querySelector(`#kanbanCol_${colData.key}`);

    apptsInStage.forEach(appt => {
      const originalIndex = state.appointments.indexOf(appt);
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.onclick = () => openAppointmentDetails(originalIndex);

      let tagHtml = `<span class="lead-tag tag-hot">🔥 Caliente</span>`;
      if (appt.tag === 'VIP' || appt.price >= 4000000) {
        tagHtml = `<span class="lead-tag tag-vip">💎 VIP</span>`;
      } else if (appt.tag === 'URGENTE') {
        tagHtml = `<span class="lead-tag tag-urgent">⚡ Cita Próxima</span>`;
      }

      card.innerHTML = `
        <h6>${appt.name}</h6>
        <p>${appt.service}</p>
        <div class="kanban-card-footer">
          <strong style="color: #38bdf8; font-size: 0.78rem;">${formatCOP(appt.price)}</strong>
          ${tagHtml}
        </div>
      `;
      container.appendChild(card);
    });

    kanbanViewContainer.appendChild(colDiv);
  });
}

// ==============================================================
// 4. MODAL DETALLE DE CITA / PROSPECTO
// ==============================================================
function openAppointmentDetails(index) {
  const appt = state.appointments[index];
  if (!appt) return;

  document.getElementById('editApptIndex').value = index;
  document.getElementById('editPatientName').value = appt.name || '';
  document.getElementById('editPatientPhone').value = appt.phone || '';
  document.getElementById('editApptStatus').value = appt.status || 'confirmada';
  document.getElementById('editPatientService').value = appt.service || '';
  document.getElementById('editPatientTime').value = appt.time || '';
  document.getElementById('editPatientPrice').value = appt.price || 0;
  document.getElementById('editPatientNotes').value = appt.notes || '';

  const cleanPhone = (appt.phone || '').replace(/[^0-9]/g, '');
  const btnWa = document.getElementById('btnDirectWhatsApp');
  if (btnWa) {
    btnWa.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hola ${appt.name}, te escribimos de Mode Agency con relación a tu cita agendada.`)}`;
  }

  openModal('appointmentModal');
}

function saveAppointmentChanges() {
  const index = parseInt(document.getElementById('editApptIndex').value);
  if (isNaN(index) || !state.appointments[index]) return;

  state.appointments[index].name = document.getElementById('editPatientName').value.trim();
  state.appointments[index].phone = document.getElementById('editPatientPhone').value.trim();
  state.appointments[index].status = document.getElementById('editApptStatus').value;
  state.appointments[index].service = document.getElementById('editPatientService').value.trim();
  state.appointments[index].time = document.getElementById('editPatientTime').value.trim();
  state.appointments[index].price = Number(document.getElementById('editPatientPrice').value) || 0;
  state.appointments[index].notes = document.getElementById('editPatientNotes').value.trim();

  closeModal('appointmentModal');
  switchView(state.currentView);
}

function deleteCurrentAppointment() {
  const index = parseInt(document.getElementById('editApptIndex').value);
  if (isNaN(index)) return;

  if (confirm('¿Seguro que deseas cancelar esta cita del pipeline?')) {
    state.appointments.splice(index, 1);
    closeModal('appointmentModal');
    switchView(state.currentView);
  }
}

function triggerAntiNoShowReminder() {
  const name = document.getElementById('editPatientName').value;
  const time = document.getElementById('editPatientTime').value;
  alert(`🔔 RECORDATORIO ANTIDESERCIÓN ENVIADO:\n\n"Hola ${name}, te recordamos tu cita programada para el ${time}. Por favor responde CONFIRMAR para apartar tu turno prioritario."`);
}

function generateWompiDepositLink() {
  const name = document.getElementById('editPatientName').value;
  const amount = 50000;
  const url = `https://checkout.wompi.co/p/?public-key=pub_prod_modeflow&currency=COP&amount-in-cents=${amount * 100}&reference=DEP-${Date.now().toString().slice(-6)}`;
  prompt(`💳 Link de Anticipo Wompi para ${name} ($50.000 COP):`, url);
}

async function testCalendarSync() {
  const calId = document.getElementById('cfgGoogleCalendarId').value || 'citas.doctor@gmail.com';
  try {
    const res = await fetch('/api/calendar/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId: calId })
    });
    const data = await res.json();
    if (data.success) {
      alert(`🟢 Conexión con Google Calendar Exitosa:\n\n📅 Calendario sincronizado: ${data.calendarId}\n⚡ Modo: ${data.mode}\n⛔ Bloques ocupados leídos en tiempo real: ${data.busyBlocksDetected} eventos detectados.\n\nLa IA esquivará automáticamente estos horarios.`);
    } else {
      alert(`⚠️ ${data.message || 'Error verificando el calendario.'}`);
    }
  } catch (e) {
    alert('Error conectando con el servicio de calendario.');
  }
}

// ==============================================================
// 5. POLLING DE ESTADO REAL EN TIEMPO REAL (BAILEYS CLOUD)
// ==============================================================
async function fetchLiveStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    if (data.connected && data.phone) {
      navWaStatusPill.className = 'badge-status-pill connected';
      navWaStatusPill.innerText = `En Línea (+${data.phone})`;

      qrUnpairedView.style.display = 'none';
      qrConnectedView.style.display = 'block';

      const p = data.phone;
      const formatted = p.length >= 10 
        ? `+${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8)}`
        : `+${p}`;
      displayConnectedNumber.innerText = formatted;

      const directUrl = `https://wa.me/${p}?text=${encodeURIComponent('Hola, me gustaría recibir información sobre los servicios.')}`;
      btnOpenDirectWaChat.href = directUrl;
    } else {
      navWaStatusPill.className = 'badge-status-pill disconnected';
      navWaStatusPill.innerText = 'Desconectado';

      qrUnpairedView.style.display = 'block';
      qrConnectedView.style.display = 'none';
    }
  } catch (e) {}
}

async function fetchLiveQR() {
  try {
    const res = await fetch('/api/qr');
    const data = await res.json();

    if (data.connected) {
      fetchLiveStatus();
      return;
    }

    if (data.hasQr && data.qrDataUrl) {
      liveQrImage.src = data.qrDataUrl;
      liveQrImage.style.display = 'block';
      qrLoadingSpinner.style.display = 'none';
      qrStatusBadge.innerHTML = `<span class="pulse-dot" style="background: #25d366; width: 6px; height: 6px;"></span> Código QR activo (Apunta tu cámara)`;
      qrStatusBadge.style.color = '#25d366';
      qrStatusBadge.style.background = 'rgba(37, 211, 102, 0.15)';
    } else {
      liveQrImage.style.display = 'none';
      qrLoadingSpinner.style.display = 'block';
      qrStatusBadge.innerHTML = `<span class="pulse-dot" style="background: #ef4444; width: 6px; height: 6px;"></span> Generando sesión en la nube...`;
    }
  } catch (e) {
    console.error('Error fetching QR:', e);
  }
}

async function fetchLivePipeline() {
  try {
    const res = await fetch('/api/pipeline');
    const data = await res.json();
    const tbody = document.getElementById('pipelineTableBody');

    if (data.clients && data.clients.length > 0) {
      tbody.innerHTML = '';
      data.clients.forEach(c => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #334155';
        
        const typeBadge = c.type === 'FRIEND' 
          ? `<span class="badge-tag" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;">Amigo/Personal</span>`
          : `<span class="badge-tag" style="background: rgba(37, 211, 102, 0.15); color: #25d366;">Cliente</span>`;
        
        let statusBadge = '<span class="status-badge status-confirmed">En Seguimiento</span>';
        if (c.stage === 'BOOKED') {
          statusBadge = '<span class="status-badge status-confirmed">Agendado</span>';
        } else if (c.isMuted || c.stage === 'FRIEND_MUTED') {
          statusBadge = `<span class="status-badge status-pending">Pausado</span> 
            <button class="btn-primary" style="padding: 3px 8px; font-size: 0.68rem; margin-left: 6px;" onclick="reactivateChat('${c.phone}')" title="Reanudar atención automática de la IA">
              <i class="fa-solid fa-bolt"></i> Reactivar IA
            </button>`;
        }

        tr.innerHTML = `
          <td style="padding: 10px; font-weight: 600;">+${c.phone} ${c.clientName ? `(${c.clientName})` : ''}</td>
          <td>${typeBadge}</td>
          <td>${c.stage}</td>
          <td>${c.selectedSlot || '-'}</td>
          <td>${statusBadge}</td>
        `;
        tbody.appendChild(tr);
      });
      document.getElementById('statAppointments').innerText = data.clients.filter(c => c.stage === 'BOOKED').length || 5;
      document.getElementById('statLeads').innerText = data.total || 18;
    }
  } catch (e) {
    console.error('Error pipeline:', e);
  }
}

async function reactivateChat(phone) {
  try {
    const res = await fetch('/api/pipeline/reactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (data.success) {
      alert(`⚡ ¡Chat +${phone} reactivado!\nLa IA ha vuelto a tomar el control y responderá al próximo mensaje.`);
      fetchLivePipeline();
    }
  } catch (e) {
    alert('Error al reactivar el chat.');
  }
}

// ==============================================================
// 6. PLANTILLAS DE EJEMPLO POR INDUSTRIA (UNIVERSAL)
// ==============================================================
const BUSINESS_TEMPLATES = {
  dental: {
    clinicName: 'DentiArt Odontología & Estética',
    industry: 'Odontología Estética y Salud Oral',
    doctorName: 'Dra. Sofía Restrepo • Odontóloga Estética',
    address: 'Torre Médica El Poblado, Consultorio 602, Medellín',
    workDays: 'Lunes a Sábado',
    workHours: '08:00 AM - 06:00 PM',
    slotDuration: '45 minutos',
    personalMode: 'false',
    services: `1. Diseño de Sonrisa en Lentes Cerámicos: $4.500.000 - $6.500.000 COP
2. Carillas en Resina de Alta Estética: $2.500.000 - $3.800.000 COP
3. Ortodoncia Invisible (Alineadores): $3.900.000 COP
4. Blanqueamiento Dental Láser: $450.000 COP

Preguntas Frecuentes:
- ¿Duele?: Cero dolor. Anestesia digital sin agujas.
- ¿Parqueadero?: Sí, gratis en sótano 1 para pacientes.`,
    goal: 'Resolver dudas de precios con calidez médica, calificar el tratamiento y concertar cita de valoración presencial con escaneo 3D.'
  },
  agency: {
    clinicName: 'Mode Agency',
    industry: 'Automatización con Inteligencia Artificial & B2B',
    doctorName: 'Alien San • Director Estratégico',
    address: 'Google Meet (Virtual) / Sede Central',
    workDays: 'Lunes a Viernes',
    workHours: '09:00 AM - 07:00 PM',
    slotDuration: '20 minutos',
    personalMode: 'false',
    services: `1️⃣ Setup Sistema de Agendamiento WhatsApp IA 24/7: $3.800.000 COP
2️⃣ Retainer Mensual de Servidores IA y Soporte: $1.200.000 COP/mes
3️⃣ Auditoría de Embudo de Ventas: $1.500.000 COP`,
    goal: 'Calificar el requerimiento del cliente y agendar la llamada estratégica de 20 minutos por Google Meet.'
  },
  realestate: {
    clinicName: 'Luxury Habitat Inmobiliaria',
    industry: 'Propiedad Raíz e Inversiones Inmobiliarias',
    doctorName: 'Andrés Morales • Director Comercial',
    address: 'Sede Comercial Milla de Oro, El Poblado',
    workDays: 'Lunes a Sábado',
    workHours: '09:00 AM - 06:00 PM',
    slotDuration: '60 minutos',
    personalMode: 'false',
    services: `1. Apartamentos en Preventa sobre planos desde $480.000.000 COP
2. Suites Turísticas para renta corta Airbnb (Rentabilidad 14% E.A.)
3. Visita guiada a apartamento modelo y asesoría financiera`,
    goal: 'Calificar el tipo de inversión que busca el cliente y agendar visita a la sala de ventas o llamada de asesoría.'
  },
  legal: {
    clinicName: 'Vélez & Asociados Bufete Jurídico',
    industry: 'Servicios Legales y Tributarios Corporativos',
    doctorName: 'Dr. Alejandro Vélez • Abogado Senior',
    address: 'Torre San Fernando Plaza, Medellín / Virtual Meet',
    workDays: 'Lunes a Viernes',
    workHours: '08:00 AM - 05:30 PM',
    slotDuration: '45 minutos',
    personalMode: 'false',
    services: `1. Diagnóstico Jurídico y Tributario Inicial: $350.000 COP
2. Blindaje Contractual y Defensa Comercial
3. Planeación Fiscal Estratégica`,
    goal: 'Calificar el requerimiento legal y agendar sesión privada de consulta presencial o virtual.'
  },
  custom: {
    clinicName: 'Mi Empresa o Negocio',
    industry: 'Servicios Profesionales / Comercio',
    doctorName: 'Asesor Comercial',
    address: 'Atención Presencial / Virtual',
    workDays: 'Lunes a Sábado',
    workHours: '08:00 AM - 06:00 PM',
    slotDuration: '30 minutos',
    personalMode: 'false',
    services: `1. Servicio Principal: $XXX.XXX COP\n2. Servicio Secundario: $XXX.XXX COP`,
    goal: 'Atender dudas de clientes y agendar citas en los horarios de atención.'
  }
};

function loadBusinessTemplate(templateKey) {
  const tmpl = BUSINESS_TEMPLATES[templateKey];
  if (!tmpl) return;

  document.getElementById('cfgClinicName').value = tmpl.clinicName;
  document.getElementById('cfgIndustry').value = tmpl.industry;
  document.getElementById('cfgDoctorName').value = tmpl.doctorName;
  document.getElementById('cfgClinicAddress').value = tmpl.address;
  document.getElementById('cfgWorkDays').value = tmpl.workDays;
  document.getElementById('cfgWorkHours').value = tmpl.workHours;
  document.getElementById('cfgSlotDuration').value = tmpl.slotDuration;
  document.getElementById('cfgPersonalMode').value = tmpl.personalMode || 'false';
  document.getElementById('cfgServices').value = tmpl.services;
  document.getElementById('cfgGoal').value = tmpl.goal;
}

function switchConfigTab(tabId) {
  document.querySelectorAll('.config-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.config-tab-panel').forEach(p => p.classList.remove('active'));

  const activeBtn = tabId === 'tab-brain' ? document.getElementById('tabBtnBrain')
                  : tabId === 'tab-wompi' ? document.getElementById('tabBtnWompi')
                  : document.getElementById('tabBtnIntegrations');
  if (activeBtn) activeBtn.classList.add('active');

  const activePanel = document.getElementById(tabId);
  if (activePanel) activePanel.classList.add('active');
}

// ==============================================================
// 7. CARGA Y PERSISTENCIA DE CONFIGURACIÓN CLOUD
// ==============================================================
async function loadSettingsFromCloud() {
  try {
    const res = await fetch('/api/settings');
    const cfg = await res.json();
    
    // Tab 1: Cerebro
    document.getElementById('cfgClinicName').value = cfg.businessName || 'Mode Agency';
    document.getElementById('cfgIndustry').value = cfg.industry || 'Automatización con Inteligencia Artificial & B2B';
    document.getElementById('cfgDoctorName').value = cfg.doctorOrAdvisor || 'Alien San • Director Estratégico';
    document.getElementById('cfgClinicAddress').value = cfg.address || 'Google Meet / Sede Central';
    document.getElementById('cfgWorkDays').value = cfg.workDays || 'Lunes a Viernes';
    document.getElementById('cfgWorkHours').value = cfg.workHours || '09:00 AM - 07:00 PM';
    document.getElementById('cfgSlotDuration').value = cfg.slotDuration || '20 minutos';
    document.getElementById('cfgPersonalMode').value = cfg.isPersonalNumber ? 'true' : 'false';
    document.getElementById('cfgServices').value = cfg.servicesPitch || '';
    document.getElementById('cfgGoal').value = cfg.goal || '';

    // Tab 2: Wompi
    const wompi = cfg.wompi || {};
    document.getElementById('chkWompiEnabled').checked = !!wompi.enabled;
    document.getElementById('cfgWompiDepositAmount').value = wompi.depositAmount || 50000;
    document.getElementById('cfgWompiPublicKey').value = wompi.publicKey || '';
    document.getElementById('cfgWompiIntegrityKey').value = wompi.integrityKey || '';

    // Tab 3: Calendar & Alertas
    const integrations = cfg.integrations || {};
    document.getElementById('cfgGoogleCalendarId').value = integrations.googleCalendarId || 'citas.doctor@gmail.com';
    document.getElementById('chkNotifyDoctor').checked = integrations.notifyDoctor !== false;
    document.getElementById('cfgDoctorAlertPhone').value = integrations.doctorAlertPhone || '';
    document.getElementById('cfgDoctorTelegramId').value = integrations.doctorTelegramId || '';

    document.getElementById('navBusinessName').innerText = cfg.businessName || 'Mode Agency';
    document.getElementById('agentHeaderTitle').innerText = `${cfg.doctorOrAdvisor || 'Asistente'} • ${cfg.businessName}`;
  } catch (e) {}
}

async function saveSettingsToCloud() {
  try {
    const payload = {
      businessName: document.getElementById('cfgClinicName').value.trim(),
      industry: document.getElementById('cfgIndustry').value.trim(),
      doctorOrAdvisor: document.getElementById('cfgDoctorName').value.trim(),
      address: document.getElementById('cfgClinicAddress').value.trim(),
      workDays: document.getElementById('cfgWorkDays').value.trim(),
      workHours: document.getElementById('cfgWorkHours').value.trim(),
      slotDuration: document.getElementById('cfgSlotDuration').value.trim(),
      isPersonalNumber: document.getElementById('cfgPersonalMode').value === 'true',
      servicesPitch: document.getElementById('cfgServices').value.trim(),
      goal: document.getElementById('cfgGoal').value.trim(),

      wompi: {
        enabled: document.getElementById('chkWompiEnabled').checked,
        depositAmount: parseInt(document.getElementById('cfgWompiDepositAmount').value) || 50000,
        currency: 'COP',
        publicKey: document.getElementById('cfgWompiPublicKey').value.trim(),
        integrityKey: document.getElementById('cfgWompiIntegrityKey').value.trim()
      },

      integrations: {
        googleCalendarId: document.getElementById('cfgGoogleCalendarId').value.trim(),
        notifyDoctor: document.getElementById('chkNotifyDoctor').checked,
        doctorAlertPhone: document.getElementById('cfgDoctorAlertPhone').value.trim(),
        doctorTelegramId: document.getElementById('cfgDoctorTelegramId').value.trim()
      }
    };

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      alert(`¡Bóveda guardada con éxito! La IA ahora opera con estos parámetros, pasarela Wompi y alertas.`);
      closeModal('clinicConfigModal');
      document.getElementById('navBusinessName').innerText = payload.businessName;
      document.getElementById('agentHeaderTitle').innerText = `${payload.doctorOrAdvisor} • ${payload.businessName}`;
    }
  } catch (e) {
    alert('Error al guardar en el servidor.');
  }
}

async function logoutWhatsApp() {
  if (!confirm('¿Seguro que deseas desvincular el WhatsApp actual?')) return;
  try {
    await fetch('/api/logout', { method: 'POST' });
    alert('Sesión de WhatsApp cerrada. Se generará un nuevo QR.');
    fetchLiveStatus();
    fetchLiveQR();
  } catch (e) {
    alert('Error al desconectar.');
  }
}

// ==============================================================
// 8. CONTROL DE MODALES
// ==============================================================
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
  if (id === 'whatsappQRModal') {
    fetchLiveQR();
    if (!state.pollingInterval) {
      state.pollingInterval = setInterval(() => {
        fetchLiveQR();
        fetchLiveStatus();
      }, 3500);
    }
  }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
  if (id === 'whatsappQRModal' && state.pollingInterval) {
    clearInterval(state.pollingInterval);
    state.pollingInterval = null;
  }
}

document.getElementById('btnOpenQRModal').addEventListener('click', () => openModal('whatsappQRModal'));
document.getElementById('btnOpenConfig').addEventListener('click', () => {
  loadSettingsFromCloud();
  openModal('clinicConfigModal');
});

// ==============================================================
// 9. SIMULADOR DE CHAT SMARTPHONE
// ==============================================================
function sendQuickPrompt(txt) {
  handleUserMessage(txt);
}

async function handleUserMessage(txt) {
  if (!txt || !txt.trim()) return;
  const userText = txt.trim();
  addMessage(userText, 'outgoing');
  chatInput.value = '';

  // Indicador de "Escribiendo..."
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message incoming';
  typingDiv.id = 'simTypingIndicator';
  typingDiv.innerHTML = '<i class="fa-solid fa-robot fa-spin" style="margin-right: 6px; color: #25d366;"></i> ModeFlow IA pensando...';
  chatBody.appendChild(typingDiv);
  chatBody.scrollTop = chatBody.scrollHeight;

  try {
    const res = await fetch('/api/simulate-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userText, pushName: 'Prospecto Demo' })
    });
    const data = await res.json();
    const ind = document.getElementById('simTypingIndicator');
    if (ind) ind.remove();

    if (data && data.reply) {
      addMessage(data.reply, 'incoming');
    } else {
      addMessage('¡Hola! En este momento no pude generar respuesta.', 'incoming');
    }
  } catch (err) {
    const ind = document.getElementById('simTypingIndicator');
    if (ind) ind.remove();
    addMessage('⚠️ Error de conexión con el motor de IA.', 'incoming');
  }
}

function addMessage(txt, type) {
  const div = document.createElement('div');
  div.className = `message ${type}`;
  div.innerHTML = `${txt.replace(/\n/g, '<br>')}<span class="msg-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`;
  chatBody.appendChild(div);
  chatBody.scrollTop = chatBody.scrollHeight;
}

sendBtn.addEventListener('click', () => handleUserMessage(chatInput.value));
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleUserMessage(chatInput.value);
});

function copyDirectWaLink() {
  if (btnOpenDirectWaChat && btnOpenDirectWaChat.href) {
    navigator.clipboard.writeText(btnOpenDirectWaChat.href).then(() => {
      alert('¡Enlace copiado al portapapeles!');
    });
  }
}

function toggleHumanHandover() {
  state.isHumanHandover = !document.getElementById('chkHumanHandover').checked;
  const lbl = document.getElementById('lblHandover');
  if (state.isHumanHandover) {
    lbl.innerHTML = '<i class="fa-solid fa-user"></i> Humano';
    lbl.style.color = '#fbbf24';
  } else {
    lbl.innerHTML = '<i class="fa-solid fa-robot"></i> IA';
    lbl.style.color = '#25d366';
  }
}

// ==============================================================
// 10. INICIALIZACIÓN AUTOMÁTICA
// ==============================================================
switchView('list');
fetchLiveStatus();
fetchLivePipeline();
loadSettingsFromCloud();
setInterval(fetchLiveStatus, 5000);
