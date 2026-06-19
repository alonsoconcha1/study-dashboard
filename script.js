const STORAGE_KEY = "uc-study-dashboard-v1";
const POMODORO_STORAGE_KEY = "pomodoro-active";
const THEME_STORAGE_KEY = "uc-theme";

// ===== Estado inicial =====

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const COURSE_COLORS = [
  "#147d7e",
  "#2854a5",
  "#c3533f",
  "#4b7f35",
  "#9a6b16",
  "#7253a3",
  "#5a6f7f",
  "#b15f2d"
];

const BLOCK_TYPES = {
  free: { label: "Bloque libre" },
  study: { label: "Estudio fijo" },
  class: { label: "Clase" },
  assistant: { label: "Ayudantía" },
  lab: { label: "Laboratorio" },
  commute: { label: "Traslado" },
  sport: { label: "Deporte" },
  leisure: { label: "Ocio" },
  rest: { label: "Descanso" },
  work: { label: "Trabajo" },
  other: { label: "Otro" }
};

const ASSESSMENT_TYPES = {
  prueba: "Prueba",
  examen: "Examen",
  control: "Control",
  tarea: "Tarea",
  entrega: "Entrega",
  laboratorio: "Laboratorio",
  lectura: "Lectura",
  otro: "Otro"
};

const LOW_IMPORTANCE_THRESHOLD = 2;
const LOW_IMPORTANCE_MAX_HOURS = 2;
const DEFAULT_MAX_STUDY_HOURS_PER_DAY = 8;
const TAB_TITLES = {
  overview: "Resumen",
  schedule: "Horario",
  courses: "Ramos y notas",
  assessments: "Evaluaciones",
  milestones: "Hitos",
  planner: "Plan diario",
  settings: "Ajustes del plan"
};
const TASK_TYPES = {
  theory: "teoría",
  exercises: "ejercicios",
  summary: "resumen/formulario",
  errors: "repaso de errores",
  mock: "simulacro",
  finalReview: "repaso final",
  descanso: "descanso"
};

const state = loadState();
let selectedBlock = null;
let selectedColor = COURSE_COLORS[0];

const appContent = document.getElementById("appContent");
const pageTitle = document.getElementById("pageTitle");
const alertArea = document.getElementById("alertArea");
const todayLabel = document.getElementById("todayLabel");
const studyTodayLabel = document.getElementById("studyTodayLabel");
const autosaveLabel = document.getElementById("autosaveLabel");
const themeToggle = document.getElementById("themeToggle");
let pomodoroIntervalId = null;
let activePomodoro = loadActivePomodoro();

// ===== Estado inicial y eventos globales =====

document.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  bindGlobalEvents();
  render();
  renderPomodoroPanel();
  startPomodoroTicker();
});

function bindGlobalEvents() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ui.activeTab = button.dataset.tab;
      render();
    });
  });

  document.body.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();

    if (form.id === "courseForm") addCourse(form);
    if (form.classList.contains("course-edit-form")) saveCourse(form);
    if (form.classList.contains("grade-form")) addGrade(form);
    if (form.classList.contains("grade-simulator-form")) simulateFinalGrade(form);
    if (form.id === "assessmentForm") addAssessment(form);
    if (form.classList.contains("assessment-edit-form")) saveAssessment(form);
    if (form.id === "scheduleSettingsForm") saveScheduleSettings(form);
    if (form.id === "blockForm") saveBlock(form);
    if (form.id === "customBlockForm") addCustomBlock(form);
    if (form.classList.contains("custom-block-edit-form")) saveCustomBlock(form);
    if (form.id === "plannerSettingsForm") savePlannerSettings(form);
    if (form.id === "dailyPlanForm") saveDailyPlanDate(form);
    if (form.id === "importForm") importData(form);
    if (form.id === "calendarImportForm") importCalendar(form);
  });

  document.body.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action], .block-cell, .swatch");
    if (!target) return;

    if (target.classList.contains("swatch")) {
      selectedColor = target.dataset.color;
      renderCourses();
      return;
    }

    if (target.classList.contains("block-cell")) {
      selectedBlock = {
        day: Number(target.dataset.day),
        start: target.dataset.start
      };
      renderSchedule();
      return;
    }

    const action = target.dataset.action;
    if (action === "delete-course") deleteCourse(target.dataset.courseId);
    if (action === "delete-grade") deleteGrade(target.dataset.courseId, target.dataset.gradeId);
    if (action === "delete-assessment") deleteAssessment(target.dataset.assessmentId);
    if (action === "clear-block") clearSelectedBlock();
    if (action === "delete-custom-block") deleteCustomBlock(target.dataset.blockId);
    if (action === "export-data") exportData();
    if (action === "load-demo") loadDemoData();
    if (action === "reset-data") resetData();
    if (action === "mark-done") toggleAssessmentDone(target.dataset.assessmentId);
    if (action === "toggle-session") toggleStudySession(target.dataset.sessionId);
    if (action === "regenerate-plan") regenerateDailyPlan(target.dataset.date);
    if (action === "start-pomodoro") startPomodoro(target);
    if (action === "pause-pomodoro") pausePomodoro();
    if (action === "resume-pomodoro") resumePomodoro();
    if (action === "cancel-pomodoro") cancelPomodoro();
    if (action === "complete-pomodoro") completePomodoro();
    if (action === "toggle-theme") toggleTheme();
  });

  document.body.addEventListener("input", (event) => {
    const target = event.target;
    if (target.matches(".range-live")) {
      const output = target.closest(".range-wrap")?.querySelector("output");
      if (output) output.value = target.value;
    }
  });
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return createDefaultState();

  try {
    const parsed = JSON.parse(stored);
    return normalizeState(parsed);
  } catch {
    return createDefaultState();
  }
}

function initializeTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  setTheme(stored || (prefersDark ? "dark" : "light"), false);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  setTheme(current === "dark" ? "light" : "dark", true);
}

function setTheme(theme, persistTheme = true) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  if (persistTheme) localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  updateThemeToggle(nextTheme);
}

function updateThemeToggle(theme = document.documentElement.dataset.theme) {
  if (!themeToggle) return;
  themeToggle.textContent = theme === "dark" ? "☀️ Claro" : "🌙 Oscuro";
}

// ===== LocalStorage y normalización =====

function createDefaultState() {
  const today = new Date();
  const nextWeek = addDaysISO(today, 7);
  const inTenDays = addDaysISO(today, 10);
  const inFourteenDays = addDaysISO(today, 14);

  const courses = [
    {
      id: uid("ramo"),
      name: "Ecuaciones diferenciales",
      code: "MAT",
      color: COURSE_COLORS[1],
      priority: 4,
      difficulty: 4,
      credits: 10,
      targetGrade: 5.5,
      grades: [
        { id: uid("nota"), label: "Control 1", grade: 5.2, weight: 15 },
        { id: uid("nota"), label: "Tarea 1", grade: 6.1, weight: 10 }
      ]
    },
    {
      id: uid("ramo"),
      name: "Mecanica de fluidos",
      code: "ICH",
      color: COURSE_COLORS[0],
      priority: 5,
      difficulty: 5,
      credits: 10,
      targetGrade: 5.4,
      grades: [{ id: uid("nota"), label: "Lab 1", grade: 5.8, weight: 12 }]
    },
    {
      id: uid("ramo"),
      name: "Probabilidades",
      code: "EYP",
      color: COURSE_COLORS[2],
      priority: 3,
      difficulty: 3,
      credits: 10,
      targetGrade: 5.3,
      grades: []
    }
  ];

  const byName = Object.fromEntries(courses.map((course) => [course.name, course.id]));

  const schedule = {};
  setBlock(schedule, 0, "08:20", "class", byName["Ecuaciones diferenciales"], "Catedra");
  setBlock(schedule, 0, "10:20", "study", byName["Ecuaciones diferenciales"], "Ejercicios");
  setBlock(schedule, 0, "14:20", "class", byName["Mecanica de fluidos"], "Catedra");
  setBlock(schedule, 0, "16:20", "study", "", "Bloque flexible");
  setBlock(schedule, 1, "08:20", "lab", byName["Mecanica de fluidos"], "Laboratorio");
  setBlock(schedule, 1, "12:20", "study", byName["Mecanica de fluidos"], "Informe");
  setBlock(schedule, 1, "18:20", "leisure", "", "Ocio");
  setBlock(schedule, 2, "08:20", "class", byName["Probabilidades"], "Catedra");
  setBlock(schedule, 2, "10:20", "study", byName["Probabilidades"], "Problemas");
  setBlock(schedule, 3, "12:20", "assistant", byName["Ecuaciones diferenciales"], "Ayudantia");
  setBlock(schedule, 3, "16:20", "study", "", "Repaso");
  setBlock(schedule, 4, "08:20", "class", byName["Mecanica de fluidos"], "Catedra");
  setBlock(schedule, 4, "14:20", "study", "", "Cierre semanal");

  return {
    settings: {
      startTime: "08:20",
      endTime: "20:00",
      blockMinutes: 60,
      planDays: 14,
      maxStudyHoursPerDay: DEFAULT_MAX_STUDY_HOURS_PER_DAY,
      preferredBlockMinutes: 75,
      breakMinutes: 10,
      studyCycleMinutes: 120,
      cycleBreakMinutes: 30,
      maxConsecutiveStudyMinutes: 120,
      minStudySessionMinutes: 30,
      planningHorizonDays: 14
    },
    courses,
    assessments: [
      {
        id: uid("hito"),
        title: "Control de EDO",
        courseId: byName["Ecuaciones diferenciales"],
        type: "control",
        dueDate: nextWeek,
        weightPercent: 15,
        importance: 4,
        difficulty: 4,
        estimatedHours: 6,
        completedHours: 1.5,
        status: "en progreso",
        topics: "ecuaciones de orden superior, Laplace",
        overdueDebt: 0,
        done: false
      },
      {
        id: uid("hito"),
        title: "Informe de laboratorio",
        courseId: byName["Mecanica de fluidos"],
        type: "entrega",
        dueDate: inTenDays,
        weightPercent: 20,
        importance: 5,
        difficulty: 4,
        estimatedHours: 8,
        completedHours: 2,
        status: "en progreso",
        topics: "pérdidas, Bernoulli, mediciones",
        overdueDebt: 0,
        done: false
      },
      {
        id: uid("hito"),
        title: "Tarea de probabilidades",
        courseId: byName["Probabilidades"],
        type: "tarea",
        dueDate: inFourteenDays,
        weightPercent: 10,
        importance: 3,
        difficulty: 3,
        estimatedHours: 5,
        completedHours: 0,
        status: "pendiente",
        topics: "variables aleatorias, intervalos de confianza",
        overdueDebt: 0,
        done: false
      }
    ],
    schedule,
    customBlocks: [
      {
        id: uid("bloque"),
        day: 5,
        start: "10:00",
        end: "12:30",
        type: "study",
        courseId: "",
        title: "Estudio largo"
      }
    ],
    weeklySchedule: [],
    milestones: [],
    studySessions: [],
    ui: {
      activeTab: "overview",
      selectedPlanDate: toISODate(today),
      lastMessage: ""
    }
  };
}

function normalizeState(raw) {
  const fallback = createDefaultState();
  const normalized = {
    settings: { ...fallback.settings, ...(raw.settings || {}) },
    courses: Array.isArray(raw.courses) ? raw.courses : fallback.courses,
    assessments: Array.isArray(raw.assessments) ? raw.assessments : fallback.assessments,
    schedule: raw.schedule && typeof raw.schedule === "object" ? raw.schedule : fallback.schedule,
    customBlocks: Array.isArray(raw.customBlocks) ? raw.customBlocks : [],
    weeklySchedule: Array.isArray(raw.weeklySchedule) ? raw.weeklySchedule : [],
    milestones: Array.isArray(raw.milestones) ? raw.milestones : [],
    studySessions: Array.isArray(raw.studySessions) ? raw.studySessions : [],
    ui: { ...fallback.ui, ...(raw.ui || {}) }
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(normalized.ui.selectedPlanDate || ""))) {
    normalized.ui.selectedPlanDate = toISODate(new Date());
  }

  normalized.settings.maxStudyHoursPerDay = clampNumber(normalized.settings.maxStudyHoursPerDay, 1, 12, DEFAULT_MAX_STUDY_HOURS_PER_DAY);
  normalized.settings.preferredBlockMinutes = clampNumber(normalized.settings.preferredBlockMinutes, 30, 120, 75);
  normalized.settings.breakMinutes = clampNumber(normalized.settings.breakMinutes, 0, 45, 10);
  normalized.settings.studyCycleMinutes = clampNumber(normalized.settings.studyCycleMinutes, 30, 240, 120);
  normalized.settings.cycleBreakMinutes = clampNumber(normalized.settings.cycleBreakMinutes, 5, 90, 30);
  normalized.settings.maxConsecutiveStudyMinutes = clampNumber(normalized.settings.maxConsecutiveStudyMinutes || normalized.settings.studyCycleMinutes, 30, 240, 120);
  normalized.settings.minStudySessionMinutes = clampNumber(normalized.settings.minStudySessionMinutes, 10, 90, 30);
  normalized.settings.planningHorizonDays = clampNumber(normalized.settings.planningHorizonDays || normalized.settings.planDays, 1, 45, 14);
  normalized.settings.planDays = clampNumber(normalized.settings.planDays || normalized.settings.planningHorizonDays, 1, 45, 14);

  normalized.courses = normalized.courses.map((course, index) => ({
    id: course.id || uid("ramo"),
    name: course.name || course.nombre || `Ramo ${index + 1}`,
    code: course.code || course.sigla || "",
    color: course.color || COURSE_COLORS[index % COURSE_COLORS.length],
    priority: clampNumber(course.priority ?? course.prioridadBase, 1, 5, 3),
    difficulty: clampNumber(course.difficulty ?? course.dificultad, 1, 5, 3),
    credits: clampNumber(course.credits, 0, 30, 10),
    targetGrade: clampNumber(course.targetGrade ?? course.metaNota, 1, 7, 5.5),
    grades: Array.isArray(course.grades) ? course.grades.map((grade) => ({
      id: grade.id || uid("nota"),
      label: grade.label || "Nota",
      grade: clampNumber(grade.grade, 1, 7, 4),
      weight: clampNumber(grade.weight, 0, 100, 0)
    })) : []
  }));

  normalized.assessments = normalized.assessments.map((item, index) => ({
    id: item.id || uid("hito"),
    title: item.title || item.nombre || `Evaluación ${index + 1}`,
    courseId: item.courseId || "",
    type: ASSESSMENT_TYPES[item.type] ? item.type : "otro",
    dueDate: item.dueDate || item.fecha || toISODate(new Date()),
    weightPercent: clampNumber(item.weightPercent, 0, 100, 0),
    importance: clampNumber(item.importance, 1, 5, 3),
    difficulty: clampNumber(item.difficulty ?? item.dificultad, 1, 5, 3),
    estimatedHours: clampNumber(item.estimatedHours, 0, 200, 0),
    completedHours: clampNumber(item.completedHours, 0, 200, 0),
    status: normalizeAssessmentStatus(item.status ?? item.estado, item.done),
    topics: String(item.topics ?? item.temas ?? ""),
    overdueDebt: clampNumber(item.overdueDebt, 0, 200, 0),
    done: Boolean(item.done) || normalizeAssessmentStatus(item.status ?? item.estado, item.done) === "completada"
  }));

  normalized.customBlocks = normalized.customBlocks
    .map((block) => normalizeCustomBlock(block))
    .filter(Boolean);

  Object.values(normalized.schedule).forEach((block) => {
    if (block) block.type = normalizeBlockType(block.type);
  });

  normalized.studySessions = normalized.studySessions
    .map((session) => normalizeStudySession(session))
    .filter(Boolean);

  normalized.weeklySchedule = getWeeklyScheduleArray(normalized);

  return normalized;
}

function normalizeAssessmentStatus(value, done) {
  if (done) return "completada";
  const status = String(value || "").toLowerCase();
  if (status === "completada" || status === "completado") return "completada";
  if (status === "en progreso") return "en progreso";
  return "pendiente";
}

function normalizeStudySession(session) {
  if (!session || typeof session !== "object") return null;
  const date = String(session.date || session.fecha || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  return {
    id: session.id || buildSessionId({
      date,
      start: session.start || "00:00",
      courseId: session.courseId || "",
      assessmentId: session.assessmentId || "",
      taskType: session.taskType || session.tipoTarea || "theory"
    }),
    date,
    start: String(session.start || ""),
    end: String(session.end || ""),
    duration: clampNumber(session.duration, 10, 240, 60),
    courseId: session.courseId || "",
    assessmentId: session.assessmentId || "",
    taskType: session.taskType || session.tipoTarea || "theory",
    description: String(session.description || session.descripcion || ""),
    completed: Boolean(session.completed ?? session.completada),
    pending: Boolean(session.pending)
  };
}

function getWeeklyScheduleArray(source = state) {
  const rows = [];
  const schedule = source.schedule || {};
  Object.entries(schedule).forEach(([key, block]) => {
    const [day, fallbackStart] = key.split("-");
    if (!block || block.type === "free") return;
    rows.push({
      day: Number(day),
      start: block.start || fallbackStart,
      end: block.end || addMinutesToTime(fallbackStart, Number(source.settings?.blockMinutes || 60)),
      type: block.type,
      title: block.title || "",
      courseId: block.courseId || ""
    });
  });

  (source.customBlocks || []).forEach((block) => {
    rows.push({
      day: block.day,
      start: block.start,
      end: block.end,
      type: block.type,
      title: block.title || "",
      courseId: block.courseId || ""
    });
  });

  return rows.sort((a, b) => a.day - b.day || parseTime(a.start) - parseTime(b.start));
}

function render() {
  updateShell();
  const active = state.ui.activeTab;
  if (pageTitle) pageTitle.textContent = TAB_TITLES[active] || "Dashboard de estudio";
  document.querySelectorAll("[data-tab]").forEach((button) => {
    const selected = button.dataset.tab === active;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  updateNavBadges();

  if (active === "overview") renderOverviewDashboard();
  if (active === "schedule") renderSchedule();
  if (active === "courses") renderCourses();
  if (active === "assessments") renderAssessments();
  if (active === "milestones") renderMilestones();
  if (active === "planner") renderPlanner();
  if (active === "settings") renderSettings();

  renderGlobalAlerts();
  persist();
}

function updateNavBadges() {
  const counts = getNavBadgeCounts();
  document.querySelectorAll(".nav-button[data-tab]").forEach((button) => {
    const label = button.dataset.label || button.textContent.trim();
    const count = counts[button.dataset.tab] || 0;
    button.dataset.label = label;
    button.innerHTML = `
      <span class="nav-label">${escapeHtml(label)}</span>
      ${count > 0 ? `<span class="nav-badge" aria-label="${count} pendientes">${count}</span>` : ""}
    `;
  });
}

function getNavBadgeCounts() {
  const today = toISODate(new Date());
  const pendingAssessments = state.assessments.filter((item) => !item.done).length;
  const todaySessions = state.studySessions.filter((session) => session.date === today && !session.completed).length;
  return {
    assessments: pendingAssessments,
    milestones: pendingAssessments,
    planner: todaySessions
  };
}

function updateShell() {
  const today = new Date();
  todayLabel.textContent = formatLongDate(toISODate(today));
  const todayPlan = generateStudyPlan(1);
  const hours = todayPlan.days[0]?.totalHours || 0;
  studyTodayLabel.textContent = `${formatHours(hours)} de estudio`;
}

// ===== Renderizado =====

function renderOverviewDashboard() {
  const metrics = getMetrics();
  const plan = generateStudyPlan(state.settings.planningHorizonDays || state.settings.planDays);
  const todayPlan = plan.days[0];
  const nextAssessment = getUpcomingAssessments(1)[0];
  const upcomingWeek = getUpcomingAssessments(12).filter((item) => diffDays(toISODate(new Date()), item.dueDate) <= 7);
  const pressureRows = getCoursePressureRows().slice(0, 4);
  const generalProgress = getGeneralProgress();
  const mainAlerts = collectGlobalAlerts().slice(0, 3);

  appContent.innerHTML = `
    <section class="page-header">
      <div>
        <h2>Resumen académico</h2>
        <p>Tu carga diaria combina horario disponible, evaluaciones, dificultad, avance y sesiones pendientes.</p>
      </div>
      <button class="button primary" type="button" data-tab="planner">Ver plan diario</button>
    </section>

    <section class="grid four">
      ${metricCard("Estudio hoy", formatHours(metrics.studyToday), `${metrics.studyBlocksToday} bloques disponibles`)}
      ${metricCard("Próxima evaluación", nextAssessment ? nextAssessment.title : "Sin pendientes", nextAssessment ? `${getCourse(nextAssessment.courseId)?.name || "Sin ramo"} · ${getDueState(nextAssessment.dueDate)}` : "agrega una evaluación")}
      ${metricCard("Próximos 7 días", String(upcomingWeek.length), "evaluaciones, tareas o entregas")}
      ${metricCard("Progreso general", `${Math.round(generalProgress)}%`, `${formatHours(metrics.pendingHours)} pendientes`)}
    </section>

    ${plan.warning ? `<div class="notice">${escapeHtml(plan.warning)}</div>` : ""}

    <section class="grid two">
      <div class="panel">
        <div class="panel-header">
          <h3>Hoy</h3>
          <span class="pill">${todayPlan ? formatHours(todayPlan.totalHours) : "0 h"}</span>
        </div>
        ${renderPlanDayBody(todayPlan, true)}
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3>Evaluaciones de los próximos 7 días</h3>
          <button class="button ghost" type="button" data-tab="milestones">Ver hitos</button>
        </div>
        <div class="list">
          ${upcomingWeek.length ? upcomingWeek.map(renderCompactAssessment).join("") : emptyState("No tienes evaluaciones durante los próximos 7 días.")}
        </div>
      </div>
    </section>

    <section class="grid two">
      <div class="panel">
        <div class="panel-header">
          <h3>Ramos con mayor prioridad</h3>
          <button class="button ghost" type="button" data-tab="courses">Ajustar prioridades</button>
        </div>
        <div class="list">
          ${pressureRows.length ? pressureRows.map(renderPressureRow).join("") : emptyState("Agrega ramos para ver esta sección.")}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3>Alertas principales</h3>
        </div>
        <div class="list">
          ${mainAlerts.length ? mainAlerts.map(renderInlineAlert).join("") : emptyState("No hay alertas relevantes por ahora.")}
        </div>
      </div>
    </section>
  `;

  bindInlineTabButtons();
}

function renderOverview() {
  const metrics = getMetrics();
  const plan = generateStudyPlan(state.settings.planningHorizonDays || state.settings.planDays);
  const todayPlan = plan.days[0];
  const upcoming = getUpcomingAssessments(6);
  const pressureRows = getCoursePressureRows();

  appContent.innerHTML = `
    <section class="page-header">
      <div>
        <h2>Resumen académico</h2>
        <p>Tu carga diaria se calcula desde los bloques marcados como estudio, las horas pendientes y la prioridad de cada ramo.</p>
      </div>
      <button class="button primary" type="button" data-tab="planner">Ver plan diario</button>
    </section>

    <section class="grid four">
      ${metricCard("Estudio hoy", formatHours(metrics.studyToday), `${metrics.studyBlocksToday} bloques disponibles`)}
      ${metricCard("Pendiente total", formatHours(metrics.pendingHours), `${metrics.pendingItems} hitos abiertos`)}
      ${metricCard("Próximos 14 días", String(metrics.nextTwoWeeks), "evaluaciones, tareas o entregas")}
      ${metricCard("Promedio parcial", metrics.averageLabel, "ponderado por ramos con notas")}
    </section>

    ${plan.warning ? `<div class="notice">${escapeHtml(plan.warning)}</div>` : ""}

    <section class="grid two">
      <div class="panel">
        <div class="panel-header">
          <h3>Hoy</h3>
          <span class="pill">${todayPlan ? formatHours(todayPlan.totalHours) : "0 h"}</span>
        </div>
        ${renderPlanDayBody(todayPlan, true)}
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3>Próximos hitos</h3>
          <button class="button ghost" type="button" data-tab="milestones">Ver hitos</button>
        </div>
        <div class="list">
          ${upcoming.length ? upcoming.map(renderCompactAssessment).join("") : emptyState("No tienes evaluaciones pendientes.")}
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h3>Presión por ramo</h3>
        <button class="button ghost" type="button" data-tab="courses">Ajustar prioridades</button>
      </div>
      <div class="list">
        ${pressureRows.length ? pressureRows.map(renderPressureRow).join("") : emptyState("Agrega ramos para ver esta seccion.")}
      </div>
    </section>
  `;

  bindInlineTabButtons();
}

function renderSchedule() {
  const slots = getScheduleRows();
  if (!selectedBlock && slots.length) selectedBlock = { day: 0, start: slots[0].key };
  const columns = DAY_NAMES.length + 1;
  const gridTemplate = `112px repeat(${DAY_NAMES.length}, minmax(118px, 1fr))`;
  const customBlocks = getSortedCustomBlocks();

  appContent.innerHTML = `
    <section class="page-header">
      <div>
        <h2>Horario editable</h2>
        <p>Marca bloques rápidos o crea intervalos exactos con inicio y término propios. Solo los bloques de estudio entran al plan diario.</p>
      </div>
    </section>

    <section class="panel">
      <form id="scheduleSettingsForm" class="form-grid">
        <div class="field">
          <label for="startTime">Comienza</label>
          <input id="startTime" name="startTime" type="time" value="${escapeAttr(state.settings.startTime)}" required>
        </div>
        <div class="field">
          <label for="endTime">Termina</label>
          <input id="endTime" name="endTime" type="time" value="${escapeAttr(state.settings.endTime)}" required>
        </div>
        <div class="field">
          <label for="blockMinutes">Minutos por bloque</label>
          <input id="blockMinutes" name="blockMinutes" type="number" min="15" max="240" step="5" value="${Number(state.settings.blockMinutes)}" required>
        </div>
        <div class="field">
          <button class="button primary" type="submit">Actualizar horario</button>
        </div>
      </form>
    </section>

    <section class="schedule-layout">
      <div class="grid">
        <div class="legend">${Object.entries(BLOCK_TYPES).map(([key, type]) => `
          <span class="legend-item"><span class="legend-sample type-${key}"></span>${type.label}</span>
        `).join("")}</div>
        <div class="schedule-scroll">
          <div class="schedule-grid" style="grid-template-columns: ${gridTemplate};">
            <div class="schedule-head">Hora</div>
            ${DAY_SHORT.map((day) => `<div class="schedule-head">${day}</div>`).join("")}
            ${slots.map((slot) => renderScheduleRow(slot, columns)).join("")}
          </div>
        </div>
      </div>
      ${renderBlockEditor(slots)}
    </section>

    <section class="panel">
      <div class="panel-header">
        <h3>Bloque con horario exacto</h3>
      </div>
      <form id="customBlockForm" class="form-grid">
        <div class="field">
          <label for="customDay">Día</label>
          <select id="customDay" name="day">${dayOptions()}</select>
        </div>
        <div class="field">
          <label for="customStart">Inicio</label>
          <input id="customStart" name="start" type="time" value="${escapeAttr(state.settings.startTime)}" required>
        </div>
        <div class="field">
          <label for="customEnd">Término</label>
          <input id="customEnd" name="end" type="time" value="${escapeAttr(addMinutesToTime(state.settings.startTime, Number(state.settings.blockMinutes)))}" required>
        </div>
        <div class="field">
          <label for="customType">Tipo</label>
          <select id="customType" name="type">${blockTypeOptions("study")}</select>
        </div>
        <div class="field">
          <label for="customCourse">Ramo</label>
          <select id="customCourse" name="courseId">${courseSelectOptions("", true)}</select>
        </div>
        <div class="field wide">
          <label for="customTitle">Detalle</label>
          <input id="customTitle" name="title" type="text" placeholder="Ej. repaso antes de control">
        </div>
        <div class="field">
          <button class="button primary" type="submit">Agregar bloque</button>
        </div>
      </form>
    </section>

    <section class="list">
      ${customBlocks.length ? customBlocks.map(renderCustomBlockRow).join("") : emptyState("No hay bloques con horario exacto.")}
    </section>
  `;
}

function renderCourses() {
  const courseOptions = state.courses.map((course) => renderCourseCard(course)).join("");

  appContent.innerHTML = `
    <section class="page-header">
      <div>
        <h2>Ramos, prioridades y notas</h2>
        <p>Las prioridades, dificultad y notas influyen en cómo se reparten los bloques libres cuando no hay entregas urgentes.</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h3>Agregar ramo</h3>
      </div>
      <form id="courseForm" class="form-grid">
        <div class="field wide">
          <label for="courseName">Nombre</label>
          <input id="courseName" name="name" type="text" placeholder="Ej. Termodinámica" required>
        </div>
        <div class="field">
          <label for="courseCode">Código</label>
          <input id="courseCode" name="code" type="text" placeholder="Ej. ICH">
        </div>
        <div class="field">
          <label for="courseCredits">Créditos</label>
          <input id="courseCredits" name="credits" type="number" min="0" max="30" step="1" value="10">
        </div>
        <div class="field">
          <label for="coursePriority">Prioridad</label>
          <div class="range-wrap">
            <input id="coursePriority" class="range-live" name="priority" type="range" min="1" max="5" value="3">
            <output>3</output>
          </div>
        </div>
        <div class="field">
          <label for="courseDifficulty">Dificultad</label>
          <div class="range-wrap">
            <input id="courseDifficulty" class="range-live" name="difficulty" type="range" min="1" max="5" value="3">
            <output>3</output>
          </div>
        </div>
        <div class="field">
          <label for="targetGrade">Meta nota</label>
          <input id="targetGrade" name="targetGrade" type="number" min="1" max="7" step="0.1" value="5.5">
        </div>
        <div class="field wide">
          <label>Color</label>
          <div class="swatches">${COURSE_COLORS.map((color) => `
            <button class="swatch ${selectedColor === color ? "active" : ""}" type="button" data-color="${color}" style="background:${color}" aria-label="Color ${color}"></button>
          `).join("")}</div>
        </div>
        <div class="field">
          <button class="button primary" type="submit">Agregar ramo</button>
        </div>
      </form>
    </section>

    <section class="list">
      ${state.courses.length ? courseOptions : emptyState("Todavía no hay ramos. Agrega el primero arriba.")}
    </section>
  `;
}

function renderAssessments() {
  const nextDate = addDaysISO(new Date(), 7);

  appContent.innerHTML = `
    <section class="page-header">
      <div>
        <h2>Evaluaciones, tareas y entregas</h2>
        <p>Cada hito tiene ponderación, horas, avance, importancia, dificultad y fecha. El plan diario usa esos datos para ordenar tu estudio.</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h3>Agregar hito</h3>
      </div>
      <form id="assessmentForm" class="form-grid">
        <div class="field wide">
          <label for="assessmentTitle">Título</label>
          <input id="assessmentTitle" name="title" type="text" placeholder="Ej. Control 2, entrega informe" required>
        </div>
        <div class="field">
          <label for="assessmentCourse">Ramo</label>
          <select id="assessmentCourse" name="courseId">${courseSelectOptions()}</select>
        </div>
        <div class="field">
          <label for="assessmentType">Tipo</label>
          <select id="assessmentType" name="type">${assessmentTypeOptions()}</select>
        </div>
        <div class="field">
          <label for="assessmentDue">Fecha</label>
          <input id="assessmentDue" name="dueDate" type="date" value="${nextDate}" required>
        </div>
        <div class="field">
          <label for="assessmentHours">Horas estimadas</label>
          <input id="assessmentHours" name="estimatedHours" type="number" min="0" max="200" step="0.25" value="0">
        </div>
        <div class="field">
          <label for="assessmentWeight">Ponderación %</label>
          <input id="assessmentWeight" name="weightPercent" type="number" min="0" max="100" step="0.5" value="10">
        </div>
        <div class="field">
          <label for="assessmentDoneHours">Horas hechas</label>
          <input id="assessmentDoneHours" name="completedHours" type="number" min="0" max="200" step="0.25" value="0">
        </div>
        <div class="field">
          <label for="assessmentImportance">Importancia</label>
          <div class="range-wrap">
            <input id="assessmentImportance" class="range-live" name="importance" type="range" min="1" max="5" value="3">
            <output>3</output>
          </div>
        </div>
        <div class="field">
          <label for="assessmentDifficulty">Dificultad</label>
          <div class="range-wrap">
            <input id="assessmentDifficulty" class="range-live" name="difficulty" type="range" min="1" max="5" value="3">
            <output>3</output>
          </div>
        </div>
        <div class="field">
          <label for="assessmentStatus">Estado</label>
          <select id="assessmentStatus" name="status">
            <option value="pendiente">Pendiente</option>
            <option value="en progreso">En progreso</option>
            <option value="completada">Completada</option>
          </select>
        </div>
        <div class="field wide">
          <label for="assessmentTopics">Temas</label>
          <input id="assessmentTopics" name="topics" type="text" placeholder="Ej. ciclos de refrigeración, Branch and Bound">
        </div>
        <div class="field">
          <button class="button primary" type="submit">Agregar hito</button>
        </div>
      </form>
    </section>

    <section class="list">
      ${state.assessments.length ? getSortedAssessments().map(renderAssessmentCard).join("") : emptyState("No hay hitos agregados.")}
    </section>

    <section class="panel">
      <div class="panel-header">
        <h3>Importar Google Calendar (.ics)</h3>
      </div>
      <form id="calendarImportForm" class="grid">
        <div class="form-grid">
          <div class="field wide">
            <label for="icsFile">Archivo .ics</label>
            <input id="icsFile" name="icsFile" type="file" accept=".ics,text/calendar">
          </div>
          <div class="field">
            <label for="calendarDefaultCourse">Ramo por defecto</label>
            <select id="calendarDefaultCourse" name="defaultCourseId">${courseSelectOptions("", true)}</select>
          </div>
          <div class="field">
            <button class="button primary" type="submit">Importar calendario</button>
          </div>
        </div>
        <div class="field full">
          <label for="calendarIcsText">Texto ICS pegado</label>
          <textarea id="calendarIcsText" name="calendarIcsText" spellcheck="false"></textarea>
        </div>
      </form>
    </section>
  `;
}

function renderMilestones() {
  const sorted = getSortedAssessments();
  const pending = sorted.filter((item) => !item.done);
  const completed = sorted.filter((item) => item.done);
  const pendingHours = pending.reduce((sum, item) => sum + getPendingHours(item), 0);

  appContent.innerHTML = `
    <section class="page-header">
      <div>
        <h2>Hitos</h2>
        <p>Marca los hitos completados para sacarlos automáticamente del plan diario.</p>
      </div>
      <button class="button ghost" type="button" data-tab="assessments">Editar hitos</button>
    </section>

    <section class="grid three">
      ${metricCard("Pendientes", String(pending.length), `${formatHours(pendingHours)} por planificar`)}
      ${metricCard("Completados", String(completed.length), "fuera del plan diario")}
      ${metricCard("Total hitos", String(sorted.length), "registrados")}
    </section>

    <section class="panel">
      <div class="panel-header">
        <h3>Pendientes</h3>
        <span class="pill">${formatHours(pendingHours)}</span>
      </div>
      <div class="list">
        ${pending.length ? pending.map(renderMilestoneRow).join("") : emptyState("No tienes hitos pendientes.")}
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h3>Completados</h3>
        <span class="pill">${completed.length}</span>
      </div>
      <div class="list">
        ${completed.length ? completed.map(renderMilestoneRow).join("") : emptyState("Todavía no hay hitos completados.")}
      </div>
    </section>
  `;

  bindInlineTabButtons();
}

function renderPlanner() {
  const plan = generateStudyPlan(state.settings.planningHorizonDays || state.settings.planDays);
  const total = plan.days.reduce((sum, day) => sum + day.totalHours, 0);
  const week = generateWeeklyView(plan);
  const selectedDate = state.ui.selectedPlanDate || toISODate(new Date());
  const selectedDay = plan.days.find((day) => day.date === selectedDate) || generateDailyPlan(selectedDate);

  appContent.innerHTML = `
    <section class="page-header">
      <div>
        <h2>Plan diario</h2>
        <p>Este calendario sale de tus bloques de estudio, horas disponibles, evaluaciones y sesiones pendientes.</p>
      </div>
    </section>

    <section class="panel">
      <form id="plannerSettingsForm" class="form-grid">
        <div class="field">
          <label for="planDays">Días a planificar</label>
          <input id="planDays" name="planDays" type="number" min="1" max="45" step="1" value="${Number(state.settings.planningHorizonDays || state.settings.planDays)}">
        </div>
        <div class="field">
          <label for="maxStudyHoursPerDay">Máximo diario</label>
          <input id="maxStudyHoursPerDay" name="maxStudyHoursPerDay" type="number" min="1" max="12" step="0.25" value="${Number(state.settings.maxStudyHoursPerDay)}">
        </div>
        <div class="field">
          <label for="preferredBlockMinutes">Bloque ideal</label>
          <input id="preferredBlockMinutes" name="preferredBlockMinutes" type="number" min="30" max="120" step="5" value="${Number(state.settings.preferredBlockMinutes)}">
        </div>
        <div class="field">
          <label for="studyCycleMinutes">Ciclo de estudio</label>
          <input id="studyCycleMinutes" name="studyCycleMinutes" type="number" min="30" max="240" step="5" value="${Number(state.settings.studyCycleMinutes)}">
        </div>
        <div class="field">
          <label for="cycleBreakMinutes">Descanso de ciclo</label>
          <input id="cycleBreakMinutes" name="cycleBreakMinutes" type="number" min="5" max="90" step="5" value="${Number(state.settings.cycleBreakMinutes)}">
        </div>
        <div class="field">
          <label for="minStudySessionMinutes">Sesión mínima</label>
          <input id="minStudySessionMinutes" name="minStudySessionMinutes" type="number" min="10" max="90" step="5" value="${Number(state.settings.minStudySessionMinutes)}">
        </div>
        <div class="field">
          <button class="button primary" type="submit">Actualizar plan</button>
        </div>
        <div class="field wide">
          <span class="pill">${formatHours(total)} planificadas</span>
          <span class="pill">${formatHours(plan.pendingAfterPlan)} quedarian pendientes</span>
        </div>
      </form>
    </section>

    ${plan.warning ? `<div class="notice">${escapeHtml(plan.warning)}</div>` : ""}
    <div class="notice">El plan usa ciclos de estudio de hasta 2 horas con descansos recomendados de 30 minutos en días largos.</div>

    <section class="panel">
      <div class="panel-header">
        <h3>Fecha seleccionada</h3>
        <span class="pill">${formatHours(selectedDay.totalHours)} sugeridas</span>
      </div>
      <form id="dailyPlanForm" class="form-grid">
        <div class="field">
          <label for="selectedPlanDate">Fecha</label>
          <input id="selectedPlanDate" name="selectedPlanDate" type="date" value="${escapeAttr(selectedDate)}">
        </div>
        <div class="field actions">
          <button class="button primary" type="submit">Ver fecha</button>
          <button class="button" type="button" data-action="regenerate-plan" data-date="${escapeAttr(selectedDate)}">Regenerar plan</button>
        </div>
      </form>
      ${renderPlanDayBody(selectedDay, false)}
    </section>

    <section class="panel">
      <div class="panel-header">
        <h3>Vista semanal</h3>
        <span class="pill">${formatHours(total)} planificadas</span>
      </div>
      <div class="list">
        ${week.length ? week.map(renderWeeklyRow).join("") : emptyState("No hay días con planificación en este rango.")}
      </div>
    </section>

    <section class="list">
      ${plan.days.length ? plan.days.map((day) => renderPlanDay(day)).join("") : emptyState("No hay bloques de estudio en el rango seleccionado.")}
    </section>
  `;
}

function renderSettings() {
  appContent.innerHTML = `
    <section class="page-header">
      <div>
        <h2>Ajustes del plan</h2>
        <p>Todo queda guardado en este navegador con localStorage. Puedes ajustar el horizonte, bloques y respaldos del dashboard.</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h3>Parámetros de planificación</h3>
      </div>
      <form id="plannerSettingsForm" class="form-grid">
        <div class="field">
          <label for="settingsPlanDays">Días a planificar</label>
          <input id="settingsPlanDays" name="planDays" type="number" min="1" max="45" step="1" value="${Number(state.settings.planningHorizonDays || state.settings.planDays)}">
        </div>
        <div class="field">
          <label for="settingsMaxStudyHoursPerDay">Máximo diario</label>
          <input id="settingsMaxStudyHoursPerDay" name="maxStudyHoursPerDay" type="number" min="1" max="12" step="0.25" value="${Number(state.settings.maxStudyHoursPerDay)}">
        </div>
        <div class="field">
          <label for="settingsPreferredBlockMinutes">Bloque ideal</label>
          <input id="settingsPreferredBlockMinutes" name="preferredBlockMinutes" type="number" min="30" max="120" step="5" value="${Number(state.settings.preferredBlockMinutes)}">
        </div>
        <div class="field">
          <label for="settingsStudyCycleMinutes">Ciclo de estudio</label>
          <input id="settingsStudyCycleMinutes" name="studyCycleMinutes" type="number" min="30" max="240" step="5" value="${Number(state.settings.studyCycleMinutes)}">
        </div>
        <div class="field">
          <label for="settingsCycleBreakMinutes">Descanso de ciclo</label>
          <input id="settingsCycleBreakMinutes" name="cycleBreakMinutes" type="number" min="5" max="90" step="5" value="${Number(state.settings.cycleBreakMinutes)}">
        </div>
        <div class="field">
          <label for="settingsMinStudySessionMinutes">Sesión mínima</label>
          <input id="settingsMinStudySessionMinutes" name="minStudySessionMinutes" type="number" min="10" max="90" step="5" value="${Number(state.settings.minStudySessionMinutes)}">
        </div>
        <div class="field">
          <button class="button primary" type="submit">Guardar ajustes</button>
        </div>
      </form>
      <p class="muted" style="margin:14px 0 0;">El plan usa ciclos de estudio de hasta 2 horas con descansos recomendados de 30 minutos en días largos.</p>
    </section>

    <section class="grid two">
      <div class="panel">
        <div class="panel-header">
          <h3>Respaldo</h3>
        </div>
        <div class="actions">
          <button class="button primary" type="button" data-action="export-data">Generar respaldo</button>
          <button class="button" type="button" data-action="load-demo">Cargar ejemplo</button>
          <button class="button danger" type="button" data-action="reset-data">Borrar todo</button>
        </div>
        <p class="muted" style="margin-top:14px;">El respaldo aparecerá abajo y también se descargará como archivo.</p>
        <textarea id="backupBox" readonly spellcheck="false"></textarea>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3>Importar</h3>
        </div>
        <form id="importForm" class="grid">
          <div class="field full">
            <label for="importFile">Archivo JSON</label>
            <input id="importFile" name="importFile" type="file" accept=".json,application/json">
          </div>
          <div class="field full">
            <label for="importBox">JSON de respaldo</label>
            <textarea id="importBox" name="importBox" spellcheck="false"></textarea>
          </div>
          <div class="actions">
            <button class="button primary" type="submit">Importar datos</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

// ===== Alertas =====

function renderGlobalAlerts() {
  if (!alertArea) return;
  const alerts = collectGlobalAlerts();
  alertArea.innerHTML = alerts.slice(0, 4).map((alert) => `
    <div class="alert ${alert.level === "critical" ? "critical" : ""}">
      <div>
        <strong>${escapeHtml(alert.title)}</strong>
        <span>${escapeHtml(alert.body)}</span>
      </div>
    </div>
  `).join("");
}

function collectGlobalAlerts() {
  const today = toISODate(new Date());
  const horizon = Number(state.settings.planningHorizonDays || state.settings.planDays || 14);
  const slots = getStudySlots(horizon);
  const plan = generateStudyPlan(Math.min(horizon, 14));
  const available = slots.reduce((sum, slot) => sum + Number(slot.hours || 0), 0);
  const required = state.assessments.reduce((sum, item) => sum + getPendingHours(item), 0);
  const pendingSessions = state.studySessions.filter((session) => session.pending);
  const todayPlan = plan.days[0];
  const alerts = [];

  const urgent = getSortedAssessments().find((item) => {
    const days = diffDays(today, item.dueDate);
    return !item.done && days >= 0 && days <= 3;
  });
  if (urgent) {
    alerts.push({
      level: "critical",
      title: "Evaluación cercana",
      body: `${urgent.title} vence ${getDueState(urgent.dueDate)} y quedan ${formatHours(getPendingHours(urgent))}.`
    });
  }

  if (required > available && required > 0) {
    alerts.push({
      level: "critical",
      title: "Faltan horas disponibles",
      body: `Hay ${formatHours(required)} requeridas y ${formatHours(available)} disponibles en el rango actual.`
    });
  }

  if (todayPlan && todayPlan.totalHours > Number(state.settings.maxStudyHoursPerDay || DEFAULT_MAX_STUDY_HOURS_PER_DAY)) {
    alerts.push({
      level: "critical",
      title: "Carga alta hoy",
      body: `Hoy hay ${formatHours(todayPlan.totalHours)} planificadas, sobre tu máximo diario.`
    });
  }

  if (pendingSessions.length) {
    alerts.push({
      level: "warning",
      title: "Sesiones pendientes",
      body: `${pendingSessions.length} sesión(es) quedaron pendientes y suben la prioridad de sus evaluaciones.`
    });
  }

  if (!state.courses.length || !state.assessments.length || !slots.length) {
    alerts.push({
      level: "warning",
      title: "Faltan datos para planificar",
      body: "Agrega ramos, evaluaciones y bloques de estudio para generar un plan útil."
    });
  }

  return alerts;
}

function renderInlineAlert(alert) {
  return `
    <div class="compact-row status-${alert.level === "critical" ? "urgent" : "pending"}">
      <strong>${escapeHtml(alert.title)}</strong>
      <span>${escapeHtml(alert.body)}</span>
    </div>
  `;
}

function metricCard(label, value, detail) {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function renderScheduleRow(slot) {
  return `
    <div class="time-cell">${slot.labelStart} - ${slot.labelEnd}</div>
    ${DAY_NAMES.map((_, dayIndex) => {
      const block = getBlock(dayIndex, slot.key);
      const exactBlocks = getCustomBlocksForSlot(dayIndex, slot);
      const course = getCourse(block.courseId);
      const label = block.title || course?.name || BLOCK_TYPES[block.type]?.label || "Libre";
      const blockStart = block.start || slot.labelStart;
      const blockEnd = block.end || slot.labelEnd;
      const hasCustomTime = Boolean(block.start && block.end && (block.start !== slot.start || block.end !== slot.end));
      const isActive = selectedBlock && selectedBlock.day === dayIndex && selectedBlock.start === slot.key;
      return `
        <div class="schedule-cell">
          <button class="block-cell type-${block.type} ${isActive ? "active" : ""}" type="button" data-day="${dayIndex}" data-start="${slot.key}">
            <small>${hasCustomTime ? `${escapeHtml(blockStart)} - ${escapeHtml(blockEnd)} &middot; ` : ""}${BLOCK_TYPES[block.type]?.label || "Libre"}</small>
            <span>${escapeHtml(label)}</span>
          </button>
          ${exactBlocks.map(renderExactBlockChip).join("")}
        </div>
      `;
    }).join("")}
  `;
}

function renderExactBlockChip(block) {
  const course = getCourse(block.courseId);
  const label = block.title || course?.name || BLOCK_TYPES[block.type]?.label || "Bloque";
  return `
    <div class="exact-block-chip type-${block.type}">
      <small>${escapeHtml(block.start)} - ${escapeHtml(block.end)} &middot; ${escapeHtml(BLOCK_TYPES[block.type]?.label || "Otro")}</small>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function renderBlockEditor(slots) {
  if (!selectedBlock || !slots.length) {
    return `
      <aside class="panel block-editor">
        <div class="empty-state">No hay bloques para editar con esta configuracion.</div>
      </aside>
    `;
  }

  const block = getBlock(selectedBlock.day, selectedBlock.start);
  const slot = slots.find((item) => item.key === selectedBlock.start);
  const blockStart = block.start || slot?.labelStart || selectedBlock.start;
  const blockEnd = block.end || slot?.labelEnd || addMinutesToTime(blockStart, Number(state.settings.blockMinutes));
  const title = `${DAY_NAMES[selectedBlock.day]} ${blockStart} - ${blockEnd}`;

  return `
    <aside class="panel block-editor">
      <div class="panel-header">
        <h3>${escapeHtml(title)}</h3>
      </div>
      <form id="blockForm" class="grid">
        <input type="hidden" name="day" value="${selectedBlock.day}">
        <input type="hidden" name="originalStart" value="${escapeAttr(selectedBlock.start)}">
        <input type="hidden" name="originalEnd" value="${escapeAttr(blockEnd)}">
        <div class="grid two">
          <div class="field">
            <label for="blockStart">Inicio</label>
            <input id="blockStart" name="start" type="time" value="${escapeAttr(blockStart)}" required>
          </div>
          <div class="field">
            <label for="blockEnd">Término</label>
            <input id="blockEnd" name="end" type="time" value="${escapeAttr(blockEnd)}" required>
          </div>
        </div>
        <div class="field full">
          <label for="blockType">Tipo</label>
          <select id="blockType" name="type">${blockTypeOptions(block.type)}</select>
        </div>
        <div class="field full">
          <label for="blockCourse">Ramo</label>
          <select id="blockCourse" name="courseId">${courseSelectOptions(block.courseId, true)}</select>
        </div>
        <div class="field full">
          <label for="blockTitle">Detalle</label>
          <input id="blockTitle" name="title" type="text" value="${escapeAttr(block.title || "")}" placeholder="Ej. catedra, repaso, traslado campus">
        </div>
        <div class="actions">
          <button class="button primary" type="submit">Guardar bloque</button>
          <button class="button danger" type="button" data-action="clear-block">Dejar libre</button>
        </div>
      </form>
    </aside>
  `;
}

function renderCustomBlockRow(block) {
  const course = getCourse(block.courseId);
  return `
    <article class="custom-block-row type-${block.type}">
      <form class="custom-block-edit-form form-grid" data-block-id="${block.id}">
        <div class="field">
          <label>Día</label>
          <select name="day">${dayOptions(block.day)}</select>
        </div>
        <div class="field">
          <label>Inicio</label>
          <input name="start" type="time" value="${escapeAttr(block.start)}" required>
        </div>
        <div class="field">
          <label>Término</label>
          <input name="end" type="time" value="${escapeAttr(block.end)}" required>
        </div>
        <div class="field">
          <label>Tipo</label>
          <select name="type">${blockTypeOptions(block.type)}</select>
        </div>
        <div class="field">
          <label>Ramo</label>
          <select name="courseId">${courseSelectOptions(block.courseId, true)}</select>
        </div>
        <div class="field wide">
          <label>Detalle</label>
          <input name="title" type="text" value="${escapeAttr(block.title || "")}" placeholder="${escapeAttr(course?.name || "Detalle")}">
        </div>
        <div class="field custom-block-actions">
          <button class="button primary" type="submit">Guardar</button>
          <button class="button danger" type="button" data-action="delete-custom-block" data-block-id="${block.id}">Eliminar</button>
        </div>
      </form>
    </article>
  `;
}

function renderCourseCard(course) {
  const average = getCourseAverage(course);
  const pending = getPendingHoursForCourse(course.id);
  const gradeRows = course.grades.length ? course.grades.map((grade) => `
    <tr>
      <td>${escapeHtml(grade.label)}</td>
      <td>${formatGrade(grade.grade)}</td>
      <td>${formatPercent(grade.weight)}</td>
      <td><button class="icon-button danger" type="button" data-action="delete-grade" data-course-id="${course.id}" data-grade-id="${grade.id}" title="Eliminar nota">x</button></td>
    </tr>
  `).join("") : `<tr><td colspan="4" class="muted">Sin notas registradas.</td></tr>`;

  return `
    <details class="course-row">
      <summary class="course-summary">
        <span class="color-dot" style="background:${course.color}"></span>
        <span class="course-title">
          <strong>${escapeHtml(course.name)}</strong>
          <span>${escapeHtml(course.code || "Sin codigo")}</span>
        </span>
        <span class="course-stats">
          <span class="pill">Prioridad ${course.priority}</span>
          <span class="pill">Dificultad ${course.difficulty}</span>
          <span class="pill">Prom. ${average ? formatGrade(average) : "--"}</span>
          <span class="pill">${formatHours(pending)} pendientes</span>
        </span>
      </summary>
      <div class="course-body">
        <form class="course-edit-form form-grid" data-course-id="${course.id}">
          <div class="field wide">
            <label>Nombre</label>
            <input name="name" type="text" value="${escapeAttr(course.name)}" required>
          </div>
          <div class="field">
            <label>Código</label>
            <input name="code" type="text" value="${escapeAttr(course.code)}">
          </div>
          <div class="field">
            <label>Créditos</label>
            <input name="credits" type="number" min="0" max="30" step="1" value="${Number(course.credits)}">
          </div>
          <div class="field">
            <label>Meta nota</label>
            <input name="targetGrade" type="number" min="1" max="7" step="0.1" value="${Number(course.targetGrade)}">
          </div>
          <div class="field">
            <label>Prioridad</label>
            <div class="range-wrap">
              <input class="range-live" name="priority" type="range" min="1" max="5" value="${Number(course.priority)}">
              <output>${Number(course.priority)}</output>
            </div>
          </div>
          <div class="field">
            <label>Dificultad</label>
            <div class="range-wrap">
              <input class="range-live" name="difficulty" type="range" min="1" max="5" value="${Number(course.difficulty)}">
              <output>${Number(course.difficulty)}</output>
            </div>
          </div>
          <div class="field">
            <label>Color</label>
            <input name="color" type="color" value="${escapeAttr(course.color)}">
          </div>
          <div class="field full actions">
            <button class="button primary" type="submit">Guardar ramo</button>
            <button class="button danger" type="button" data-action="delete-course" data-course-id="${course.id}">Eliminar ramo</button>
          </div>
        </form>

        <div class="grid two">
          <div>
            <h3>Notas</h3>
            <table class="grade-table">
              <thead>
                <tr><th>Item</th><th>Nota</th><th>Peso</th><th></th></tr>
              </thead>
              <tbody>${gradeRows}</tbody>
            </table>
          </div>
          <form class="grade-form form-grid" data-course-id="${course.id}">
            <div class="field full">
              <label>Item</label>
              <input name="label" type="text" placeholder="Ej. Interrogación 1" required>
            </div>
            <div class="field">
              <label>Nota</label>
              <input name="grade" type="number" min="1" max="7" step="0.1" value="5.0" required>
            </div>
            <div class="field">
              <label>Peso %</label>
              <input name="weight" type="number" min="0" max="100" step="0.5" value="10" required>
            </div>
            <div class="field">
              <button class="button" type="submit">Agregar nota</button>
            </div>
          </form>
        </div>

        <section class="grade-simulator">
          <h3>Simulador de nota final</h3>
          <form class="grade-simulator-form form-grid" data-course-id="${course.id}">
            <div class="field wide">
              <label>Item proyectado</label>
              <input name="label" type="text" placeholder="Ej. Examen final" required>
            </div>
            <div class="field">
              <label>Nota proyectada</label>
              <input name="grade" type="number" min="1" max="7" step="0.1" value="5.0" required>
            </div>
            <div class="field">
              <label>Peso %</label>
              <input name="weight" type="number" min="0" max="100" step="0.5" value="30" required>
            </div>
            <div class="field">
              <button class="button" type="submit">Simular</button>
            </div>
            <div class="field full">
              <p class="grade-simulator-result muted" aria-live="polite">Ingresa una nota proyectada para simular el resultado.</p>
            </div>
          </form>
        </section>
      </div>
    </details>
  `;
}

function renderAssessmentCard(item) {
  const course = getCourse(item.courseId);
  const pending = getPendingHours(item);
  const effectiveHours = getEffectiveEstimatedHours(item);
  const progress = effectiveHours > 0 ? clampNumber((item.completedHours / effectiveHours) * 100, 0, 100, 0) : 100;
  const dueState = getDueState(item.dueDate);
  const hoursSource = getHoursSourceLabel(item);

  return `
    <article class="assessment-row ${getAssessmentVisualState(item)}">
      <div class="assessment-top">
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <div class="actions">
            <span class="pill">${escapeHtml(ASSESSMENT_TYPES[item.type] || "Otro")}</span>
            <span class="pill">${escapeHtml(course?.name || "Sin ramo")}</span>
            <span class="pill">${escapeHtml(formatLongDate(item.dueDate))}</span>
            <span class="pill">${escapeHtml(dueState)}</span>
            <span class="pill">${formatPercent(item.weightPercent || 0)}</span>
            <span class="pill">Dif. ${Number(item.difficulty || 3)}</span>
            <span class="pill state-pill ${getAssessmentVisualState(item)}">${escapeHtml(item.status || "pendiente")}</span>
          </div>
        </div>
        <div class="actions">
          <button class="button" type="button" data-action="mark-done" data-assessment-id="${item.id}">${item.done ? "Reabrir" : "Listo"}</button>
          <button class="button danger" type="button" data-action="delete-assessment" data-assessment-id="${item.id}">Eliminar</button>
        </div>
      </div>
      <div>
        <div class="progress" aria-label="Avance"><span style="width:${progress}%"></span></div>
        <p class="muted" style="margin:8px 0 0;">${formatHours(item.completedHours)} hechas de ${formatHours(effectiveHours)} (${hoursSource}); quedan ${formatHours(pending)}.</p>
      </div>
      <form class="assessment-edit-form form-grid" data-assessment-id="${item.id}">
        <div class="field wide">
          <label>Título</label>
          <input name="title" type="text" value="${escapeAttr(item.title)}" required>
        </div>
        <div class="field">
          <label>Ramo</label>
          <select name="courseId">${courseSelectOptions(item.courseId)}</select>
        </div>
        <div class="field">
          <label>Tipo</label>
          <select name="type">${assessmentTypeOptions(item.type)}</select>
        </div>
        <div class="field">
          <label>Fecha</label>
          <input name="dueDate" type="date" value="${escapeAttr(item.dueDate)}" required>
        </div>
        <div class="field">
          <label>Horas estimadas</label>
          <input name="estimatedHours" type="number" min="0" max="200" step="0.25" value="${Number(item.estimatedHours)}">
        </div>
        <div class="field">
          <label>Ponderación %</label>
          <input name="weightPercent" type="number" min="0" max="100" step="0.5" value="${Number(item.weightPercent || 0)}">
        </div>
        <div class="field">
          <label>Horas hechas</label>
          <input name="completedHours" type="number" min="0" max="200" step="0.25" value="${Number(item.completedHours)}">
        </div>
        <div class="field">
          <label>Importancia</label>
          <div class="range-wrap">
            <input class="range-live" name="importance" type="range" min="1" max="5" value="${Number(item.importance)}">
            <output>${Number(item.importance)}</output>
          </div>
        </div>
        <div class="field">
          <label>Dificultad</label>
          <div class="range-wrap">
            <input class="range-live" name="difficulty" type="range" min="1" max="5" value="${Number(item.difficulty || 3)}">
            <output>${Number(item.difficulty || 3)}</output>
          </div>
        </div>
        <div class="field">
          <label>Estado</label>
          <select name="status">
            ${assessmentStatusOptions(item.status)}
          </select>
        </div>
        <div class="field wide">
          <label>Temas</label>
          <input name="topics" type="text" value="${escapeAttr(item.topics || "")}" placeholder="Temas o unidades">
        </div>
        <div class="field">
          <button class="button primary" type="submit">Guardar</button>
        </div>
      </form>
    </article>
  `;
}

function renderPlanDay(day) {
  return `
    <article class="plan-day">
      <header>
        <h3>${escapeHtml(formatLongDate(day.date))}</h3>
        <span class="pill">${formatHours(day.totalHours)}</span>
      </header>
      ${renderPlanDayBody(day, false)}
    </article>
  `;
}

function renderPlanDayBody(day, compact) {
  if (!day || !day.items.length) return emptyState("Sin bloques de estudio planificados.");
  return `
    <div class="plan-list">
      ${day.items.map((item) => {
        const course = getCourse(item.courseId);
        const assessment = state.assessments.find((entry) => entry.id === item.assessmentId);
        return `
          <div class="plan-item ${item.completed ? "completed" : ""} ${item.pending ? "pending" : ""} ${item.isBreak ? "plan-break" : ""} ${item.isSchedule ? "plan-schedule" : ""}">
            <div class="plan-time">${escapeHtml(item.start)} - ${escapeHtml(item.end)}</div>
            <div class="plan-task">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(course?.name || "Ramo flexible")} &middot; ${escapeHtml(assessment?.title || "Sin evaluación asociada")} &middot; ${escapeHtml(TASK_TYPES[item.taskType] || "sesión")} &middot; ${escapeHtml(item.reason)}</span>
              <span>${escapeHtml(course?.name || "Ramo flexible")} &middot; ${escapeHtml(item.reason)} &middot; ${escapeHtml(item.description || TASK_TYPES[item.taskType] || "sesión")}</span>
            </div>
            <span class="pill">${item.isBreak ? `${Number(item.duration || 0)} min` : item.isSchedule ? escapeHtml(item.typeLabel) : formatHours(item.hours)}</span>
            ${item.isBreak || item.isSchedule ? "" : `
              <div class="plan-actions">
                <button class="button" type="button" data-action="start-pomodoro" data-session-id="${escapeAttr(item.id)}" data-title="${escapeAttr(item.title)}" data-duration="${Math.max(1, Math.round(Number(item.hours || 0) * 60))}">&#9654; Iniciar</button>
                <button class="button" type="button" data-action="toggle-session" data-session-id="${escapeAttr(item.id)}">${item.completed ? "Pendiente" : "Completar"}</button>
              </div>
            `}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function generateWeeklyView(plan) {
  return plan.days.slice(0, 7).map((day) => {
    const courses = [...new Set(day.items.map((item) => item.courseId).filter(Boolean))]
      .map((id) => getCourse(id)?.name)
      .filter(Boolean)
      .slice(0, 3);
    const upcoming = state.assessments
      .filter((item) => !item.done && diffDays(day.date, item.dueDate) >= 0 && diffDays(day.date, item.dueDate) <= 7)
      .slice(0, 3);
    const ratio = day.availableHours ? day.totalHours / day.availableHours : 0;
    const load = ratio >= 1 || day.totalHours >= Number(state.settings.maxStudyHoursPerDay || DEFAULT_MAX_STUDY_HOURS_PER_DAY) ? "crítico" : ratio >= 0.75 ? "alto" : ratio >= 0.45 ? "medio" : "bajo";
    return { ...day, courses, upcoming, load };
  });
}

function renderWeeklyRow(day) {
  return `
    <div class="weekly-row">
      <strong>${escapeHtml(formatLongDate(day.date))}</strong>
      <span>${formatHours(day.availableHours)} disponibles</span>
      <span>${formatHours(day.totalHours)} planificadas</span>
      <span class="load-${day.load === "crítico" ? "critical" : day.load}">${escapeHtml(day.load)}</span>
      <span>${escapeHtml(day.courses.length ? day.courses.join(", ") : "Sin ramos principales")} &middot; ${escapeHtml(day.upcoming.length ? day.upcoming.map((item) => item.title).join(", ") : "Sin evaluaciones próximas")}</span>
    </div>
  `;
}

function renderCompactAssessment(item) {
  const course = getCourse(item.courseId);
  const effectiveHours = getEffectiveEstimatedHours(item);
  return `
    <div class="compact-row">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(course?.name || "Sin ramo")} &middot; ${escapeHtml(ASSESSMENT_TYPES[item.type] || "Otro")} &middot; ${escapeHtml(formatLongDate(item.dueDate))} &middot; ${formatPercent(item.weightPercent || 0)}</span>
      <div class="progress"><span style="width:${effectiveHours ? clampNumber((item.completedHours / effectiveHours) * 100, 0, 100, 0) : 100}%"></span></div>
    </div>
  `;
}

function renderMilestoneRow(item) {
  const course = getCourse(item.courseId);
  const effectiveHours = getEffectiveEstimatedHours(item);
  const pending = getPendingHours(item);
  const progress = effectiveHours ? clampNumber((item.completedHours / effectiveHours) * 100, 0, 100, 0) : 100;
  const status = item.done ? "Completado" : `${formatHours(pending)} pendientes`;

  return `
    <article class="milestone-row ${item.done ? "done" : ""} ${getAssessmentVisualState(item)}">
      <div class="milestone-check">
        <input
          type="checkbox"
          ${item.done ? "checked" : ""}
          aria-label="${item.done ? "Reabrir" : "Completar"} ${escapeAttr(item.title)}"
          data-action="mark-done"
          data-assessment-id="${item.id}"
        >
      </div>
      <div class="milestone-main">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(course?.name || "Sin ramo")} &middot; ${escapeHtml(ASSESSMENT_TYPES[item.type] || "Otro")} &middot; ${escapeHtml(formatLongDate(item.dueDate))} &middot; Importancia ${Number(item.importance || 3)}</span>
        <div class="progress"><span style="width:${progress}%"></span></div>
      </div>
      <div class="milestone-meta">
        <span class="pill state-pill ${getAssessmentVisualState(item)}">${escapeHtml(status)}</span>
        <span class="pill">${formatPercent(item.weightPercent || 0)}</span>
        <button class="icon-button danger" type="button" data-action="delete-assessment" data-assessment-id="${item.id}" title="Eliminar hito">x</button>
      </div>
    </article>
  `;
}

function renderPressureRow(row) {
  const course = getCourse(row.courseId);
  const score = clampNumber(row.score * 9, 4, 100, 0);
  return `
    <div class="compact-row">
      <div class="assessment-top">
        <div>
          <strong>${escapeHtml(course?.name || "Ramo")}</strong>
          <span>Prioridad ${course?.priority || 3} &middot; ${formatHours(row.pending)} pendientes &middot; Prom. ${row.average ? formatGrade(row.average) : "--"}</span>
        </div>
        <span class="pill">${Math.round(score)}%</span>
      </div>
      <div class="progress"><span style="width:${score}%; background:${course?.color || "var(--accent)"}"></span></div>
    </div>
  `;
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function bindInlineTabButtons() {
  appContent.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ui.activeTab = button.dataset.tab;
      render();
    });
  });
}

// ===== Formularios y eventos =====

function addCourse(form) {
  const data = new FormData(form);
  state.courses.push({
    id: uid("ramo"),
    name: String(data.get("name") || "").trim(),
    code: String(data.get("code") || "").trim(),
    color: selectedColor,
    priority: clampNumber(Number(data.get("priority")), 1, 5, 3),
    difficulty: clampNumber(Number(data.get("difficulty")), 1, 5, 3),
    credits: clampNumber(Number(data.get("credits")), 0, 30, 10),
    targetGrade: clampNumber(Number(data.get("targetGrade")), 1, 7, 5.5),
    grades: []
  });
  form.reset();
  selectedColor = COURSE_COLORS[state.courses.length % COURSE_COLORS.length];
  render();
}

function saveCourse(form) {
  const course = getCourse(form.dataset.courseId);
  if (!course) return;
  const data = new FormData(form);
  course.name = String(data.get("name") || "").trim();
  course.code = String(data.get("code") || "").trim();
  course.priority = clampNumber(Number(data.get("priority")), 1, 5, 3);
  course.difficulty = clampNumber(Number(data.get("difficulty")), 1, 5, 3);
  course.credits = clampNumber(Number(data.get("credits")), 0, 30, 10);
  course.targetGrade = clampNumber(Number(data.get("targetGrade")), 1, 7, 5.5);
  course.color = String(data.get("color") || course.color);
  render();
}

function deleteCourse(courseId) {
  const course = getCourse(courseId);
  if (!course) return;
  if (!confirm(`Eliminar el ramo "${course.name}" y sus evaluaciones asociadas?`)) return;
  state.courses = state.courses.filter((item) => item.id !== courseId);
  state.assessments = state.assessments.filter((item) => item.courseId !== courseId);
  Object.values(state.schedule).forEach((block) => {
    if (block.courseId === courseId) block.courseId = "";
  });
  state.customBlocks.forEach((block) => {
    if (block.courseId === courseId) block.courseId = "";
  });
  render();
}

function addGrade(form) {
  const course = getCourse(form.dataset.courseId);
  if (!course) return;
  const data = new FormData(form);
  course.grades.push({
    id: uid("nota"),
    label: String(data.get("label") || "").trim(),
    grade: clampNumber(Number(data.get("grade")), 1, 7, 4),
    weight: clampNumber(Number(data.get("weight")), 0, 100, 0)
  });
  render();
}

function simulateFinalGrade(form) {
  const course = getCourse(form.dataset.courseId);
  if (!course) return;
  const data = new FormData(form);
  const projectedLabel = String(data.get("label") || "Item proyectado").trim();
  const projectedGrade = clampNumber(Number(data.get("grade")), 1, 7, 4);
  const projectedWeight = clampNumber(Number(data.get("weight")), 0, 100, 0);
  const currentWeighted = course.grades.reduce((sum, grade) => sum + Number(grade.grade || 0) * Number(grade.weight || 0), 0);
  const currentWeight = course.grades.reduce((sum, grade) => sum + Number(grade.weight || 0), 0);
  const totalWeight = currentWeight + projectedWeight;
  const projectedFinal = totalWeight > 0 ? (currentWeighted + projectedGrade * projectedWeight) / totalWeight : projectedGrade;
  const reachesTarget = projectedFinal >= Number(course.targetGrade || 0);
  const result = form.querySelector(".grade-simulator-result");
  if (!result) return;
  result.classList.toggle("success", reachesTarget);
  result.classList.toggle("warning", !reachesTarget);
  result.textContent = `${projectedLabel}: nota final proyectada ${formatGrade(projectedFinal)}. ${reachesTarget ? "Alcanza" : "No alcanza"} la meta ${formatGrade(course.targetGrade)}.`;
}

function deleteGrade(courseId, gradeId) {
  const course = getCourse(courseId);
  if (!course) return;
  course.grades = course.grades.filter((grade) => grade.id !== gradeId);
  render();
}

function addAssessment(form) {
  const data = new FormData(form);
  const status = normalizeAssessmentStatus(data.get("status"), false);
  state.assessments.push({
    id: uid("hito"),
    title: String(data.get("title") || "").trim(),
    courseId: String(data.get("courseId") || ""),
    type: String(data.get("type") || "otro"),
    dueDate: String(data.get("dueDate") || toISODate(new Date())),
    weightPercent: clampNumber(Number(data.get("weightPercent")), 0, 100, 0),
    importance: clampNumber(Number(data.get("importance")), 1, 5, 3),
    difficulty: clampNumber(Number(data.get("difficulty")), 1, 5, 3),
    estimatedHours: clampNumber(Number(data.get("estimatedHours")), 0, 200, 0),
    completedHours: clampNumber(Number(data.get("completedHours")), 0, 200, 0),
    status,
    topics: String(data.get("topics") || "").trim(),
    overdueDebt: 0,
    done: status === "completada"
  });
  render();
}

function saveAssessment(form) {
  const item = state.assessments.find((assessment) => assessment.id === form.dataset.assessmentId);
  if (!item) return;
  const data = new FormData(form);
  item.title = String(data.get("title") || "").trim();
  item.courseId = String(data.get("courseId") || "");
  item.type = String(data.get("type") || "otro");
  item.dueDate = String(data.get("dueDate") || toISODate(new Date()));
  item.weightPercent = clampNumber(Number(data.get("weightPercent")), 0, 100, 0);
  item.importance = clampNumber(Number(data.get("importance")), 1, 5, 3);
  item.difficulty = clampNumber(Number(data.get("difficulty")), 1, 5, 3);
  item.estimatedHours = clampNumber(Number(data.get("estimatedHours")), 0, 200, 0);
  item.status = normalizeAssessmentStatus(data.get("status"), false);
  item.topics = String(data.get("topics") || "").trim();
  const effectiveHours = getEffectiveEstimatedHours(item);
  item.completedHours = clampNumber(Number(data.get("completedHours")), 0, effectiveHours || 200, 0);
  if (item.status === "completada" || (effectiveHours > 0 && item.completedHours >= effectiveHours)) {
    item.done = true;
    item.status = "completada";
  } else if (item.done && item.completedHours < effectiveHours) {
    item.done = false;
    item.status = item.completedHours > 0 ? "en progreso" : "pendiente";
  }
  render();
}

function deleteAssessment(assessmentId) {
  if (!confirm("Eliminar esta evaluación? Los datos asociados (sesiones, horas) se perderán.")) return;
  state.assessments = state.assessments.filter((item) => item.id !== assessmentId);
  state.studySessions = state.studySessions.filter((session) => session.assessmentId !== assessmentId);
  render();
}

function toggleAssessmentDone(assessmentId) {
  const item = state.assessments.find((assessment) => assessment.id === assessmentId);
  if (!item) return;
  const effectiveHours = getEffectiveEstimatedHours(item);
  item.done = !item.done;
  if (item.done) {
    item.completedHours = effectiveHours;
    item.status = "completada";
  } else if (Number(item.completedHours || 0) >= effectiveHours) {
    item.completedHours = 0;
    item.status = "pendiente";
  }
  render();
}

function toggleStudySession(sessionId) {
  const session = state.studySessions.find((item) => item.id === sessionId);
  if (!session) return;
  const assessment = state.assessments.find((item) => item.id === session.assessmentId);

  session.completed = !session.completed;
  session.pending = !session.completed;

  if (assessment) {
    const hours = roundHours(Number(session.duration || 0) / 60);
    if (session.completed) {
      assessment.completedHours = clampNumber(Number(assessment.completedHours || 0) + hours, 0, getEffectiveEstimatedHours(assessment), 0);
      assessment.overdueDebt = Math.max(0, Number(assessment.overdueDebt || 0) - hours);
      assessment.status = assessment.completedHours >= getEffectiveEstimatedHours(assessment) ? "completada" : "en progreso";
      assessment.done = assessment.status === "completada";
    } else {
      assessment.completedHours = Math.max(0, roundHours(Number(assessment.completedHours || 0) - hours));
      assessment.overdueDebt = roundHours(Number(assessment.overdueDebt || 0) + hours);
      assessment.status = assessment.completedHours > 0 ? "en progreso" : "pendiente";
      assessment.done = false;
    }
  }

  render();
}

function loadActivePomodoro() {
  try {
    const stored = JSON.parse(localStorage.getItem(POMODORO_STORAGE_KEY) || "null");
    if (!stored || !stored.sessionId) return null;
    return stored;
  } catch {
    return null;
  }
}

function saveActivePomodoro() {
  if (!activePomodoro) {
    localStorage.removeItem(POMODORO_STORAGE_KEY);
    return;
  }
  localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(activePomodoro));
}

function startPomodoro(button) {
  const sessionId = button.dataset.sessionId;
  const title = button.dataset.title || "Sesión de estudio";
  const durationMinutes = clampNumber(Number(button.dataset.duration), 1, 600, 25);
  ensurePomodoroSession(sessionId, durationMinutes);
  activePomodoro = {
    sessionId,
    title,
    durationMinutes,
    endTime: Date.now() + durationMinutes * 60000,
    remainingMs: durationMinutes * 60000,
    paused: false,
    finished: false
  };
  saveActivePomodoro();
  renderPomodoroPanel();
  startPomodoroTicker();
}

function ensurePomodoroSession(sessionId, durationMinutes) {
  if (!sessionId || state.studySessions.some((session) => session.id === sessionId)) return;
  state.studySessions.push({
    id: sessionId,
    date: state.ui.selectedPlanDate || toISODate(new Date()),
    start: "",
    end: "",
    duration: durationMinutes,
    courseId: "",
    assessmentId: "",
    taskType: "theory",
    description: "Sesión de estudio",
    completed: false,
    pending: false
  });
}

function pausePomodoro() {
  if (!activePomodoro || activePomodoro.paused || activePomodoro.finished) return;
  activePomodoro.remainingMs = Math.max(0, activePomodoro.endTime - Date.now());
  activePomodoro.paused = true;
  saveActivePomodoro();
  updatePomodoroPanel();
}

function resumePomodoro() {
  if (!activePomodoro || !activePomodoro.paused || activePomodoro.finished) return;
  activePomodoro.endTime = Date.now() + Number(activePomodoro.remainingMs || 0);
  activePomodoro.paused = false;
  saveActivePomodoro();
  startPomodoroTicker();
  updatePomodoroPanel();
}

function cancelPomodoro() {
  activePomodoro = null;
  saveActivePomodoro();
  stopPomodoroTicker();
  renderPomodoroPanel();
}

function completePomodoro() {
  if (!activePomodoro) return;
  const session = state.studySessions.find((item) => item.id === activePomodoro.sessionId);
  if (!session || !session.completed) {
    toggleStudySession(activePomodoro.sessionId);
  }
  activePomodoro = null;
  saveActivePomodoro();
  stopPomodoroTicker();
  renderPomodoroPanel();
}

function startPomodoroTicker() {
  stopPomodoroTicker();
  if (!activePomodoro) return;
  updatePomodoroPanel();
  pomodoroIntervalId = setInterval(updatePomodoroPanel, 1000);
}

function stopPomodoroTicker() {
  if (!pomodoroIntervalId) return;
  clearInterval(pomodoroIntervalId);
  pomodoroIntervalId = null;
}

function getPomodoroRemainingMs() {
  if (!activePomodoro) return 0;
  if (activePomodoro.paused) return Math.max(0, Number(activePomodoro.remainingMs || 0));
  return Math.max(0, Number(activePomodoro.endTime || 0) - Date.now());
}

function renderPomodoroPanel() {
  let panel = document.getElementById("pomodoroOverlay");
  if (!activePomodoro) {
    if (panel) panel.remove();
    return;
  }

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "pomodoroOverlay";
    panel.className = "pomodoro-overlay";
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <section class="pomodoro-modal" role="dialog" aria-modal="true" aria-labelledby="pomodoroTitle">
      <div>
        <p class="eyebrow">Pomodoro</p>
        <h2 id="pomodoroTitle">${escapeHtml(activePomodoro.title)}</h2>
      </div>
      <div class="pomodoro-time" id="pomodoroTime">--:--</div>
      <div class="actions">
        <button class="button" type="button" data-action="pause-pomodoro">Pausar</button>
        <button class="button" type="button" data-action="resume-pomodoro">Reanudar</button>
        <button class="button danger" type="button" data-action="cancel-pomodoro">Cancelar</button>
        <button class="button primary" type="button" data-action="complete-pomodoro">Completar</button>
      </div>
    </section>
  `;
  updatePomodoroPanel();
}

function updatePomodoroPanel() {
  if (!activePomodoro) return;
  const remaining = getPomodoroRemainingMs();
  const time = document.getElementById("pomodoroTime");
  if (time) time.textContent = formatCountdown(remaining);

  if (remaining <= 0 && !activePomodoro.finished) {
    activePomodoro.finished = true;
    activePomodoro.paused = true;
    activePomodoro.remainingMs = 0;
    saveActivePomodoro();
    playPomodoroDoneSound();
    renderPomodoroPanel();
  }
}

function formatCountdown(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function playPomodoroDoneSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    gain.connect(ctx.destination);

    [523.25, 659.25].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start(ctx.currentTime + index * 0.18);
      osc.stop(ctx.currentTime + 0.75 + index * 0.18);
    });
  } catch {
    // El timer no depende del audio; algunos navegadores lo bloquean.
  }
}

function saveScheduleSettings(form) {
  const data = new FormData(form);
  const startTime = String(data.get("startTime") || "08:20");
  const endTime = String(data.get("endTime") || "20:00");
  const blockMinutes = clampNumber(Number(data.get("blockMinutes")), 15, 240, 60);

  if (parseTime(startTime) >= parseTime(endTime)) {
    alert("La hora de inicio debe ser anterior a la hora de termino.");
    return;
  }

  state.settings.startTime = startTime;
  state.settings.endTime = endTime;
  state.settings.blockMinutes = blockMinutes;
  selectedBlock = null;
  render();
}

function saveBlock(form) {
  const data = new FormData(form);
  const day = Number(data.get("day"));
  const originalStart = String(data.get("originalStart") || data.get("start"));
  const originalEnd = String(data.get("originalEnd") || data.get("end"));
  const start = String(data.get("start"));
  const end = String(data.get("end"));
  const type = normalizeBlockType(data.get("type") || "free");
  const courseId = String(data.get("courseId") || "");
  const title = String(data.get("title") || "").trim();
  const key = scheduleKey(day, originalStart);

  if (parseTime(start) >= parseTime(end)) {
    alert("El bloque debe terminar después de comenzar.");
    return;
  }

  if (type === "free" && !courseId && !title) {
    delete state.schedule[key];
  } else {
    state.schedule[key] = { type, courseId, title, start, end };
  }
  render();
}

function addCustomBlock(form) {
  const block = readCustomBlockForm(form);
  if (!block) return;
  state.customBlocks.push({ id: uid("bloque"), ...block });
  form.reset();
  render();
}

function saveCustomBlock(form) {
  const block = state.customBlocks.find((item) => item.id === form.dataset.blockId);
  if (!block) return;
  const next = readCustomBlockForm(form);
  if (!next) return;
  Object.assign(block, next);
  render();
}

function deleteCustomBlock(blockId) {
  state.customBlocks = state.customBlocks.filter((block) => block.id !== blockId);
  render();
}

function readCustomBlockForm(form) {
  const data = new FormData(form);
  const block = {
    day: clampNumber(Number(data.get("day")), 0, 6, 0),
    start: String(data.get("start") || state.settings.startTime),
    end: String(data.get("end") || state.settings.endTime),
    type: normalizeBlockType(data.get("type") || "free"),
    courseId: String(data.get("courseId") || ""),
    title: String(data.get("title") || "").trim()
  };

  if (parseTime(block.start) >= parseTime(block.end)) {
    alert("El bloque debe terminar después de comenzar.");
    return null;
  }

  if (!BLOCK_TYPES[block.type]) block.type = "free";
  return block;
}

function clearSelectedBlock() {
  if (!selectedBlock) return;
  delete state.schedule[scheduleKey(selectedBlock.day, selectedBlock.start)];
  render();
}

function savePlannerSettings(form) {
  const data = new FormData(form);
  const days = clampNumber(Number(data.get("planDays")), 1, 45, 14);
  state.settings.planDays = days;
  state.settings.planningHorizonDays = days;
  state.settings.maxStudyHoursPerDay = clampNumber(Number(data.get("maxStudyHoursPerDay")), 1, 12, DEFAULT_MAX_STUDY_HOURS_PER_DAY);
  state.settings.preferredBlockMinutes = clampNumber(Number(data.get("preferredBlockMinutes")), 30, 120, 75);
  if (data.has("breakMinutes")) {
    state.settings.breakMinutes = clampNumber(Number(data.get("breakMinutes")), 0, 45, 10);
  }
  state.settings.studyCycleMinutes = clampNumber(Number(data.get("studyCycleMinutes")), 30, 240, 120);
  state.settings.cycleBreakMinutes = clampNumber(Number(data.get("cycleBreakMinutes")), 5, 90, 30);
  state.settings.maxConsecutiveStudyMinutes = state.settings.studyCycleMinutes;
  state.settings.minStudySessionMinutes = clampNumber(Number(data.get("minStudySessionMinutes")), 10, 90, 30);
  render();
}

function saveDailyPlanDate(form) {
  const date = String(new FormData(form).get("selectedPlanDate") || toISODate(new Date()));
  state.ui.selectedPlanDate = date;
  setAutosaveMessage(`Plan diario actualizado para ${formatLongDate(date)}`);
  render();
}

function regenerateDailyPlan(date) {
  const targetDate = String(date || state.ui.selectedPlanDate || toISODate(new Date()));
  state.studySessions = state.studySessions.filter((session) => session.date !== targetDate || session.completed);
  state.ui.selectedPlanDate = targetDate;
  setAutosaveMessage(`Plan regenerado para ${formatLongDate(targetDate)}`);
  render();
}

// ===== Importación/exportación =====

function exportData() {
  const backup = JSON.stringify(state, null, 2);
  const box = document.getElementById("backupBox");
  if (box) {
    box.value = backup;
    box.select();
  }

  const blob = new Blob([backup], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dashboard-estudio-uc-${toISODate(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setAutosaveMessage("Respaldo JSON exportado");
}

function importData(form) {
  const file = form.querySelector('input[type="file"]')?.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => importDataText(String(reader.result || ""));
    reader.onerror = () => alert("No pude leer el archivo JSON.");
    reader.readAsText(file);
    return;
  }

  const text = String(new FormData(form).get("importBox") || "").trim();
  importDataText(text);
}

function importDataText(text) {
  if (!text) return;
  try {
    const imported = normalizeState(JSON.parse(text));
    Object.assign(state, imported);
    selectedBlock = null;
    setAutosaveMessage("Datos importados desde JSON");
    render();
  } catch {
    alert("No pude leer ese JSON. Revisa que sea un respaldo valido.");
  }
}

function importCalendar(form) {
  const data = new FormData(form);
  const fallbackCourseId = String(data.get("defaultCourseId") || "");
  const text = String(data.get("calendarIcsText") || "").trim();
  const file = form.querySelector('input[type="file"]')?.files?.[0];

  if (file) {
    const reader = new FileReader();
    reader.onload = () => importCalendarText(String(reader.result || ""), fallbackCourseId, form);
    reader.onerror = () => alert("No pude leer el archivo .ics.");
    reader.readAsText(file);
    return;
  }

  importCalendarText(text, fallbackCourseId, form);
}

function importCalendarText(text, fallbackCourseId, form) {
  if (!text) {
    alert("Selecciona un archivo .ics o pega el contenido ICS.");
    return;
  }

  const events = parseIcsEvents(text);
  if (!events.length) {
    alert("No encontre eventos en ese calendario.");
    return;
  }

  let imported = 0;
  let skipped = 0;
  events.forEach((event) => {
    const title = event.summary || "Evento de calendario";
    const combined = `${title} ${event.description || ""} ${event.location || ""}`;
    const dueDate = event.date;
    if (!dueDate) {
      skipped += 1;
      return;
    }

    const courseId = inferCourseId(combined) || fallbackCourseId;
    const type = inferAssessmentType(combined);
    const weightPercent = inferWeightPercent(combined);
    const exists = state.assessments.some((item) => (
      item.title === title &&
      item.dueDate === dueDate &&
      item.courseId === courseId
    ));

    if (exists) {
      skipped += 1;
      return;
    }

    state.assessments.push({
      id: uid("hito"),
      title,
      courseId,
      type,
      dueDate,
      weightPercent,
      importance: inferImportance(type, weightPercent),
      difficulty: 3,
      estimatedHours: 0,
      completedHours: 0,
      status: "pendiente",
      topics: "",
      overdueDebt: 0,
      done: false
    });
    imported += 1;
  });

  if (form) form.reset();
  render();
  alert(`Importe ${imported} eventos. ${skipped ? `${skipped} se omitieron por estar duplicados o incompletos.` : ""}`);
}

function parseIcsEvents(text) {
  const unfolded = String(text).replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let current = null;

  lines.forEach((line) => {
    if (line === "BEGIN:VEVENT") {
      current = {};
      return;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      return;
    }
    if (!current) return;

    const separator = line.indexOf(":");
    if (separator === -1) return;
    const rawKey = line.slice(0, separator);
    const key = rawKey.split(";")[0].toUpperCase();
    const value = decodeIcsText(line.slice(separator + 1));

    if (key === "SUMMARY") current.summary = value;
    if (key === "DESCRIPTION") current.description = value;
    if (key === "LOCATION") current.location = value;
    if (key === "DTSTART" || key === "DUE") current.date = current.date || icsDateToISO(value);
  });

  return events;
}

function decodeIcsText(value) {
  return String(value || "")
    .replace(/\\n/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function icsDateToISO(value) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function inferCourseId(text) {
  const normalized = normalizeText(text);
  const matches = state.courses
    .map((course) => {
      const name = normalizeText(course.name);
      const code = normalizeText(course.code || "");
      const score = (name && normalized.includes(name) ? 2 : 0) + (code && normalized.includes(code) ? 1 : 0);
      return { course, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return matches[0]?.course.id || "";
}

function inferAssessmentType(text) {
  const normalized = normalizeText(text);
  if (normalized.includes("examen")) return "examen";
  if (normalized.includes("prueba") || normalized.includes("interrogacion") || normalized.includes("i1") || normalized.includes("i2") || normalized.includes("i3")) return "prueba";
  if (normalized.includes("control")) return "control";
  if (normalized.includes("tarea")) return "tarea";
  if (normalized.includes("entrega") || normalized.includes("informe")) return "entrega";
  if (normalized.includes("lab")) return "laboratorio";
  if (normalized.includes("lectura")) return "lectura";
  return "otro";
}

function inferWeightPercent(text) {
  const match = String(text || "").match(/(\d{1,3}(?:[,.]\d+)?)\s*%/);
  if (!match) return 0;
  return clampNumber(Number(match[1].replace(",", ".")), 0, 100, 0);
}

function inferImportance(type, weightPercent) {
  const typeBoost = {
    examen: 2,
    prueba: 1,
    control: 0,
    tarea: 0,
    entrega: 1,
    laboratorio: 0,
    lectura: -1,
    otro: 0
  };
  const byWeight = weightPercent >= 30 ? 5 : weightPercent >= 20 ? 4 : weightPercent >= 10 ? 3 : 2;
  return clampNumber(byWeight + (typeBoost[type] || 0), 1, 5, 3);
}

function loadDemoData() {
  if (!confirm("Cargar datos de ejemplo reemplazara tus datos actuales. Continuar?")) return;
  Object.assign(state, createDefaultState());
  selectedBlock = null;
  render();
}

function resetData() {
  if (!confirm("Borrar todos los datos locales de este dashboard?")) return;
  Object.assign(state, {
    settings: {
      startTime: "08:20",
      endTime: "20:00",
      blockMinutes: 60,
      planDays: 14,
      maxStudyHoursPerDay: DEFAULT_MAX_STUDY_HOURS_PER_DAY,
      preferredBlockMinutes: 75,
      breakMinutes: 10,
      studyCycleMinutes: 120,
      cycleBreakMinutes: 30,
      maxConsecutiveStudyMinutes: 120,
      minStudySessionMinutes: 30,
      planningHorizonDays: 14
    },
    courses: [],
    assessments: [],
    schedule: {},
    customBlocks: [],
    weeklySchedule: [],
    milestones: [],
    studySessions: [],
    ui: { activeTab: "overview", selectedPlanDate: toISODate(new Date()), lastMessage: "Datos reseteados" }
  });
  selectedBlock = null;
  setAutosaveMessage("Datos reseteados");
  render();
}

function getMetrics() {
  const today = toISODate(new Date());
  const plan = generateStudyPlan(1);
  const todayStudyBlocks = getStudySlots(1).length;
  const pendingItems = state.assessments.filter((item) => !item.done && getPendingHours(item) > 0).length;
  const pendingHours = state.assessments.reduce((sum, item) => sum + getPendingHours(item), 0);
  const nextTwoWeeks = state.assessments.filter((item) => {
    const days = diffDays(today, item.dueDate);
    return !item.done && days >= 0 && days <= 14;
  }).length;
  const averages = state.courses.map(getCourseAverage).filter(Boolean);
  const average = averages.length ? averages.reduce((sum, value) => sum + value, 0) / averages.length : null;

  return {
    studyToday: plan.days[0]?.totalHours || 0,
    studyBlocksToday: todayStudyBlocks,
    pendingHours,
    pendingItems,
    nextTwoWeeks,
    averageLabel: average ? formatGrade(average) : "--"
  };
}

function getGeneralProgress() {
  const total = state.assessments.reduce((sum, item) => sum + getEffectiveEstimatedHours(item), 0);
  if (total <= 0) return state.assessments.length ? 100 : 0;
  const completed = state.assessments.reduce((sum, item) => sum + Math.min(getEffectiveEstimatedHours(item), Number(item.completedHours || 0)), 0);
  return clampNumber((completed / total) * 100, 0, 100, 0);
}

// ===== Generación de plan =====

function generateStudyPlan(daysCount) {
  const days = Array.from({ length: daysCount }, (_, index) => ({
    date: addDaysISO(new Date(), index),
    items: [],
    availableHours: 0,
    totalHours: 0
  }));
  const rawSlots = getStudySlots(daysCount);
  rawSlots.forEach((slot) => {
    const day = days.find((item) => item.date === slot.date);
    if (day) day.availableHours = roundHours(day.availableHours + slot.hours);
  });
  const cycled = applyStudyCycleBreaks(rawSlots);
  const slots = cycled.studySlots;
  const tasks = state.assessments
    .filter((item) => !item.done && getPendingHours(item) > 0)
    .map((item) => ({
      ...item,
      remaining: getPendingHours(item)
    }));

  let fallbackIndex = 0;
  const planStats = {
    byTask: {},
    byCourse: {},
    byDayTask: {},
    byDayCourse: {},
    sessionsByDay: {},
    closedCoursesByDay: {},
    lastTaskId: "",
    lastCourseId: ""
  };

  slots.forEach((slot) => {
    let minutesLeft = Math.round(slot.hours * 60);
    const slotItems = [];
    const minSessionMinutes = Number(state.settings.minStudySessionMinutes || 30);

    while (minutesLeft >= minSessionMinutes) {
      const task = chooseTaskForSlot(tasks, slot, planStats);
      if (!task) break;

      const minutes = Math.min(minutesLeft, getTaskAllocationMinutes(task, slot, minutesLeft, tasks));
      const hours = roundHours(minutes / 60);
      const taskMeta = buildStudyTask(task, slot.date, minutes);
      const start = addMinutesToTime(slot.start, Math.round(slot.hours * 60) - minutesLeft);
      const end = addMinutesToTime(start, minutes);
      const session = getSessionRecord({
        date: slot.date,
        start,
        end,
        duration: minutes,
        courseId: task.courseId,
        assessmentId: task.id,
        taskType: taskMeta.type,
        description: taskMeta.description
      });
      task.remaining = Math.max(0, roundHours(task.remaining - hours));
      minutesLeft -= minutes;
      registerPlannedTask(planStats, task, slot.date, hours);

      slotItems.push({
        id: session.id,
        start,
        end,
        title: taskMeta.title,
        courseId: task.courseId,
        assessmentId: task.id,
        taskType: taskMeta.type,
        description: taskMeta.description,
        completed: session.completed,
        pending: session.pending,
        hours,
        reason: buildReason(task, slot.date)
      });
    }

    if (!slotItems.length) {
      const course = chooseFallbackCourse(slot.courseId, fallbackIndex, slot);
      fallbackIndex += 1;
      if (course) {
        slotItems.push({
          id: buildSessionId({ date: slot.date, start: slot.start, courseId: course.id, assessmentId: "", taskType: "theory" }),
          start: slot.start,
          end: slot.end,
          title: slot.title || "Repaso y avance",
          courseId: course.id,
          assessmentId: "",
          taskType: "theory",
          description: "Repaso general del ramo",
          completed: false,
          pending: false,
          hours: slot.hours,
          reason: "Bloque sin hito urgente; asignado por prioridad y meta"
        });
      } else {
        slotItems.push({
          id: buildSessionId({ date: slot.date, start: slot.start, courseId: "", assessmentId: "", taskType: "theory" }),
          start: slot.start,
          end: slot.end,
          title: slot.title || "Estudio libre",
          courseId: "",
          assessmentId: "",
          taskType: "theory",
          description: "Bloque disponible para completar datos o repasar",
          completed: false,
          pending: false,
          hours: slot.hours,
          reason: "No hay ramos cargados"
        });
      }
    }

    const day = days.find((item) => item.date === slot.date);
    if (day) {
      slotItems.forEach((item) => {
        day.items.push(item);
        if (!item.isBreak) day.totalHours = roundHours(day.totalHours + item.hours);
      });
      day.items.sort((a, b) => parseTime(a.start) - parseTime(b.start));
    }
  });

  insertRecommendedBreaks(days, cycled.breaks);
  insertScheduledActivities(days, getScheduledActivities(daysCount));

  const pendingAfterPlan = roundHours(tasks.reduce((sum, task) => sum + Math.max(0, task.remaining), 0));
  const capacity = roundHours(slots.reduce((sum, slot) => sum + slot.hours, 0));
  const originalPending = roundHours(state.assessments.reduce((sum, item) => sum + getPendingHours(item), 0));
  let warning = "";
  if (originalPending > capacity && originalPending > 0) {
    warning = `Tienes ${formatHours(originalPending)} pendientes y solo ${formatHours(capacity)} de bloques de estudio en el rango. Conviene agregar bloques o reducir horas pendientes.`;
  }

  return { days, pendingAfterPlan, warning };
}

function generateDailyPlan(date = toISODate(new Date())) {
  const target = String(date || toISODate(new Date()));
  const today = toISODate(new Date());
  const offset = Math.max(0, diffDays(today, target));
  const plan = generateStudyPlan(offset + 1);
  return plan.days.find((day) => day.date === target) || { date: target, items: [], availableHours: 0, totalHours: 0 };
}

function applyStudyCycleBreaks(slots) {
  const maxDailyStudyMinutes = Math.round(Number(state.settings.maxStudyHoursPerDay || DEFAULT_MAX_STUDY_HOURS_PER_DAY) * 60);
  const cycleMinutes = Number(state.settings.maxConsecutiveStudyMinutes || state.settings.studyCycleMinutes || 120);
  const cycleBreakMinutes = Number(state.settings.cycleBreakMinutes || 30);
  const minStudySessionMinutes = Number(state.settings.minStudySessionMinutes || 30);
  const maxMergeGapMinutes = 15;
  const studySlots = [];
  const breaks = [];
  const windowsByDate = groupStudyWindowsByDate(groupContinuousStudyWindows(slots, maxMergeGapMinutes));

  Object.values(windowsByDate).forEach((dayWindows) => {
    let remainingDailyMinutes = maxDailyStudyMinutes;
    let continuousStudyMinutes = 0;

    dayWindows.forEach((window) => {
      if (remainingDailyMinutes < minStudySessionMinutes) return;
      continuousStudyMinutes = 0;
      let cursor = window.start;
      let availableWindowMinutes = window.end - window.start;

      while (availableWindowMinutes >= minStudySessionMinutes && remainingDailyMinutes >= minStudySessionMinutes) {
        if (continuousStudyMinutes >= cycleMinutes) {
          if (availableWindowMinutes >= cycleBreakMinutes + minStudySessionMinutes) {
            breaks.push(createBreakItem(window.date, formatTime(cursor), cycleBreakMinutes));
            cursor += cycleBreakMinutes;
            availableWindowMinutes -= cycleBreakMinutes;
            continuousStudyMinutes = 0;
          } else {
            continuousStudyMinutes = 0;
          }
        }

        const studyChunk = Math.min(
          availableWindowMinutes,
          remainingDailyMinutes,
          cycleMinutes - continuousStudyMinutes
        );

        if (studyChunk < minStudySessionMinutes) break;

        studySlots.push({
          date: window.date,
          dayIndex: window.dayIndex,
          start: formatTime(cursor),
          end: formatTime(cursor + studyChunk),
          hours: roundHours(studyChunk / 60),
          courseId: window.courseId || "",
          title: window.title || ""
        });

        cursor += studyChunk;
        availableWindowMinutes -= studyChunk;
        remainingDailyMinutes -= studyChunk;
        continuousStudyMinutes += studyChunk;
      }
    });
  });

  return { studySlots, breaks };
}

function groupContinuousStudyWindows(slots, maxMergeGapMinutes = 15) {
  const windows = [];

  [...slots]
    .sort((a, b) => parseISODate(a.date) - parseISODate(b.date) || parseTime(a.start) - parseTime(b.start))
    .forEach((slot) => {
      const start = parseTime(slot.start);
      const end = parseTime(slot.end);
      const duration = end - start;
      if (duration <= 0) return;

      const last = windows[windows.length - 1];
      const gap = last && last.date === slot.date ? start - last.originalEnd : Infinity;
      const continues = last && last.date === slot.date && gap >= 0 && gap <= maxMergeGapMinutes;

      if (!continues) {
        windows.push({
          date: slot.date,
          dayIndex: slot.dayIndex,
          start,
          end,
          originalEnd: end,
          studyMinutes: duration,
          courseId: slot.courseId || "",
          title: slot.title || "",
          mixed: false
        });
        return;
      }

      last.studyMinutes += duration;
      last.end = end;
      last.originalEnd = end;
      last.mixed = last.mixed || last.courseId !== (slot.courseId || "");
      if (last.mixed) last.courseId = "";
      if (slot.title && last.title !== slot.title) last.title = "";
    });

  return windows;
}

function groupStudyWindowsByDate(windows) {
  return windows
    .reduce((groups, slot) => {
      if (!groups[slot.date]) groups[slot.date] = [];
      groups[slot.date].push(slot);
      return groups;
    }, {});
}

function createBreakItem(date, start, minutes) {
  return {
    id: buildSessionId({ date, start, courseId: "", assessmentId: "", taskType: "descanso" }),
    date,
    start,
    end: addMinutesToTime(start, minutes),
    title: "Descanso recomendado",
    type: "break",
    courseId: "",
    assessmentId: "",
    taskType: "descanso",
    description: "Descanso recomendado",
    completed: false,
    pending: false,
    isBreak: true,
    hours: 0,
    duration: minutes,
    reason: "Corte automático tras un ciclo de estudio"
  };
}

function insertRecommendedBreaks(days, breaks) {
  breaks.forEach((breakItem) => {
    const day = days.find((item) => item.date === breakItem.date);
    if (!day) return;
    const hasStudyBefore = day.items.some((item) => !item.isBreak && parseTime(item.end) === parseTime(breakItem.start));
    const hasStudyAfter = day.items.some((item) => !item.isBreak && parseTime(item.start) >= parseTime(breakItem.end));
    if (!hasStudyBefore || !hasStudyAfter) return;
    if (day.items.some((item) => item.isBreak && item.start === breakItem.start)) return;
    day.items.push(breakItem);
    day.items.sort((a, b) => parseTime(a.start) - parseTime(b.start));
  });
}

function insertScheduledActivities(days, activities) {
  activities.forEach((activity) => {
    const day = days.find((item) => item.date === activity.date);
    if (!day) return;
    day.items.push(activity);
    day.items.sort((a, b) => parseTime(a.start) - parseTime(b.start));
  });
}

function getScheduledActivities(daysCount) {
  const slots = getScheduleRows();
  const today = new Date();
  const result = [];

  for (let offset = 0; offset < daysCount; offset += 1) {
    const date = addDaysISO(today, offset);
    const dayIndex = dayIndexFromDate(parseISODate(date));

    slots.forEach((slot) => {
      const block = getBlock(dayIndex, slot.key);
      if (block.type === "free" || block.type === "study") return;
      const start = block.start || slot.labelStart;
      const end = block.end || slot.labelEnd;
      const course = getCourse(block.courseId);
      const typeLabel = BLOCK_TYPES[block.type]?.label || "Actividad";
      result.push({
        id: `schedule-${date}-${dayIndex}-${start}-${block.type}`,
        date,
        start,
        end,
        title: block.title || course?.name || typeLabel,
        courseId: block.courseId || "",
        assessmentId: "",
        taskType: "schedule",
        description: course ? `${typeLabel}: ${course.name}` : typeLabel,
        typeLabel,
        completed: false,
        pending: false,
        isSchedule: true,
        hours: 0,
        reason: "Horario del día"
      });
    });

    state.customBlocks.forEach((block) => {
      if (block.day !== dayIndex || block.type === "free" || block.type === "study") return;
      const course = getCourse(block.courseId);
      const typeLabel = BLOCK_TYPES[block.type]?.label || "Actividad";
      result.push({
        id: `schedule-${date}-${block.id}`,
        date,
        start: block.start,
        end: block.end,
        title: block.title || course?.name || typeLabel,
        courseId: block.courseId || "",
        assessmentId: "",
        taskType: "schedule",
        description: course ? `${typeLabel}: ${course.name}` : typeLabel,
        typeLabel,
        completed: false,
        pending: false,
        isSchedule: true,
        hours: 0,
        reason: "Horario del día"
      });
    });
  }

  return result;
}

function limitSlotsByDailyMaximum(slots) {
  const maxMinutes = Math.round(Number(state.settings.maxStudyHoursPerDay || DEFAULT_MAX_STUDY_HOURS_PER_DAY) * 60);
  const used = {};
  const result = [];

  slots.forEach((slot) => {
    const current = used[slot.date] || 0;
    if (current >= maxMinutes) return;
    const available = Math.min(Math.round(slot.hours * 60), maxMinutes - current);
    if (available < 25) return;
    result.push({
      ...slot,
      end: addMinutesToTime(slot.start, available),
      hours: roundHours(available / 60)
    });
    used[slot.date] = current + available;
  });

  return result;
}

function buildStudyTask(task, date, minutes) {
  const course = getCourse(task.courseId);
  const days = diffDays(date, task.dueDate);
  const topic = pickTopic(task);
  let type = "theory";

  if (days <= 1) type = minutes >= 75 ? "mock" : "summary";
  else if (days <= 3) type = "errors";
  else if (days <= 7) type = "exercises";
  else type = task.remaining > getEffectiveEstimatedHours(task) * 0.55 ? "theory" : "exercises";

  if (task.type === "tarea" || task.type === "entrega" || task.type === "laboratorio") type = days <= 2 ? "errors" : "exercises";

  const titleCourse = course?.name || "Ramo flexible";
  const action = days <= 1 ? `${TASK_TYPES.finalReview} + ${TASK_TYPES[type]}` : TASK_TYPES[type] || "estudio";
  return {
    type,
    title: `${titleCourse}: ${action} de ${topic}`,
    description: `${ASSESSMENT_TYPES[task.type] || "Hito"}: ${task.title} — ${Math.round(minutes)} min`
  };
}

function pickTopic(task) {
  const topics = String(task.topics || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (topics.length) {
    const index = Math.abs(diffDays(toISODate(new Date()), task.dueDate)) % topics.length;
    return topics[index];
  }
  if (task.type === "examen" || task.type === "prueba") return "contenidos clave";
  if (task.type === "tarea") return "problemas pendientes";
  if (task.type === "entrega" || task.type === "laboratorio") return "informe y resultados";
  return "materia prioritaria";
}

function getSessionRecord(seed) {
  const id = buildSessionId(seed);
  const existing = state.studySessions.find((session) => session.id === id);
  if (existing) return existing;
  const session = { id, ...seed, completed: false, pending: false };
  state.studySessions.push(session);
  return session;
}

function buildSessionId(seed) {
  return [
    "sesion",
    seed.date,
    seed.start || "00:00",
    seed.courseId || "sin-ramo",
    seed.assessmentId || "general",
    seed.taskType || "tarea"
  ].join("-");
}

function getAssessmentDebt(assessmentId) {
  return state.studySessions.filter((session) => session.assessmentId === assessmentId && session.pending).length;
}

// ===== Algoritmo de prioridad =====

function chooseTaskForSlot(tasks, slot, stats) {
  const today = toISODate(new Date());
  let candidates = tasks.filter((task) => {
    if (task.remaining <= 0.04) return false;
    if (slot.courseId && task.courseId !== slot.courseId) return false;
    const overdue = diffDays(task.dueDate, today) > 0;
    return overdue || diffDays(slot.date, task.dueDate) >= 0;
  });

  if (!candidates.length && slot.courseId) {
    candidates = tasks.filter((task) => task.remaining > 0.04 && diffDays(slot.date, task.dueDate) >= 0);
  }

  candidates = applyTemporalPriorityWindow(candidates, slot.date);
  candidates = avoidClosedCourseReturns(candidates, slot.date, stats);

  if (!candidates.length) return null;

  return candidates
    .map((task) => ({ task, score: calculateAssessmentPriority(task, getCourse(task.courseId), slot.date, stats) + scoreTask(task, slot, stats) * 0.25 }))
    .sort((a, b) => b.score - a.score || diffDays(a.task.dueDate, b.task.dueDate))[0].task;
}

function calculateAssessmentPriority(assessment, course, today, stats = {}) {
  if (!assessment || assessment.done || assessment.status === "completada") return -Infinity;

  const daysUntil = diffDays(today, assessment.dueDate);
  const overdue = daysUntil < 0;
  const closeness = overdue ? 180 + Math.abs(daysUntil) * 28 : getDeadlineUrgency(daysUntil);
  const importance = Number(assessment.importance || 3) * 22;
  const courseDifficulty = Number(course?.difficulty || course?.priority || 3) * 13;
  const assessmentDifficulty = Number(assessment.difficulty || 3) * 15;
  const remaining = Number(assessment.remaining ?? getPendingHours(assessment));
  const estimated = Math.max(1, getEffectiveEstimatedHours(assessment));
  const remainingPressure = remaining * 12 + (remaining / estimated) * 35;
  const overdueDebt = getAssessmentDebt(assessment.id) * 32 + Number(assessment.overdueDebt || 0) * 18;
  const statusBoost = assessment.status === "en progreso" ? 16 : 0;
  const courseKey = assessment.courseId || "none";
  const courseHours = Number(stats.byCourse?.[courseKey] || 0);
  const totalPlanned = Object.values(stats.byCourse || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const courseShare = totalPlanned > 0 ? courseHours / totalPlanned : 0;
  const balancePenalty = courseShare > 0.45 && daysUntil > 2 ? (courseShare - 0.45) * 90 : 0;
  const basePriority = Number(course?.priority || 3) * 12;

  return closeness + importance + courseDifficulty + assessmentDifficulty + remainingPressure + overdueDebt + statusBoost + basePriority - balancePenalty;
}

function scoreTask(task, slot, stats = {}) {
  const course = getCourse(task.courseId);
  const daysUntil = diffDays(slot.date, task.dueDate);
  const overdue = daysUntil < 0;
  const urgency = overdue ? 500 + Math.abs(daysUntil) * 20 : getDeadlineUrgency(daysUntil);
  const priority = course ? course.priority * 3 : 8;
  const gradeGap = course ? Math.max(0, course.targetGrade - (getCourseAverage(course) || course.targetGrade)) * 4 : 0;
  const pinned = slot.courseId && slot.courseId === task.courseId ? 12 : 0;
  const weight = Number(task.weightPercent || 0) * 0.7;
  const importance = Number(task.importance || 3) * 4;
  const remainingRatio = task.remaining / Math.max(1, getEffectiveEstimatedHours(task));
  const remainingNeed = remainingRatio * 6;
  const timeBias = getTimeOfDayBias(task, slot);
  const sessionBias = getSessionContinuityBias(task, slot, stats);
  const dayTaskHours = getStatHours(stats.byDayTask, slot.date, task.id);
  const dayCourseHours = getStatHours(stats.byDayCourse, slot.date, task.courseId || "none");
  const totalTaskHours = Number(stats.byTask?.[task.id] || 0);
  const totalCourseHours = Number(stats.byCourse?.[task.courseId || "none"] || 0);
  const repetitionPenalty = dayTaskHours * 22 + dayCourseHours * 9 + totalTaskHours * 2 + totalCourseHours * 0.6;
  const lastPenalty = (stats.lastTaskId === task.id ? 24 : 0) + (task.courseId && stats.lastCourseId === task.courseId ? 8 : 0);
  const nearDeadlineShield = daysUntil <= 3 ? 80 : daysUntil <= 7 ? 45 : daysUntil <= 14 ? 20 : 0;
  return urgency + priority + gradeGap + pinned + weight + importance + remainingNeed + nearDeadlineShield + timeBias + sessionBias - repetitionPenalty - lastPenalty;
}

function getSessionContinuityBias(task, slot, stats) {
  const courseKey = task.courseId || "none";
  const session = stats.sessionsByDay?.[slot.date];
  const closed = stats.closedCoursesByDay?.[slot.date] || {};
  let bias = 0;

  if (closed[courseKey]) bias -= 260;
  if (!session || !session.courseId) return bias;

  if (session.courseId === courseKey) {
    if (session.minutes < 95) return bias + 190;
    if (session.minutes < 125) return bias + 95;
    if (session.minutes < 150) return bias + 25;
    return bias - 80;
  }

  if (session.minutes < 95) return bias - 210;
  if (session.minutes < 125) return bias - 90;
  return bias + 35;
}

function getTimeOfDayBias(task, slot) {
  const start = parseTime(slot.start);
  const load = getTaskCognitiveLoad(task);

  if (start < parseTime("12:00")) return load * 14;
  if (start < parseTime("15:30")) return load * 5;
  if (start < parseTime("17:30")) return (6 - load) * 5;
  if (start < parseTime("19:00")) return (6 - load) * 11 - load * 3;
  return (6 - load) * 14 - load * 5;
}

function getTaskCognitiveLoad(task) {
  const course = getCourse(task.courseId);
  const coursePriority = Number(course?.priority || 3);
  const assessmentImportance = Number(task.importance || 3);
  const weightLoad = Number(task.weightPercent || 0) >= 30 ? 5 : Number(task.weightPercent || 0) >= 20 ? 4 : Number(task.weightPercent || 0) >= 10 ? 3 : 2;
  const typeLoad = task.type === "examen" ? 5 : task.type === "prueba" ? 4 : task.type === "control" ? 3 : task.type === "lectura" ? 2 : 3;
  return clampNumber(coursePriority * 0.45 + assessmentImportance * 0.3 + weightLoad * 0.15 + typeLoad * 0.1, 1, 5, 3);
}

function applyTemporalPriorityWindow(candidates, date) {
  if (!candidates.length) return candidates;
  const daysList = candidates.map((task) => diffDays(date, task.dueDate));
  const closest = Math.min(...daysList);
  let horizon = Infinity;

  if (closest <= 0) horizon = 7;
  else if (closest <= 7) horizon = 30;
  else if (closest <= 14) horizon = 35;
  else if (closest <= 30) horizon = 45;

  const filtered = candidates.filter((task) => diffDays(date, task.dueDate) <= horizon);
  return filtered.length ? filtered : candidates;
}

function avoidClosedCourseReturns(candidates, date, stats) {
  const closed = stats.closedCoursesByDay?.[date] || {};
  const open = candidates.filter((task) => !closed[task.courseId || "none"]);
  return open.length ? open : candidates;
}

function getDeadlineUrgency(daysUntil) {
  if (daysUntil <= 0) return 420;
  if (daysUntil <= 3) return 320 - daysUntil * 25;
  if (daysUntil <= 7) return 240 - daysUntil * 18;
  if (daysUntil <= 14) return 120 - daysUntil * 5;
  if (daysUntil <= 30) return 62 - daysUntil * 1.2;
  if (daysUntil <= 45) return 18;
  return 4;
}

function getTaskAllocationMinutes(task, slot, minutesLeft, tasks) {
  const remainingMinutes = Math.ceil(task.remaining * 60);
  const minSessionMinutes = Number(state.settings.minStudySessionMinutes || 30);
  return Math.min(minutesLeft, Math.max(minSessionMinutes, remainingMinutes));
}

function registerPlannedTask(stats, task, date, hours) {
  const courseKey = task.courseId || "none";
  const minutes = Math.round(hours * 60);
  const currentSession = stats.sessionsByDay[date];

  if (currentSession && currentSession.courseId && currentSession.courseId !== courseKey) {
    if (!stats.closedCoursesByDay[date]) stats.closedCoursesByDay[date] = {};
    stats.closedCoursesByDay[date][currentSession.courseId] = true;
  }

  if (!currentSession || currentSession.courseId !== courseKey) {
    stats.sessionsByDay[date] = { courseId: courseKey, minutes };
  } else {
    currentSession.minutes += minutes;
  }

  stats.byTask[task.id] = roundHours(Number(stats.byTask[task.id] || 0) + hours);
  stats.byCourse[courseKey] = roundHours(Number(stats.byCourse[courseKey] || 0) + hours);
  addNestedStat(stats.byDayTask, date, task.id, hours);
  addNestedStat(stats.byDayCourse, date, courseKey, hours);
  stats.lastTaskId = task.id;
  stats.lastCourseId = task.courseId || "";
}

function addNestedStat(target, group, key, hours) {
  if (!target[group]) target[group] = {};
  target[group][key] = roundHours(Number(target[group][key] || 0) + hours);
}

function getStatHours(target, group, key) {
  return Number(target?.[group]?.[key] || 0);
}

function buildReason(task, date) {
  const days = diffDays(date, task.dueDate);
  if (days < 0) return "Atrasado";
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence manana";
  return `Vence en ${days} dias`;
}

function chooseFallbackCourse(pinnedCourseId, index, slot = null) {
  if (pinnedCourseId) return getCourse(pinnedCourseId) || null;
  if (!state.courses.length) return null;

  const weighted = [];
  const sortedCourses = [...state.courses].sort((a, b) => getCourseTimeFit(b, slot) - getCourseTimeFit(a, slot));
  sortedCourses.forEach((course) => {
    const average = getCourseAverage(course);
    const gap = average ? Math.max(0, course.targetGrade - average) : 0.5;
    const timeFit = Math.max(1, getCourseTimeFit(course, slot));
    const weight = Math.max(1, Math.round(course.priority + gap * 2 + course.credits / 10 + timeFit));
    for (let i = 0; i < weight; i += 1) weighted.push(course);
  });

  return weighted[index % weighted.length];
}

function getCourseTimeFit(course, slot) {
  if (!slot) return Number(course.priority || 3);
  const start = parseTime(slot.start);
  const priority = Number(course.priority || 3);
  if (start < parseTime("12:00")) return priority;
  if (start < parseTime("15:30")) return Math.max(1, priority - 1);
  return 6 - priority;
}

function getStudySlots(daysCount) {
  const slots = getScheduleRows();
  const today = new Date();
  const result = [];

  for (let offset = 0; offset < daysCount; offset += 1) {
    const date = addDaysISO(today, offset);
    const dateObj = parseISODate(date);
    const dayIndex = dayIndexFromDate(dateObj);

    slots.forEach((slot) => {
      const block = getBlock(dayIndex, slot.key);
      if (block.type !== "study") return;
      const start = block.start || slot.labelStart;
      const end = block.end || slot.labelEnd;
      result.push({
        date,
        dayIndex,
        start,
        end,
        hours: roundHours((parseTime(end) - parseTime(start)) / 60),
        courseId: block.courseId || "",
        title: block.title || ""
      });
    });

    state.customBlocks.forEach((block) => {
      if (block.day !== dayIndex || block.type !== "study") return;
      result.push({
        date,
        dayIndex,
        start: block.start,
        end: block.end,
        hours: roundHours((parseTime(block.end) - parseTime(block.start)) / 60),
        courseId: block.courseId || "",
        title: block.title || ""
      });
    });
  }

  return result.sort((a, b) => parseISODate(a.date) - parseISODate(b.date) || parseTime(a.start) - parseTime(b.start));
}

function getUpcomingAssessments(limit) {
  const today = toISODate(new Date());
  return getSortedAssessments()
    .filter((item) => !item.done && diffDays(today, item.dueDate) >= 0)
    .slice(0, limit);
}

function getCoursePressureRows() {
  return state.courses
    .map((course) => {
      const average = getCourseAverage(course);
      const pending = getPendingHoursForCourse(course.id);
      const gradeGap = average ? Math.max(0, course.targetGrade - average) : 0.4;
      return {
        courseId: course.id,
        average,
        pending,
        score: course.priority + pending / 2 + gradeGap * 2
      };
    })
    .sort((a, b) => b.score - a.score);
}

function getSortedAssessments() {
  return [...state.assessments].sort((a, b) => {
    const dateDelta = parseISODate(a.dueDate) - parseISODate(b.dueDate);
    if (dateDelta !== 0) return dateDelta;
    const importanceDelta = b.importance - a.importance;
    if (importanceDelta !== 0) return importanceDelta;
    return Number(b.weightPercent || 0) - Number(a.weightPercent || 0);
  });
}

function getPendingHoursForCourse(courseId) {
  return roundHours(state.assessments
    .filter((item) => item.courseId === courseId && !item.done)
    .reduce((sum, item) => sum + getPendingHours(item), 0));
}

function getPendingHours(item) {
  if (item.done) return 0;
  return roundHours(Math.max(0, getEffectiveEstimatedHours(item) - Number(item.completedHours || 0)));
}

function getEffectiveEstimatedHours(item) {
  const manual = Number(item.estimatedHours || 0);
  const estimated = manual > 0 ? manual : autoEstimateHours(item);
  return applyImportanceHourCap(item, estimated);
}

function applyImportanceHourCap(item, hours) {
  if (!isLowImportanceAssessment(item)) return roundHours(hours);
  return roundHours(Math.min(hours, LOW_IMPORTANCE_MAX_HOURS));
}

function isLowImportanceAssessment(item) {
  return Number(item.importance || 3) <= LOW_IMPORTANCE_THRESHOLD;
}

function getHoursSourceLabel(item) {
  const source = Number(item.estimatedHours || 0) > 0 ? "manual" : "auto";
  if (!isLowImportanceAssessment(item)) return source;
  return `${source}, tope baja importancia`;
}

function autoEstimateHours(item) {
  const course = getCourse(item.courseId);
  const typeBase = {
    examen: 10,
    prueba: 7,
    control: 3,
    tarea: 4,
    entrega: 5,
    laboratorio: 4,
    lectura: 2,
    otro: 3
  };
  const base = typeBase[item.type] || typeBase.otro;
  const weightHours = Number(item.weightPercent || 0) / 4;
  const importanceHours = Number(item.importance || 3) * 0.8;
  const courseHours = course ? Number(course.priority || 3) * 0.4 : 1;
  return roundHours(clampNumber(base + weightHours + importanceHours + courseHours, 1, 45, 4));
}

function getCourseAverage(course) {
  if (!course || !course.grades.length) return null;
  const weight = course.grades.reduce((sum, grade) => sum + Number(grade.weight || 0), 0);
  if (weight <= 0) return null;
  const weighted = course.grades.reduce((sum, grade) => sum + Number(grade.grade || 0) * Number(grade.weight || 0), 0);
  return weighted / weight;
}

function getCourse(courseId) {
  return state.courses.find((course) => course.id === courseId);
}

function getScheduleRows() {
  const duration = Number(state.settings.blockMinutes);
  const endLimit = parseTime(state.settings.endTime);
  let cursor = parseTime(state.settings.startTime);

  return generateSlots(state.settings.startTime, state.settings.endTime, duration)
    .map((slot) => {
      const customBlock = DAY_NAMES
        .map((_, dayIndex) => getBlock(dayIndex, slot.start))
        .find((block) => (
          block.start &&
          block.end &&
          (block.start !== slot.start || block.end !== slot.end)
        ));
      const labelStart = customBlock?.start || formatTime(cursor);
      const labelEnd = customBlock?.end || formatTime(Math.min(cursor + duration, endLimit));
      cursor = parseTime(labelEnd);

      return {
        ...slot,
        key: slot.start,
        labelStart,
        labelEnd
      };
    });
}

function getSortedCustomBlocks() {
  return [...state.customBlocks].sort((a, b) => a.day - b.day || parseTime(a.start) - parseTime(b.start));
}

function getCustomBlocksForSlot(dayIndex, slot) {
  const slotStart = parseTime(slot.start);
  const slotEnd = parseTime(slot.end);
  return getSortedCustomBlocks().filter((block) => {
    if (block.day !== dayIndex) return false;
    const blockStart = parseTime(block.start);
    return blockStart >= slotStart && blockStart < slotEnd;
  });
}

function normalizeCustomBlock(block) {
  if (!block || typeof block !== "object") return null;
  const start = String(block.start || "");
  const end = String(block.end || "");
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
  if (parseTime(start) >= parseTime(end)) return null;

  return {
    id: block.id || uid("bloque"),
    day: clampNumber(Number(block.day), 0, 6, 0),
    start,
    end,
    type: normalizeBlockType(block.type),
    courseId: block.courseId || "",
    title: block.title || ""
  };
}

function normalizeBlockType(type) {
  const normalized = normalizeText(type);
  if (["study", "fixed-study", "fixedstudy", "fixed study", "study-fixed", "estudio", "estudio fijo", "estudio-fijo", "estudio_fijo"].includes(normalized)) return "study";
  if (["leisure", "ocio", "recreacion", "recreaciÃ³n"].includes(normalized)) return "leisure";
  if (["rest", "break", "descanso", "almuerzo"].includes(normalized)) return "rest";
  if (["class", "clase", "catedra", "catedra"].includes(normalized)) return "class";
  if (["assistant", "ayudantia", "ayudantÃ­a"].includes(normalized)) return "assistant";
  if (["lab", "laboratorio"].includes(normalized)) return "lab";
  if (["commute", "traslado"].includes(normalized)) return "commute";
  if (["sport", "deporte"].includes(normalized)) return "sport";
  if (["work", "trabajo"].includes(normalized)) return "work";
  if (["other", "otro"].includes(normalized)) return "other";
  return BLOCK_TYPES[type] ? type : "free";
}

function saveScheduleBlock(schedule, day, start, type, courseId, title) {
  schedule[scheduleKey(day, start)] = { type: normalizeBlockType(type), courseId, title, start, end: "" };
}

function setBlock(schedule, day, start, type, courseId, title) {
  saveScheduleBlock(schedule, day, start, type, courseId || "", title || "");
}

function getBlock(day, start) {
  const block = state.schedule[scheduleKey(day, start)];
  if (!block) return { type: "free", courseId: "", title: "", start: "", end: "" };
  return {
    type: normalizeBlockType(block.type),
    courseId: block.courseId || "",
    title: block.title || "",
    start: block.start || "",
    end: block.end || ""
  };
}

function scheduleKey(day, start) {
  return `${day}-${start}`;
}

function generateSlots(startTime, endTime, minutes) {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  const duration = clampNumber(minutes, 15, 240, 60);
  if (start >= end) return [];
  const slots = [];
  for (let cursor = start; cursor < end; cursor += duration) {
    slots.push({
      start: formatTime(cursor),
      end: formatTime(Math.min(cursor + duration, end))
    });
  }
  return slots;
}

function blockTypeOptions(selected = "free") {
  return Object.entries(BLOCK_TYPES).map(([value, type]) => `
    <option value="${value}" ${value === selected ? "selected" : ""}>${type.label}</option>
  `).join("");
}

function courseSelectOptions(selected = "", includeNone = true) {
  const none = includeNone ? `<option value="" ${selected ? "" : "selected"}>Sin ramo</option>` : "";
  return none + state.courses.map((course) => `
    <option value="${course.id}" ${course.id === selected ? "selected" : ""}>${escapeHtml(course.name)}</option>
  `).join("");
}

function assessmentTypeOptions(selected = "tarea") {
  return Object.entries(ASSESSMENT_TYPES).map(([value, label]) => `
    <option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>
  `).join("");
}

function assessmentStatusOptions(selected = "pendiente") {
  return ["pendiente", "en progreso", "completada"].map((value) => `
    <option value="${value}" ${value === selected ? "selected" : ""}>${value[0].toUpperCase()}${value.slice(1)}</option>
  `).join("");
}

function dayOptions(selected = 0) {
  return DAY_NAMES.map((day, index) => `
    <option value="${index}" ${Number(selected) === index ? "selected" : ""}>${day}</option>
  `).join("");
}

function getDueState(dueDate) {
  const days = diffDays(toISODate(new Date()), dueDate);
  if (days < 0) return `${Math.abs(days)} dias atrasado`;
  if (days === 0) return "Hoy";
  if (days === 1) return "Manana";
  return `En ${days} dias`;
}

function getAssessmentVisualState(item) {
  if (item.done || item.status === "completada") return "status-completed";
  const days = diffDays(toISODate(new Date()), item.dueDate);
  if (days < 0) return "status-overdue";
  if (days <= 2) return "status-urgent";
  if (item.status === "en progreso" || Number(item.completedHours || 0) > 0) return "status-progress";
  return "status-pending";
}

// ===== Utilidades de fecha y tiempo =====

function formatLongDate(iso) {
  const date = parseISODate(iso);
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "short"
  }).format(date);
}

function formatHours(value) {
  const rounded = roundHours(value);
  if (rounded === 1) return "1 h";
  if (Number.isInteger(rounded)) return `${rounded} h`;
  return `${rounded.toLocaleString("es-CL", { maximumFractionDigits: 2 })} h`;
}

function formatGrade(value) {
  return Number(value).toLocaleString("es-CL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function formatPercent(value) {
  return `${Number(value).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;
}

function parseTime(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function addMinutesToTime(time, minutes) {
  return formatTime(Math.min(1439, parseTime(time) + Number(minutes || 0)));
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysISO(date, days) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return toISODate(next);
}

function parseISODate(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
}

function diffDays(fromIso, toIso) {
  const from = parseISODate(fromIso);
  const to = parseISODate(toIso);
  const ms = to - from;
  return Math.round(ms / 86400000);
}

function dayIndexFromDate(date) {
  return (date.getDay() + 6) % 7;
}

function roundHours(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function persist() {
  state.weeklySchedule = getWeeklyScheduleArray(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const time = new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  autosaveLabel.textContent = `${state.ui.lastMessage || "Guardado local"} · ${time}`;
}

function setAutosaveMessage(message) {
  state.ui.lastMessage = message;
}
