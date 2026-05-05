const STORAGE_KEY = "progress-board-v1";
const SAMPLE_VERSION = 9;
const COURSE_BOARD_VERSION = 1;
const AI_COURSE_BOARD_VERSION = 1;
const LIFE_OS_BOARD_VERSION = 1;
const HISTORY_LIMIT = 370;
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const THEMES = {
  leaf: {
    label: "Leaf",
    bg: "#e3f0dc",
    ink: "#173027",
    muted: "#51645a",
    accent: "#2f7d44",
    soft: "rgba(47, 125, 68, 0.14)",
    visual: "linear-gradient(135deg, #2f7d44 0%, #9fcf90 52%, #f6f0d8 100%)"
  },
  coral: {
    label: "Coral",
    bg: "#fae4d9",
    ink: "#37221d",
    muted: "#7c5b51",
    accent: "#c45f43",
    soft: "rgba(196, 95, 67, 0.16)",
    visual: "linear-gradient(135deg, #c45f43 0%, #f0aa79 48%, #f8e9b9 100%)"
  },
  tide: {
    label: "Tide",
    bg: "#dceef1",
    ink: "#142d35",
    muted: "#49666c",
    accent: "#237a8c",
    soft: "rgba(35, 122, 140, 0.14)",
    visual: "linear-gradient(135deg, #237a8c 0%, #83c6c7 50%, #f1e9ce 100%)"
  },
  plum: {
    label: "Plum",
    bg: "#eadfeb",
    ink: "#2b2230",
    muted: "#66556d",
    accent: "#7a4e8b",
    soft: "rgba(122, 78, 139, 0.14)",
    visual: "linear-gradient(135deg, #7a4e8b 0%, #be8dad 50%, #f2d7a6 100%)"
  },
  honey: {
    label: "Honey",
    bg: "#f4e7bd",
    ink: "#302714",
    muted: "#756644",
    accent: "#a57919",
    soft: "rgba(165, 121, 25, 0.17)",
    visual: "linear-gradient(135deg, #a57919 0%, #e0bd55 52%, #fbefe1 100%)"
  },
  graphite: {
    label: "Graphite",
    bg: "#e6e4df",
    ink: "#202427",
    muted: "#646a6d",
    accent: "#49535a",
    soft: "rgba(73, 83, 90, 0.15)",
    visual: "linear-gradient(135deg, #49535a 0%, #a7aba6 52%, #f1eadb 100%)"
  }
};

const BACKGROUNDS = {
  clean: { label: "Clean", fill: "#ffffff", swatch: "#ffffff" },
  tint: { label: "Theme tint", fill: null, swatch: null },
  paper: { label: "Paper", fill: "#f8f5ef", swatch: "#f8f5ef" },
  mint: { label: "Mint", fill: "#ecf4ef", swatch: "#ecf4ef" },
  blush: { label: "Blush", fill: "#f8ebe6", swatch: "#f8ebe6" },
  sky: { label: "Sky", fill: "#eaf1f5", swatch: "#eaf1f5" }
};

const ICONS = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 4v16l14-8Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 4h4v16h-4z"/><path d="M6 4h4v16H6z"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  "rotate-ccw": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
  "trash-2": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="18" height="5" x="3" y="3" rx="1"/><path d="M5 8v11h14V8"/><path d="M10 12h4"/></svg>',
  timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 2h4"/><path d="M12 14l3-3"/><circle cx="12" cy="14" r="8"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>',
  "layout-grid": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m20 6-11 11-5-5"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  sidebar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m15 9 3 3-3 3"/></svg>'
};

const TYPE_META = {
  single: { label: "One-off", icon: "check" },
  brief: { label: "Brief", icon: "list" },
  daily: { label: "To-do", icon: "list" },
  routine: { label: "Daily Repeat", icon: "timer" },
  scheduled: { label: "Scheduled", icon: "calendar" },
  lab: { label: "AI Lab", icon: "list" },
  workout: { label: "Workout", icon: "list" },
  minutes: { label: "Number Goal", icon: "timer" },
  checklist: { label: "Project", icon: "list" },
  weekly: { label: "Week Grid", icon: "calendar" },
  monthly: { label: "Month Grid", icon: "calendar" },
  annual: { label: "Year Grid", icon: "calendar" }
};

const TYPE_HELP = {
  daily: "Use for a one-day to-do list. It does not reset automatically, so it is best for today, tomorrow, or a specific short plan.",
  brief: "Use for strategy, rules, decisions, priorities, or a review prompt. It is a guidance card, not a task tracker.",
  single: "Use for one clear outcome that is either done or not done.",
  routine: "Use for a checklist that repeats every day, auto-counts down to midnight, and saves daily history.",
  scheduled: "Use for habits that happen only on selected weekdays, such as gym on Monday, Wednesday and Friday.",
  minutes: "Use for a measurable target such as minutes, calories, steps, pages, reps, or sessions.",
  checklist: "Use for a project with multiple fixed steps that you tick off once.",
  weekly: "Use for a repeated scorecard. Choose week, month, or year below.",
  monthly: "Month grid. This is now handled through Scorecard grid.",
  annual: "Year grid. This is now handled through Scorecard grid.",
  lab: "Template-only guided practice card. Used by course boards when each step needs a deliverable.",
  workout: "Template-only workout card. Used by fitness boards for exercise prescriptions."
};

const MANUAL_TYPE_OPTIONS = ["daily", "brief", "single", "routine", "scheduled", "minutes", "checklist", "weekly"];
const SCORECARD_TYPES = ["weekly", "monthly", "annual"];
const TEMPLATE_ONLY_TYPES = ["lab", "workout"];

const CATEGORY_ALIASES = {
  general: "General",
  work: "Work",
  business: "Work",
  operations: "Work",
  sales: "Work",
  product: "Work",
  build: "Work",
  project: "Work",
  health: "Health",
  fitness: "Health",
  strength: "Health",
  conditioning: "Health",
  recovery: "Health",
  energy: "Health",
  learning: "Learning",
  study: "Learning",
  course: "Learning",
  "ai basics": "Learning",
  prompting: "Learning",
  research: "Learning",
  automation: "Learning",
  ethics: "Learning",
  finance: "Finance",
  money: "Finance",
  personal: "Personal",
  relationships: "Personal",
  relationship: "Personal",
  family: "Personal"
};

const PRIMARY_CATEGORIES = ["General", "Work", "Health", "Learning", "Finance", "Personal"];

const PRIORITY_META = {
  high: { label: "Must do", weight: 0 },
  normal: { label: "Normal", weight: 1 },
  low: { label: "Later", weight: 2 }
};

const VISIBILITY_META = {
  private: { label: "Private", icon: "lock" },
  unlisted: { label: "Unlisted", icon: "link" },
  public: { label: "Public", icon: "eye" }
};

const artistPacks = [
  {
    name: "Moon Garden",
    price: "RM 12",
    theme: "linear-gradient(135deg, #283348, #638d8c 48%, #f0c979)"
  },
  {
    name: "Street Pop",
    price: "RM 18",
    theme: "linear-gradient(135deg, #242424, #e05b4f 48%, #f2cf53)"
  }
];

const boardTemplates = [
  {
    id: "life-os",
    name: "Life & Work Operating Board",
    description: "Daily command center for priorities, work pipeline, fitness, money and weekly review.",
    category: "Life OS"
  },
  {
    id: "ai-starter",
    name: "AI Starter Course",
    description: "Beginner AI literacy, prompting, research and automation course.",
    category: "AI"
  },
  {
    id: "foundation",
    name: "Fitness Foundation Course",
    description: "8-week strength, cardio, mobility and recovery course.",
    category: "Fitness"
  },
  {
    id: "fitness",
    name: "Fitness reset",
    description: "Daily movement, weekly workouts and sleep rhythm.",
    category: "Fitness"
  },
  {
    id: "study",
    name: "Study sprint",
    description: "Daily study list, exam countdown and monthly reading.",
    category: "Study"
  }
];

const defaultState = {
  sampleVersion: SAMPLE_VERSION,
  courseBoardVersion: 0,
  aiCourseBoardVersion: 0,
  lifeOsBoardVersion: 0,
  activeBoardId: "personal-board",
  board: {
    name: "My Progress Board",
    visibility: "private",
    layout: "smart"
  },
  ui: {
    sidebarOpen: true,
    categoriesOpen: true,
    recentOpen: getDefaultRecentOpen(),
    recentExpanded: false
  },
  activeFilter: "all",
  activeCategory: "all",
  activeCategories: [],
  focusFilter: "all",
  searchQuery: "",
  cards: [
    {
      id: createId(),
      title: "Deep work sprint",
      description: "Focused build time for the platform.",
      category: "Build",
      reward: "Long break",
      metadata: { category: "Build" },
      type: "single",
      size: "small",
      theme: "tide",
      includeImage: false,
      imageUrl: "",
      timerMode: "hours",
      duration: 1500,
      remaining: 1500,
      runningSince: null,
      done: false,
      order: 1,
      createdAt: Date.now() - 400000
    },
    {
      id: createId(),
      title: "Launch checklist",
      description: "Product structure, card rules, board privacy and collaboration hooks.",
      category: "Product",
      reward: "Share preview",
      metadata: { category: "Product" },
      type: "checklist",
      size: "large",
      theme: "leaf",
      includeImage: true,
      imageUrl: "",
      imageData: "",
      timerMode: "hours",
      duration: 5400,
      remaining: 5400,
      runningSince: null,
      items: [
        { id: createId(), text: "Card model", done: true },
        { id: createId(), text: "Timer controls", done: true },
        { id: createId(), text: "Artist pack surface", done: false },
        { id: createId(), text: "Sharing permissions", done: false }
      ],
      order: 2,
      createdAt: Date.now() - 300000
    },
    {
      id: createId(),
      title: "Gym schedule",
      description: "Monday, Wednesday and Friday gym attendance.",
      category: "Health",
      reward: "Smoothie",
      metadata: { category: "Health" },
      type: "scheduled",
      size: "medium",
      theme: "coral",
      includeImage: false,
      imageUrl: "",
      timerMode: "days",
      duration: 7 * 24 * 60 * 60,
      remaining: 7 * 24 * 60 * 60,
      runningSince: null,
      scheduleDays: [0, 2, 4],
      checks: [true, false, true, false, false, false, false],
      order: 3,
      createdAt: Date.now() - 200000
    },
    {
      id: createId(),
      title: "Reading month",
      description: "Thirty minutes of reading on as many days as possible.",
      category: "Learning",
      reward: "New book",
      metadata: { category: "Learning" },
      type: "monthly",
      size: "medium",
      theme: "honey",
      includeImage: false,
      imageUrl: "",
      timerMode: "days",
      duration: 2700,
      remaining: 2700,
      runningSince: null,
      checks: Array.from({ length: daysInCurrentMonth() }, (_, index) => index < 9 && ![2, 6].includes(index)),
      order: 4,
      createdAt: Date.now() - 100000
    },
    {
      id: createId(),
      title: "Weekly workouts",
      description: "Strength, cardio, mobility and a proper recovery day.",
      category: "Fitness",
      reward: "Protein shake",
      metadata: { category: "Fitness" },
      type: "weekly",
      size: "medium",
      theme: "coral",
      includeImage: false,
      imageUrl: "",
      timerMode: "days",
      duration: 7 * 24 * 60 * 60,
      remaining: 7 * 24 * 60 * 60,
      runningSince: null,
      checks: [true, false, true, false, false, false, false],
      order: 5,
      createdAt: Date.now() - 90000
    },
    {
      id: createId(),
      title: "Client follow-ups",
      description: "Move active conversations to a clear next step.",
      category: "Work",
      reward: "Inbox zero",
      priority: "high",
      metadata: { category: "Work" },
      type: "checklist",
      size: "medium",
      theme: "graphite",
      includeImage: false,
      imageUrl: "",
      timerMode: "hours",
      duration: 50 * 60,
      remaining: 50 * 60,
      runningSince: null,
      items: [
        { id: createId(), text: "Send proposal update", done: true },
        { id: createId(), text: "Confirm design notes", done: false },
        { id: createId(), text: "Book review call", done: false },
        { id: createId(), text: "Archive completed thread", done: false }
      ],
      order: 6,
      createdAt: Date.now() - 80000
    },
    {
      id: createId(),
      title: "Study sprint",
      description: "Finish the core lesson, notes, practice task and recall review.",
      category: "Study",
      reward: "One episode",
      metadata: { category: "Study" },
      type: "checklist",
      size: "large",
      theme: "tide",
      includeImage: true,
      imageUrl: "",
      imageData: "",
      timerMode: "date",
      targetAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      duration: 3 * 24 * 60 * 60,
      remaining: 3 * 24 * 60 * 60,
      runningSince: null,
      items: [
        { id: createId(), text: "Watch lesson", done: true },
        { id: createId(), text: "Write notes", done: true },
        { id: createId(), text: "Solve practice set", done: false },
        { id: createId(), text: "Review mistakes", done: false },
        { id: createId(), text: "Flashcard recap", done: false }
      ],
      order: 7,
      createdAt: Date.now() - 70000
    },
    {
      id: createId(),
      title: "Budget review",
      description: "Close this week's spending loop.",
      category: "Finance",
      reward: "Dinner out",
      metadata: { category: "Finance" },
      type: "single",
      size: "small",
      theme: "honey",
      includeImage: false,
      imageUrl: "",
      timerMode: "hours",
      duration: 20 * 60,
      remaining: 20 * 60,
      runningSince: null,
      done: false,
      order: 8,
      createdAt: Date.now() - 60000
    },
    {
      id: createId(),
      title: "Sleep reset",
      description: "Lights out target for the month.",
      category: "Health",
      reward: "Sunday nap",
      metadata: { category: "Health" },
      type: "monthly",
      size: "medium",
      theme: "plum",
      includeImage: false,
      imageUrl: "",
      timerMode: "days",
      duration: 14 * 24 * 60 * 60,
      remaining: 14 * 24 * 60 * 60,
      runningSince: null,
      checks: Array.from({ length: daysInCurrentMonth() }, (_, index) => index < 6 && index !== 3),
      order: 9,
      createdAt: Date.now() - 50000
    },
    {
      id: createId(),
      title: "2026 creator goals",
      description: "Ship the board, test premium card packs, publish a public progress page.",
      category: "Personal",
      reward: "Custom artist card",
      metadata: { category: "Personal" },
      type: "annual",
      size: "large",
      theme: "plum",
      includeImage: false,
      imageUrl: "",
      timerMode: "date",
      targetAt: new Date(new Date().getFullYear(), 11, 31, 23, 59, 0).toISOString(),
      duration: Math.max(60, Math.ceil((new Date(new Date().getFullYear(), 11, 31, 23, 59, 0).getTime() - Date.now()) / 1000)),
      remaining: Math.max(60, Math.ceil((new Date(new Date().getFullYear(), 11, 31, 23, 59, 0).getTime() - Date.now()) / 1000)),
      runningSince: null,
      checks: [true, true, false, true, false, false, false, false, false, false, false, false],
      order: 10,
      createdAt: Date.now() - 40000
    },
    {
      id: createId(),
      title: "Today list",
      description: "A quick daily list for the tasks that must move today.",
      category: "Personal",
      reward: "Evening reset",
      priority: "high",
      metadata: { category: "Personal" },
      type: "daily",
      plannedDate: getTodayKey(),
      size: "standard",
      theme: "leaf",
      includeImage: true,
      imageUrl: "",
      timerMode: "hours",
      duration: 12 * 60 * 60,
      remaining: 12 * 60 * 60,
      runningSince: null,
      items: [
        { id: createId(), text: "Plan top 3", done: true },
        { id: createId(), text: "Clear one blocker", done: false },
        { id: createId(), text: "Review board", done: false },
        { id: createId(), text: "Close the day", done: false }
      ],
      order: 11,
      createdAt: Date.now() - 30000
    },
    {
      id: createId(),
      title: "Daily reset checklist",
      description: "A repeatable checklist that clears itself for the next day.",
      category: "Personal",
      reward: "Clean slate",
      metadata: { category: "Personal" },
      type: "routine",
      size: "standard",
      theme: "tide",
      background: "sky",
      includeImage: false,
      imageUrl: "",
      timerMode: "hours",
      duration: 24 * 60 * 60,
      remaining: 24 * 60 * 60,
      runningSince: null,
      lastResetDate: getTodayKey(),
      items: [
        { id: createId(), text: "Plan priorities", done: false },
        { id: createId(), text: "Finish one key task", done: false },
        { id: createId(), text: "Log progress", done: false }
      ],
      order: 12,
      createdAt: Date.now() - 20000
    },
    {
      id: createId(),
      title: "Gym M/W/F",
      description: "Scheduled habit for planned training days.",
      category: "Fitness",
      reward: "Recovery meal",
      metadata: { category: "Fitness" },
      type: "scheduled",
      size: "standard",
      theme: "coral",
      background: "blush",
      includeImage: false,
      imageUrl: "",
      timerMode: "days",
      duration: 7 * 24 * 60 * 60,
      remaining: 7 * 24 * 60 * 60,
      runningSince: null,
      scheduleDays: [0, 2, 4],
      checks: [false, false, false, false, false, false, false],
      order: 13,
      createdAt: Date.now() - 10000
    }
  ],
  archivedCards: [],
  boards: []
};

let state = loadState();
let draggedCardId = null;
let editingCardId = null;
let selectedTimerMode = "none";
let attachedImageData = "";
let draftPreviewDismissed = false;
let selectedTemplateId = boardTemplates[0]?.id || "";
let selectedScheduleDays = [0, 2, 4];
let boardResizeFrame = null;

const elements = {
  appShell: document.querySelector("#appShell"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  boardName: document.querySelector("#boardName"),
  boardTitle: document.querySelector("#boardTitle"),
  visibilityLabel: document.querySelector("#visibilityLabel"),
  visibilityControl: document.querySelector("#visibilityControl"),
  layoutControl: document.querySelector("#layoutControl"),
  savedState: document.querySelector("#savedState"),
  boardSelect: document.querySelector("#boardSelect"),
  newBoardButton: document.querySelector("#newBoardButton"),
  deleteBoardButton: document.querySelector("#deleteBoardButton"),
  form: document.querySelector("#cardForm"),
  formTitle: document.querySelector("#formTitle"),
  submitCardButton: document.querySelector("#submitCardButton"),
  formSubmitLabel: document.querySelector("#formSubmitLabel"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  cardTitle: document.querySelector("#cardTitle"),
  cardDescription: document.querySelector("#cardDescription"),
  cardCategory: document.querySelector("#cardCategory"),
  categoryCustomField: document.querySelector("#categoryCustomField"),
  cardCategoryCustom: document.querySelector("#cardCategoryCustom"),
  cardReward: document.querySelector("#cardReward"),
  cardPriority: document.querySelector("#cardPriority"),
  dailyPlanDateField: document.querySelector("#dailyPlanDateField"),
  cardPlanDate: document.querySelector("#cardPlanDate"),
  cardType: document.querySelector("#cardType"),
  cardTypeHelp: document.querySelector("#cardTypeHelp"),
  scorecardPeriodField: document.querySelector("#scorecardPeriodField"),
  scorecardPeriod: document.querySelector("#scorecardPeriod"),
  cardSize: document.querySelector("#cardSize"),
  cardTheme: document.querySelector("#cardTheme"),
  themeSwatches: document.querySelector("#themeSwatches"),
  cardBackground: document.querySelector("#cardBackground"),
  backgroundSwatches: document.querySelector("#backgroundSwatches"),
  scheduleField: document.querySelector("#scheduleField"),
  scheduleDays: document.querySelector("#scheduleDays"),
  countdownField: document.querySelector("#countdownField"),
  timerModeControl: document.querySelector("#timerModeControl"),
  timerDate: document.querySelector("#timerDate"),
  timerDays: document.querySelector("#timerDays"),
  timerHours: document.querySelector("#timerHours"),
  timerMinutes: document.querySelector("#timerMinutes"),
  checklistField: document.querySelector("#checklistField"),
  checklistLabel: document.querySelector("#checklistLabel"),
  checklistItems: document.querySelector("#checklistItems"),
  goalField: document.querySelector("#goalField"),
  goalTarget: document.querySelector("#goalTarget"),
  goalUnit: document.querySelector("#goalUnit"),
  includeImage: document.querySelector("#includeImage"),
  imageUrlField: document.querySelector("#imageUrlField"),
  imageFile: document.querySelector("#imageFile"),
  imageUrl: document.querySelector("#imageUrl"),
  boardPreviewPanel: document.querySelector("#boardPreviewPanel"),
  previewMeta: document.querySelector("#previewMeta"),
  draftPreviewCloseButton: document.querySelector("#draftPreviewCloseButton"),
  cardPreview: document.querySelector("#cardPreview"),
  boardGrid: document.querySelector("#boardGrid"),
  todayFocusStrip: document.querySelector("#todayFocusStrip"),
  focusTodayCount: document.querySelector("#focusTodayCount"),
  focusMustCount: document.querySelector("#focusMustCount"),
  focusOverdueCount: document.querySelector("#focusOverdueCount"),
  focusDoneCount: document.querySelector("#focusDoneCount"),
  boardSearch: document.querySelector("#boardSearch"),
  clearSearchButton: document.querySelector("#clearSearchButton"),
  categoryToggle: document.querySelector("#categoryToggle"),
  categoryToggleLabel: document.querySelector("#categoryToggleLabel"),
  categoryPills: document.querySelector("#categoryPills"),
  recentPanel: document.querySelector("#recentPanel"),
  recentCount: document.querySelector("#recentCount"),
  recentList: document.querySelector("#recentList"),
  recentToggleButton: document.querySelector("#recentToggleButton"),
  recentToggleLabel: document.querySelector("#recentToggleLabel"),
  quickTodoToggleButton: document.querySelector("#quickTodoToggleButton"),
  quickTodoPanel: document.querySelector("#quickTodoPanel"),
  quickTodoForm: document.querySelector("#quickTodoForm"),
  quickTodoTitle: document.querySelector("#quickTodoTitle"),
  quickTodoType: document.querySelector("#quickTodoType"),
  quickTodoCategory: document.querySelector("#quickTodoCategory"),
  quickTodoTiming: document.querySelector("#quickTodoTiming"),
  quickPlanField: document.querySelector("#quickPlanField"),
  quickTodoPlan: document.querySelector("#quickTodoPlan"),
  quickTodoPriority: document.querySelector("#quickTodoPriority"),
  quickTodoItems: document.querySelector("#quickTodoItems"),
  quickTodoCancelButton: document.querySelector("#quickTodoCancelButton"),
  totalCards: document.querySelector("#totalCards"),
  runningTimers: document.querySelector("#runningTimers"),
  completionRate: document.querySelector("#completionRate"),
  startAllTimersButton: document.querySelector("#startAllTimersButton"),
  stopAllTimersButton: document.querySelector("#stopAllTimersButton"),
  openRecordsButton: document.querySelector("#openRecordsButton"),
  saveLayoutButton: document.querySelector("#saveLayoutButton"),
  restoreLayoutButton: document.querySelector("#restoreLayoutButton"),
  arrangeButton: document.querySelector("#arrangeButton"),
  openTemplatesButton: document.querySelector("#openTemplatesButton"),
  templateModal: document.querySelector("#templateModal"),
  templateModalCloseButton: document.querySelector("#templateModalCloseButton"),
  templateList: document.querySelector("#templateList"),
  templatePreviewMeta: document.querySelector("#templatePreviewMeta"),
  templatePreviewTitle: document.querySelector("#templatePreviewTitle"),
  templatePreviewDescription: document.querySelector("#templatePreviewDescription"),
  templatePreviewOverview: document.querySelector("#templatePreviewOverview"),
  templatePreviewGrid: document.querySelector("#templatePreviewGrid"),
  addTemplateButton: document.querySelector("#addTemplateButton"),
  historyModal: document.querySelector("#historyModal"),
  historyModalCloseButton: document.querySelector("#historyModalCloseButton"),
  historyModalTitle: document.querySelector("#historyModalTitle"),
  historyModalSummary: document.querySelector("#historyModalSummary"),
  historyModalList: document.querySelector("#historyModalList"),
  recordsModal: document.querySelector("#recordsModal"),
  recordsModalCloseButton: document.querySelector("#recordsModalCloseButton"),
  recordsModalTitle: document.querySelector("#recordsModalTitle"),
  recordsModalSummary: document.querySelector("#recordsModalSummary"),
  recordsModalList: document.querySelector("#recordsModalList"),
  packList: document.querySelector("#packList")
};

hydrateIcons();
populateThemeOptions();
populateBackgroundOptions();
setDefaultTimerDate();
renderArtistPacks();
renderTemplateList();
bindEvents();
elements.cardPlanDate.value = getTodayKey();
render();

setInterval(() => {
  if (state.cards.some((card) => card.runningSince)) {
    settleExpiredTimers();
    renderCardsOnly();
  }
}, 1000);

function bindEvents() {
  elements.sidebarToggle.addEventListener("click", () => {
    state.ui.sidebarOpen = !state.ui.sidebarOpen;
    renderShell();
    queueBoardRender();
    saveState();
  });

  window.addEventListener("resize", queueBoardRender);

  elements.boardName.addEventListener("input", (event) => {
    state.board.name = event.target.value.trimStart() || "My Progress Board";
    renderBoardMeta();
    saveState();
  });

  elements.boardSelect.addEventListener("change", (event) => {
    switchBoard(event.target.value);
  });

  elements.newBoardButton.addEventListener("click", () => {
    createBlankBoard();
  });

  elements.deleteBoardButton.addEventListener("click", () => {
    deleteCurrentBoard();
  });

  elements.visibilityControl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    state.board.visibility = button.dataset.value;
    renderBoardMeta();
    saveState();
  });

  elements.layoutControl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    state.board.layout = button.dataset.value;
    render();
    saveState();
  });

  elements.cardCategory.addEventListener("change", renderConditionalFields);
  elements.cardType.addEventListener("change", renderConditionalFields);
  elements.scorecardPeriod.addEventListener("change", renderConditionalFields);
  elements.includeImage.addEventListener("change", renderConditionalFields);

  elements.timerModeControl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    selectedTimerMode = button.dataset.value;
    renderConditionalFields();
  });

  elements.themeSwatches.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-theme]");
    if (!button) return;
    elements.cardTheme.value = button.dataset.theme;
    renderThemeSwatches();
    renderBackgroundSwatches();
    renderFormPreview();
  });

  elements.backgroundSwatches.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-background]");
    if (!button) return;
    elements.cardBackground.value = button.dataset.background;
    renderBackgroundSwatches();
    renderFormPreview();
  });

  elements.scheduleDays.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-day]");
    if (!button) return;
    const day = Number(button.dataset.day);
    if (!Number.isInteger(day)) return;
    selectedScheduleDays = selectedScheduleDays.includes(day)
      ? selectedScheduleDays.filter((item) => item !== day)
      : [...selectedScheduleDays, day];
    if (!selectedScheduleDays.length) {
      selectedScheduleDays = [day];
    }
    selectedScheduleDays = normalizeScheduleDays(selectedScheduleDays);
    renderScheduleDays();
    renderFormPreview();
  });

  elements.form.addEventListener("input", handleDraftInputChange);
  elements.form.addEventListener("change", handleDraftInputChange);

  elements.imageFile.addEventListener("change", async () => {
    const file = elements.imageFile.files && elements.imageFile.files[0];
    attachedImageData = file ? await fileToDataUrl(file) : "";
    if (file) elements.includeImage.checked = true;
    renderConditionalFields();
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveCardFromForm();
  });

  elements.cancelEditButton.addEventListener("click", () => {
    resetFormState();
    render();
  });

  elements.draftPreviewCloseButton.addEventListener("click", discardDraftCard);

  document.querySelector(".view-pills").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    state.activeFilter = button.dataset.filter;
    document.querySelectorAll(".view-pills .pill").forEach((pill) => {
      pill.classList.toggle("is-active", pill === button);
    });
    saveState();
    renderCardsOnly();
  });

  elements.categoryPills.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    toggleCategoryFilter(button.dataset.category);
    saveState();
    renderCardsOnly();
  });

  elements.categoryToggle.addEventListener("click", () => {
    state.ui.categoriesOpen = !state.ui.categoriesOpen;
    saveState();
    renderCardsOnly();
  });

  elements.todayFocusStrip.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-focus]");
    if (!button) return;
    state.focusFilter = state.focusFilter === button.dataset.focus ? "all" : button.dataset.focus;
    saveState();
    renderCardsOnly();
  });

  elements.boardSearch.addEventListener("input", (event) => {
    state.searchQuery = normalizeLabel(event.target.value);
    renderCardsOnly();
    saveState();
  });

  elements.clearSearchButton.addEventListener("click", () => {
    state.searchQuery = "";
    elements.boardSearch.value = "";
    renderCardsOnly();
    saveState();
    elements.boardSearch.focus();
  });

  elements.recentList.addEventListener("click", (event) => {
    const expandButton = event.target.closest("button[data-recent-expand]");
    if (expandButton) {
      state.ui.recentExpanded = !state.ui.recentExpanded;
      saveState();
      renderRecentCards();
      return;
    }
    const button = event.target.closest("button[data-recent-card]");
    if (!button) return;
    startEditingCard(button.dataset.recentCard);
  });

  elements.recentToggleButton.addEventListener("click", () => {
    state.ui.recentOpen = !state.ui.recentOpen;
    saveState();
    renderRecentCards();
  });

  document.addEventListener("click", (event) => {
    if (!state.ui.categoriesOpen) return;
    if (event.target.closest(".filter-strip")) return;
    state.ui.categoriesOpen = false;
    saveState();
    renderCardsOnly();
  });

  elements.quickTodoToggleButton.addEventListener("click", () => {
    toggleQuickTodoPanel();
  });

  elements.quickTodoCancelButton.addEventListener("click", () => {
    closeQuickTodoPanel();
  });

  elements.quickTodoType.addEventListener("change", renderQuickTodoFields);

  elements.quickTodoTiming.addEventListener("change", () => {
    if (elements.quickTodoTiming.value === "today" || elements.quickTodoTiming.value === "tomorrow") {
      elements.quickTodoPlan.value = elements.quickTodoTiming.value;
    }
  });

  elements.quickTodoForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addQuickTodoCard();
  });

  elements.openRecordsButton.addEventListener("click", openRecordsModal);

  elements.startAllTimersButton.addEventListener("click", () => {
    startAllTimers();
  });

  elements.stopAllTimersButton.addEventListener("click", () => {
    stopAllTimers();
  });

  elements.saveLayoutButton.addEventListener("click", () => {
    saveCurrentLayout();
  });

  elements.restoreLayoutButton.addEventListener("click", () => {
    restoreSavedLayout();
  });

  elements.arrangeButton.addEventListener("click", () => {
    smartArrange();
    state.board.layout = "smart";
    render();
    saveState();
  });

  elements.openTemplatesButton.addEventListener("click", () => {
    openTemplateModal();
  });

  elements.templateModalCloseButton.addEventListener("click", closeTemplateModal);
  elements.historyModalCloseButton.addEventListener("click", closeHistoryModal);
  elements.recordsModalCloseButton.addEventListener("click", closeRecordsModal);

  elements.templateModal.addEventListener("click", (event) => {
    if (event.target === elements.templateModal) {
      closeTemplateModal();
    }
  });

  elements.historyModal.addEventListener("click", (event) => {
    if (event.target === elements.historyModal) {
      closeHistoryModal();
    }
  });

  elements.recordsModal.addEventListener("click", (event) => {
    if (event.target === elements.recordsModal) {
      closeRecordsModal();
    }
  });

  elements.recordsModalList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-restore-card]");
    if (!button) return;
    restoreArchivedCard(button.dataset.restoreCard);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.ui.categoriesOpen) {
      state.ui.categoriesOpen = false;
      saveState();
      renderCardsOnly();
    }
    if (event.key === "Escape" && !elements.templateModal.hidden) {
      closeTemplateModal();
    }
    if (event.key === "Escape" && !elements.historyModal.hidden) {
      closeHistoryModal();
    }
    if (event.key === "Escape" && !elements.recordsModal.hidden) {
      closeRecordsModal();
    }
  });

  elements.templateList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-template]");
    if (!button) return;
    selectedTemplateId = button.dataset.template;
    renderTemplateModal();
  });

  elements.addTemplateButton.addEventListener("click", () => {
    createBoardFromTemplate(selectedTemplateId);
    closeTemplateModal();
  });
}

async function saveCardFromForm() {
  const title = elements.cardTitle.value.trim();
  if (!title) return;

  if (elements.includeImage.checked && elements.imageFile.files && elements.imageFile.files[0] && !attachedImageData) {
    attachedImageData = await fileToDataUrl(elements.imageFile.files[0]);
  }

  const card = buildCardFromForm({ preview: false });
  if (editingCardId) {
    updateExistingCard(card);
  } else {
    state.cards.push(card);
  }

  resetFormState();
  render();
  saveState();
}

function buildCardFromForm({ preview }) {
  const type = getSelectedFormType();
  const timer = type === "routine" ? getDailyAutoTimer() : getFormTimer();
  const includeImage = elements.includeImage.checked;
  const title = elements.cardTitle.value.trim() || "New task";
  const card = {
    id: preview ? "preview-card" : createId(),
    title,
    description: elements.cardDescription.value.trim(),
    category: getSelectedCategory(),
    reward: normalizeLabel(elements.cardReward.value.trim()),
    priority: getSelectedPriority(elements.cardPriority.value),
    metadata: {
      category: getSelectedCategory()
    },
    type,
    size: "standard",
    theme: elements.cardTheme.value || "leaf",
    background: elements.cardBackground.value || "clean",
    includeImage,
    imageUrl: includeImage ? elements.imageUrl.value.trim() : "",
    imageData: includeImage ? attachedImageData : "",
    timerMode: timer.mode,
    targetAt: timer.targetAt,
    duration: timer.duration,
    remaining: timer.duration,
    runningSince: null,
    lastResetDate: type === "routine" ? getTodayKey() : null,
    history: type === "routine" ? [] : undefined,
    order: preview ? 0 : nextOrder(),
    createdAt: Date.now()
  };

  if (type === "daily") {
    card.plannedDate = normalizeDateKey(elements.cardPlanDate.value) || getTodayKey();
  }

  if (type === "single") {
    card.done = false;
  }

  if (type === "brief") {
    const sections = parseBriefSections();
    card.sections = (sections.length ? sections : getDefaultBriefSections()).map((section) => ({
      label: section.label,
      text: section.text
    }));
    card.reviewed = false;
  }

  if (type === "checklist" || type === "daily" || type === "routine") {
    const items = parseChecklistItems();
    const fallbackItems =
      type === "checklist" ? ["First step", "Second step", "Final check"] : ["Plan the day", "Do the main task", "Tidy up", "Close the day"];
    card.items = (items.length ? items : fallbackItems).map((text) => ({
      id: preview ? `preview-${text}` : createId(),
      text,
      done: false
    }));
  }

  if (type === "workout") {
    const exercises = parseWorkoutExercises();
    card.exercises = (exercises.length ? exercises : getDefaultWorkoutExercises()).map((exercise) => ({
      id: preview ? `preview-${exercise.name}` : createId(),
      name: exercise.name,
      prescription: exercise.prescription,
      done: false
    }));
  }

  if (type === "lab") {
    const steps = parseLabSteps();
    card.steps = (steps.length ? steps : getDefaultLabSteps()).map((step) => ({
      id: preview ? `preview-${step.name}` : createId(),
      name: step.name,
      deliverable: step.deliverable,
      done: false
    }));
  }

  if (type === "minutes") {
    card.targetValue = clampInt(elements.goalTarget.value, 1, 999999, 150);
    card.currentValue = preview ? Math.round(card.targetValue * 0.35) : 0;
    card.unit = elements.goalUnit.value || "min";
  }

  if (type === "weekly") {
    card.checks = Array.from({ length: 7 }, (_, index) => preview && index < 2);
  }

  if (type === "scheduled") {
    card.scheduleDays = normalizeScheduleDays(selectedScheduleDays);
    card.checks = Array.from({ length: 7 }, (_, index) => preview && card.scheduleDays.includes(index) && index < 3);
  }

  if (type === "monthly") {
    card.checks = Array.from({ length: daysInCurrentMonth() }, (_, index) => preview && index < 5);
  }

  if (type === "annual") {
    card.checks = Array.from({ length: 12 }, (_, index) => preview && index < 3);
  }

  return card;
}

function updateExistingCard(nextCard) {
  const index = state.cards.findIndex((card) => card.id === editingCardId);
  if (index < 0) {
    state.cards.push(nextCard);
    return;
  }

  const current = state.cards[index];
  state.cards[index] = {
    ...nextCard,
    id: current.id,
    order: current.order,
    layoutColumn: current.layoutColumn,
    createdAt: current.createdAt,
    runningSince: null
  };
}

function startEditingCard(id) {
  const card = state.cards.find((item) => item.id === id);
  if (!card) return;

  editingCardId = id;
  state.ui.sidebarOpen = true;
  renderShell();
  elements.formTitle.textContent = "Edit card";
  elements.formSubmitLabel.textContent = "Update card";
  elements.submitCardButton.querySelector("[data-icon]").dataset.icon = "pencil";
  elements.cancelEditButton.hidden = false;

  elements.cardTitle.value = card.title || "";
  elements.cardDescription.value = card.description || "";
  setCategoryField(card.category || "General");
  elements.cardReward.value = card.reward || "";
  elements.cardPriority.value = getSelectedPriority(card.priority);
  elements.cardPlanDate.value = getCardPlanDate(card);
  setFormType(card.type || "daily");
  selectedScheduleDays = normalizeScheduleDays(card.scheduleDays || selectedScheduleDays);
  elements.checklistItems.value = getEditableListValue(card);
  elements.goalTarget.value = String(card.targetValue || 150);
  elements.goalUnit.value = card.unit || "min";
  elements.cardSize.value = "standard";
  elements.cardTheme.value = card.theme || "leaf";
  elements.cardBackground.value = card.background || "clean";
  elements.includeImage.checked = Boolean(card.includeImage);
  elements.imageUrl.value = card.imageUrl || "";
  elements.imageFile.value = "";
  attachedImageData = card.imageData || "";
  selectedTimerMode = ["none", "date", "days", "hours"].includes(card.timerMode) ? card.timerMode : "none";
  populateTimerFields(card);
  renderScheduleDays();
  renderThemeSwatches();
  renderBackgroundSwatches();
  renderConditionalFields();
  hydrateIcons(elements.submitCardButton);
  elements.cardTitle.focus();
}

function resetFormState() {
  editingCardId = null;
  draftPreviewDismissed = false;
  elements.form.reset();
  elements.formTitle.textContent = "New card";
  elements.formSubmitLabel.textContent = "Add card";
  elements.submitCardButton.querySelector("[data-icon]").dataset.icon = "plus";
  elements.cancelEditButton.hidden = true;
  removeTemplateOnlyTypeOptions();
  elements.cardType.value = "daily";
  elements.scorecardPeriod.value = "weekly";
  elements.cardTheme.value = "leaf";
  elements.cardBackground.value = "clean";
  elements.cardCategory.value = "General";
  elements.cardCategoryCustom.value = "";
  elements.cardPriority.value = "normal";
  elements.cardPlanDate.value = getTodayKey();
  selectedScheduleDays = [0, 2, 4];
  selectedTimerMode = "none";
  attachedImageData = "";
  elements.imageFile.value = "";
  elements.timerHours.value = "0";
  elements.timerMinutes.value = "25";
  elements.timerDays.value = "1";
  elements.goalTarget.value = "150";
  elements.goalUnit.value = "min";
  setDefaultTimerDate();
  renderScheduleDays();
  renderThemeSwatches();
  renderBackgroundSwatches();
  renderConditionalFields();
  hydrateIcons(elements.submitCardButton);
}

function render() {
  renderShell();
  renderBoardMeta();
  renderQuickTodoCategories();
  renderConditionalFields();
  renderRecentCards();
  renderCardsOnly();
  renderFormPreview();
}

function queueBoardRender() {
  if (boardResizeFrame) {
    cancelAnimationFrame(boardResizeFrame);
  }
  boardResizeFrame = requestAnimationFrame(() => {
    boardResizeFrame = null;
    renderCardsOnly();
  });
}

function renderShell() {
  elements.appShell.classList.toggle("sidebar-collapsed", !state.ui.sidebarOpen);
  elements.sidebarToggle.classList.toggle("is-active", state.ui.sidebarOpen);
}

function renderBoardMeta() {
  renderBoardSwitcher();
  elements.boardName.value = state.board.name;
  elements.boardTitle.textContent = state.board.name;
  elements.restoreLayoutButton.disabled = !Array.isArray(state.board.savedLayout) || !state.board.savedLayout.length;
  elements.boardSearch.value = state.searchQuery || "";
  elements.clearSearchButton.hidden = !normalizeLabel(state.searchQuery || "");
  const recordCount = getArchivedCards().length;
  elements.openRecordsButton.textContent = recordCount ? `Records ${recordCount}` : "Records";

  const visibility = VISIBILITY_META[state.board.visibility];
  elements.visibilityLabel.textContent = `${visibility.label} board`;

  elements.visibilityControl.querySelectorAll("button").forEach((button) => {
    const meta = VISIBILITY_META[button.dataset.value];
    button.classList.toggle("is-active", state.board.visibility === button.dataset.value);
    button.innerHTML = `${ICONS[meta.icon]}<span>${meta.label}</span>`;
  });

  elements.layoutControl.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", state.board.layout === button.dataset.value);
  });

  document.querySelectorAll(".view-pills .pill").forEach((pill) => {
    pill.classList.toggle("is-active", state.activeFilter === pill.dataset.filter);
  });
}

function renderBoardSwitcher() {
  syncActiveBoard();
  elements.boardSelect.innerHTML = state.boards
    .map((board) => `<option value="${escapeAttribute(board.id)}">${escapeHtml(board.name)}</option>`)
    .join("");
  elements.boardSelect.value = state.activeBoardId;
  elements.deleteBoardButton.disabled = state.boards.length < 2;
  elements.deleteBoardButton.title =
    state.boards.length < 2 ? "Create another board before deleting this one" : `Delete ${state.board.name}`;
}

function renderCategoryPills(cards) {
  const categories = [...new Set(cards.map((card) => card.category || "General"))].sort((a, b) => a.localeCompare(b));
  state.activeCategories = getActiveCategories().filter((category) => categories.includes(category));
  const selectedCategories = getActiveCategories();
  const selectionLabel = getCategorySelectionLabel(selectedCategories);

  const canFilterCategories = categories.length > 1;
  elements.categoryToggle.hidden = !canFilterCategories;
  elements.categoryToggle.classList.toggle("is-active", state.ui.categoriesOpen || state.activeCategories.length > 0);
  elements.categoryToggle.setAttribute("aria-expanded", String(Boolean(state.ui.categoriesOpen)));
  elements.categoryToggle.setAttribute("aria-label", selectedCategories.length ? `Category filter: ${selectedCategories.join(", ")}` : "Category filter");
  elements.categoryToggle.title = selectedCategories.length ? `Showing ${selectedCategories.join(", ")}` : "Filter categories";
  elements.categoryToggleLabel.textContent = selectionLabel;
  elements.categoryPills.hidden = !canFilterCategories || !state.ui.categoriesOpen;

  if (!canFilterCategories) {
    elements.categoryPills.innerHTML = "";
    return;
  }

  elements.categoryPills.innerHTML = `
    <div class="category-panel-head">
      <div>
        <strong>Filter categories</strong>
        <span>${selectedCategories.length ? escapeHtml(selectedCategories.join(" + ")) : "Showing all cards"}</span>
      </div>
      <button type="button" class="category-clear ${selectedCategories.length === 0 ? "is-active" : ""}" data-category="all">All cards</button>
    </div>
    <div class="category-panel-grid">
      ${categories
        .map(
          (category) =>
            `<button type="button" class="pill ${selectedCategories.includes(category) ? "is-active" : ""}" data-category="${escapeAttribute(category)}">${escapeHtml(category)}</button>`
        )
        .join("")}
    </div>
  `;
}

function getCategorySelectionLabel(categories) {
  if (!categories.length) return "Categories";
  if (categories.length === 1) return categories[0];
  if (categories.length === 2) return categories.join(" + ");
  return "Multiple categories";
}

function renderRecentCards() {
  const allCards = [...state.cards]
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 7);
  const isOpen = state.ui.recentOpen !== false;
  const visibleCards = state.ui.recentExpanded ? allCards : allCards.slice(0, 3);
  elements.recentPanel.classList.toggle("is-collapsed", !isOpen);
  elements.recentToggleButton.setAttribute("aria-expanded", String(isOpen));
  elements.recentToggleLabel.textContent = isOpen ? "Hide" : "Show";
  elements.recentCount.textContent = allCards.length ? `${allCards.length} cards` : "Cards";
  elements.recentList.hidden = !isOpen;
  elements.recentList.innerHTML = allCards.length
    ? [
        ...visibleCards.map((card) => renderRecentCardButton(card)),
        allCards.length > 3
          ? `<button type="button" class="recent-more" data-recent-expand="true">${state.ui.recentExpanded ? "Show less" : `Show ${allCards.length - 3} more`}</button>`
          : ""
      ].join("")
    : '<div class="recent-empty">No cards yet</div>';
  hydrateIcons(elements.recentList);
}

function renderRecentCardButton(card) {
  const progress = getProgress(card);
  const typeMeta = TYPE_META[card.type] || TYPE_META.single;
  const dateLabel = getRecentDateLabel(card.createdAt);
  return `
    <button type="button" class="recent-card" data-recent-card="${escapeAttribute(card.id)}">
      <span class="recent-icon" aria-hidden="true">${ICONS[typeMeta.icon] || ICONS.list}</span>
      <span class="recent-copy">
        <strong>${escapeHtml(card.title || "Untitled card")}</strong>
        <span>${escapeHtml(card.category || "General")} · ${progress.percent}% · ${escapeHtml(dateLabel)}</span>
      </span>
    </button>
  `;
}

function renderQuickTodoCategories() {
  if (!elements.quickTodoCategory) return;
  const previousValue = elements.quickTodoCategory.value || "Personal";
  const formCategories = [...elements.cardCategory.options]
    .map((option) => option.value)
    .filter((value) => value && value !== "Custom");
  const boardCategories = state.cards.map((card) => normalizeCategory(card.category || "General"));
  const categories = [...new Set([...PRIMARY_CATEGORIES, ...boardCategories, ...formCategories.map(normalizeCategory)])];

  elements.quickTodoCategory.innerHTML = categories
    .map((category) => `<option value="${escapeAttribute(category)}">${escapeHtml(category)}</option>`)
    .join("");
  const normalizedPreviousValue = normalizeCategory(previousValue);
  elements.quickTodoCategory.value = categories.includes(normalizedPreviousValue) ? normalizedPreviousValue : "Personal";
  renderQuickTodoFields();
}

function renderQuickTodoFields() {
  if (!elements.quickPlanField) return;
  elements.quickPlanField.hidden = elements.quickTodoType.value !== "daily";
}

function toggleQuickTodoPanel() {
  const shouldOpen = elements.quickTodoPanel.hidden;
  elements.quickTodoPanel.hidden = !shouldOpen;
  elements.quickTodoToggleButton.classList.toggle("is-active", shouldOpen);
  if (shouldOpen) {
    renderQuickTodoCategories();
    elements.quickTodoTitle.focus();
  }
}

function closeQuickTodoPanel() {
  elements.quickTodoPanel.hidden = true;
  elements.quickTodoToggleButton.classList.remove("is-active");
  elements.quickTodoForm.reset();
  elements.quickTodoPlan.value = "today";
  elements.quickTodoPriority.value = "normal";
  renderQuickTodoCategories();
}

function addQuickTodoCard() {
  const type = elements.quickTodoType.value || "daily";
  const items = elements.quickTodoItems.value
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const category = normalizeCategory(elements.quickTodoCategory.value) || "Personal";
  const timer = getQuickCaptureTimer(elements.quickTodoTiming.value);
  const title = normalizeLabel(elements.quickTodoTitle.value.trim()) || getQuickCaptureFallbackTitle(type);
  const priority = getSelectedPriority(elements.quickTodoPriority.value);
  const card = makeCard({
    title,
    description: "Quick capture added from the board.",
    category,
    reward: "Close the loop",
    priority,
    plannedDate: type === "daily" ? getQuickCapturePlanDate(elements.quickTodoPlan.value) : undefined,
    type,
    theme: getThemeForCategory(category),
    background: "clean",
    timerMode: timer.mode,
    targetAt: timer.targetAt,
    duration: timer.duration,
    items: ["daily", "checklist"].includes(type) ? (items.length ? items : getQuickCaptureFallbackItems(type)) : undefined,
    sections: type === "brief" ? (items.length ? items.map((item, index) => [`Note ${index + 1}`, item]) : [["Focus", "Clarify the decision, rule or idea."]]) : undefined
  });
  card.remaining = timer.duration;
  card.runningSince = null;
  card.order = nextOrder();
  state.cards.push(card);
  closeQuickTodoPanel();
  render();
  saveState();
}

function getQuickCapturePlanDate(value) {
  if (value === "tomorrow") return getTodayKey(addDays(new Date(), 1));
  return getTodayKey();
}

function getQuickCaptureTimer(value) {
  if (value === "today") {
    const duration = getSecondsUntilEndOfDay();
    return { mode: "date", targetAt: getStartOfTomorrow().toISOString(), duration };
  }
  if (value === "tomorrow") {
    const targetAt = getEndOfTomorrow();
    return {
      mode: "date",
      targetAt: targetAt.toISOString(),
      duration: Math.max(60, Math.ceil((targetAt.getTime() - Date.now()) / 1000))
    };
  }
  if (value === "week") {
    return { mode: "days", targetAt: null, duration: 7 * 24 * 60 * 60 };
  }
  return { mode: "none", targetAt: null, duration: 0 };
}

function getQuickCaptureFallbackTitle(type) {
  if (type === "single") return "New task";
  if (type === "checklist") return "New project";
  if (type === "brief") return "New idea";
  return "New to-do list";
}

function getQuickCaptureFallbackItems(type) {
  if (type === "checklist") return ["Define outcome", "Choose next step", "Review progress"];
  return ["Choose top priority", "Finish the next action", "Review before sleep"];
}

function renderCardsOnly() {
  settleExpiredTimers();
  resetDailyRepeatingCards();
  const orderedCards = getOrderedCards();
  const filteredByStatus = orderedCards.filter((card) => matchesFilter(card));
  const filteredBySearch = filteredByStatus.filter((card) => matchesSearch(card));
  const filteredByFocus = filteredBySearch.filter((card) => matchesFocus(card));
  elements.boardGrid.innerHTML = "";
  renderTodayFocus(orderedCards);
  renderCategoryPills(filteredByFocus);
  elements.clearSearchButton.hidden = !normalizeLabel(state.searchQuery || "");

  const visibleCards = filteredByFocus.filter((card) => matchesCategory(card));
  if (!visibleCards.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = getEmptyStateMarkup(filteredByStatus.length);
    elements.boardGrid.append(empty);
  } else {
    renderBoardColumns(visibleCards);
  }

  renderStats(visibleCards);
  renderRecentCards();
  hydrateIcons(elements.boardGrid);
}

function renderBoardColumns(cards) {
  const columnCount = getBoardColumnCount();
  elements.boardGrid.style.setProperty("--board-columns", columnCount);
  const columns = buildBoardColumns(cards, columnCount);
  columns.forEach((columnCards, columnIndex) => {
    const column = document.createElement("div");
    column.className = "board-column";
    column.dataset.columnIndex = String(columnIndex);
    column.classList.toggle("is-empty", columnCards.length === 0);
    column.addEventListener("dragover", (event) => {
      if (!draggedCardId) return;
      event.preventDefault();
      column.classList.add("is-drop-ready");
    });
    column.addEventListener("dragleave", (event) => {
      if (event.relatedTarget && column.contains(event.relatedTarget)) return;
      column.classList.remove("is-drop-ready");
    });
    column.addEventListener("drop", (event) => {
      event.preventDefault();
      column.classList.remove("is-drop-ready");
      if (!draggedCardId) return;
      moveCardToColumnEnd(draggedCardId, columnIndex);
    });

    columnCards.forEach((card) => column.append(renderCard(card, { columnIndex })));
    const dropTarget = document.createElement("div");
    dropTarget.className = "column-drop-target";
    dropTarget.textContent = columnCards.length ? "Drop to bottom" : "Drop here";
    column.append(dropTarget);
    elements.boardGrid.append(column);
  });
}

function getBoardColumnCount() {
  const width = elements.boardGrid.clientWidth || elements.boardGrid.getBoundingClientRect().width || window.innerWidth;
  if (width < 700) return 1;
  if (width < 920) return 2;
  return 3;
}

function buildBoardColumns(cards, columnCount) {
  const count = Math.max(1, Math.min(3, Number(columnCount) || 1));
  const columns = Array.from({ length: count }, () => []);
  const hasManualColumns = state.board.layout === "custom" && cards.some((card) => Number.isFinite(Number(card.layoutColumn)));
  cards.forEach((card, index) => {
    const columnIndex = hasManualColumns && Number.isFinite(Number(card.layoutColumn))
      ? clampInt(card.layoutColumn, 0, count - 1, 0)
      : index % count;
    columns[columnIndex].push(card);
  });
  if (hasManualColumns) {
    columns.forEach((column) => column.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)));
  }
  return columns;
}

function getLayoutColumn(card) {
  return Number.isFinite(Number(card.layoutColumn)) ? Number(card.layoutColumn) : Number.MAX_SAFE_INTEGER;
}

function getEmptyStateMarkup(statusCount) {
  if (state.focusFilter && state.focusFilter !== "all") {
    return "<div><h3>No focus cards</h3><p>Clear the focus filter or choose another focus tile.</p></div>";
  }
  if (normalizeLabel(state.searchQuery || "")) {
    return "<div><h3>No matching cards</h3><p>Try a title, category, reward, tracker type, or date.</p></div>";
  }
  if (statusCount > 0 && getActiveCategories().length) {
    return "<div><h3>No cards in this category</h3><p>Clear the category filter or choose another category.</p></div>";
  }
  return "<div><h3>No cards here</h3><p>Add a card or switch filters.</p></div>";
}

function renderTodayFocus(cards) {
  const counts = getTodayFocusCounts(cards);
  elements.focusTodayCount.textContent = counts.today;
  elements.focusMustCount.textContent = counts.must;
  elements.focusOverdueCount.textContent = counts.overdue;
  elements.focusDoneCount.textContent = counts.done;
  elements.todayFocusStrip.querySelectorAll("button[data-focus]").forEach((button) => {
    button.classList.toggle("is-active", state.focusFilter === button.dataset.focus);
  });
}

function getTodayFocusCounts(cards) {
  return cards.reduce(
    (counts, card) => {
      if (isTodayFocusCard(card)) counts.today += 1;
      if (isMustDoCard(card)) counts.must += 1;
      if (isOverdueCard(card)) counts.overdue += 1;
      if (getProgress(card).percent >= 100) counts.done += 1;
      return counts;
    },
    { today: 0, must: 0, overdue: 0, done: 0 }
  );
}

function matchesFocus(card) {
  if (!state.focusFilter || state.focusFilter === "all") return true;
  if (state.focusFilter === "today") return isTodayFocusCard(card);
  if (state.focusFilter === "must") return isMustDoCard(card);
  if (state.focusFilter === "overdue") return isOverdueCard(card);
  if (state.focusFilter === "done") return getProgress(card).percent >= 100;
  return true;
}

function isTodayFocusCard(card) {
  if (card.type === "daily") return getCardPlanDate(card) === getTodayKey();
  if (card.type === "routine") return true;
  if (card.runningSince) return true;
  return card.priority === "high" && getProgress(card).percent < 100;
}

function isMustDoCard(card) {
  return card.priority === "high" && getProgress(card).percent < 100;
}

function isOverdueCard(card) {
  if (card.type !== "daily") return false;
  return getCardPlanDate(card) < getTodayKey() && getProgress(card).percent < 100;
}

function renderCard(card, options = {}) {
  const interactive = options.interactive !== false;
  const template = document.querySelector("#cardTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  const theme = THEMES[card.theme] || THEMES.leaf;
  const progress = getProgress(card);
  const remaining = getRemaining(card);
  const hasTimer = hasCountdown(card);

  node.dataset.id = card.id;
  node.draggable = interactive;
  node.classList.toggle("is-preview", !interactive);
  node.classList.add("size-standard", `theme-${card.theme}`, `type-${card.type}`, `background-${card.background || "clean"}`);
  node.classList.toggle("has-image", card.includeImage);
  node.classList.toggle("no-timer", !hasTimer);
  node.classList.toggle("is-running", Boolean(card.runningSince));
  node.classList.toggle("is-expired", hasTimer && remaining <= 0);
  node.style.setProperty("--card-bg", theme.bg);
  node.style.setProperty("--card-ink", theme.ink);
  node.style.setProperty("--card-muted", theme.muted);
  node.style.setProperty("--card-accent", theme.accent);
  node.style.setProperty("--card-soft", theme.soft);
  node.style.setProperty("--card-fill", getCardFill(card, theme));
  node.style.setProperty("--card-shadow-color", hexToRgba(theme.accent, 0.24));
  node.style.setProperty("--image-source", getImageSource(card, theme));

  const typeMeta = TYPE_META[card.type] || TYPE_META.single;
  node.querySelector(".card-type").innerHTML = `${ICONS[typeMeta.icon]}<span>${typeMeta.label}</span>`;
  const category = node.querySelector(".card-category");
  category.textContent = card.category || "General";
  node.querySelector(".card-percent").textContent = `${progress.percent}%`;
  const dateChip = node.querySelector(".card-date-chip");
  const plannedDateLabel = getPlannedDateChip(card);
  if (plannedDateLabel) {
    dateChip.hidden = false;
    dateChip.textContent = plannedDateLabel;
    dateChip.title = getPlannedDateTitle(card);
  }
  const priorityChip = node.querySelector(".card-priority-chip");
  const priority = getSelectedPriority(card.priority);
  if (priority === "high" || priority === "low") {
    priorityChip.hidden = false;
    priorityChip.textContent = PRIORITY_META[priority].label;
    priorityChip.classList.toggle("is-high", priority === "high");
    priorityChip.classList.toggle("is-low", priority === "low");
  }
  node.querySelector("h3").textContent = card.title;
  node.querySelector(".card-description").textContent = card.description;
  node.querySelector(".timer-display strong").textContent = formatRemaining(card, remaining);
  node.querySelector(".timer-caption").textContent = getTimerCaption(card, remaining);
  node.querySelector(".progress-track span").style.width = `${progress.percent}%`;
  node.querySelector(".card-progress p").textContent = `${progress.percent}% · ${progress.label}`;

  const toggleButton = node.querySelector(".timer-toggle");
  const isAutoDaily = card.type === "routine";
  toggleButton.hidden = !hasTimer;
  toggleButton.title = isAutoDaily ? "Auto daily countdown" : card.runningSince ? "Pause timer" : "Start timer";
  toggleButton.setAttribute("aria-label", toggleButton.title);
  toggleButton.innerHTML = isAutoDaily
    ? `${ICONS.timer}<span>Auto</span>`
    : `${ICONS[card.runningSince ? "pause" : "play"]}<span>${card.runningSince ? "Pause" : "Start"}</span>`;
  toggleButton.disabled = !interactive || isAutoDaily || !hasTimer;
  toggleButton.classList.toggle("is-auto", isAutoDaily);
  if (interactive && hasTimer && !isAutoDaily) {
    toggleButton.addEventListener("click", () => toggleTimer(card.id));
  }

  const resetButton = node.querySelector(".timer-reset");
  const editButton = node.querySelector(".edit-card");
  const archiveButton = node.querySelector(".archive-card");
  const deleteButton = node.querySelector(".delete-card");
  resetButton.hidden = !hasTimer;
  resetButton.title = card.type === "routine" ? "Reset today" : "Reset timer";
  resetButton.setAttribute("aria-label", resetButton.title);
  resetButton.disabled = !interactive || !hasTimer;
  editButton.disabled = !interactive;
  archiveButton.disabled = !interactive;
  deleteButton.disabled = !interactive;
  if (interactive) {
    if (hasTimer) {
      resetButton.addEventListener("click", () => resetTimer(card.id));
    }
    editButton.addEventListener("click", () => startEditingCard(card.id));
    archiveButton.addEventListener("click", () => archiveCard(card.id));
    deleteButton.addEventListener("click", () => deleteCard(card.id));
  }

  const body = node.querySelector(".card-body");
  if (card.type === "checklist") {
    body.append(renderChecklist(card));
  }
  if (card.type === "brief") {
    body.append(renderBrief(card));
  }
  if (card.type === "daily" || card.type === "routine") {
    body.append(renderDailyList(card));
    if (card.type === "routine") {
      body.append(renderRoutineHistory(card));
    }
  }
  if (card.type === "workout") {
    body.append(renderWorkout(card));
  }
  if (card.type === "lab") {
    body.append(renderLab(card));
  }
  if (card.type === "minutes") {
    body.append(renderGoalTracker(card));
  }
  if (card.type === "weekly" || card.type === "monthly" || card.type === "annual" || card.type === "scheduled") {
    body.append(renderTracker(card));
  }
  if (card.type === "single") {
    body.append(renderSingleTask(card));
  }

  const rewardChip = node.querySelector(".card-reward-chip");
  if (card.reward) {
    rewardChip.hidden = false;
    rewardChip.textContent = "Reward";
    rewardChip.title = card.reward;
    rewardChip.tabIndex = 0;
    rewardChip.setAttribute("aria-label", `Reward: ${card.reward}`);
  }

  if (!interactive) {
    body.querySelectorAll("button, input").forEach((control) => {
      control.disabled = true;
    });
  }

  if (interactive) {
    node.addEventListener("dragstart", (event) => {
      draggedCardId = card.id;
      event.dataTransfer.effectAllowed = "move";
      node.classList.add("is-dragging");
    });

    node.addEventListener("dragend", () => {
      draggedCardId = null;
      node.classList.remove("is-dragging");
      document.querySelectorAll(".is-drop-ready, .is-drop-target").forEach((item) => {
        item.classList.remove("is-drop-ready", "is-drop-target");
      });
    });

    node.addEventListener("dragover", (event) => {
      if (!draggedCardId || draggedCardId === card.id) return;
      event.preventDefault();
      node.classList.add("is-drop-target");
    });

    node.addEventListener("dragleave", (event) => {
      if (event.relatedTarget && node.contains(event.relatedTarget)) return;
      node.classList.remove("is-drop-target");
    });

    node.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      node.classList.remove("is-drop-target");
      if (!draggedCardId || draggedCardId === card.id) return;
      moveCardToPosition(draggedCardId, card.id, options.columnIndex || 0);
    });
  }

  return node;
}

function renderChecklist(card) {
  const wrapper = document.createElement("div");
  wrapper.className = "checklist";
  const items = Array.isArray(card.items) ? card.items : [];
  const limit = getChecklistLimit(card);
  items.slice(0, limit).forEach((item) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = item.done;
    input.addEventListener("change", () => {
      item.done = input.checked;
      if (card.type === "routine") {
        syncRoutineTodayHistory(card);
      }
      saveState();
      renderCardsOnly();
    });
    const span = document.createElement("span");
    span.textContent = item.text;
    label.append(input, span);
    wrapper.append(label);
  });
  if (items.length > limit) {
    const more = document.createElement("p");
    more.className = "checklist-more";
    more.textContent = `+${items.length - limit} more`;
    wrapper.append(more);
  }
  return wrapper;
}

function renderBrief(card) {
  normalizeBriefSections(card);
  const wrapper = document.createElement("div");
  wrapper.className = "brief-list";
  const sections = card.sections.length ? card.sections : getDefaultBriefSections();

  sections.slice(0, 4).forEach((section) => {
    const item = document.createElement("div");
    item.className = "brief-item";
    const label = document.createElement("strong");
    label.textContent = section.label;
    const text = document.createElement("p");
    text.textContent = section.text;
    item.append(label, text);
    wrapper.append(item);
  });

  const review = document.createElement("label");
  review.className = "brief-review";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(card.reviewed);
  input.addEventListener("change", () => {
    card.reviewed = input.checked;
    saveState();
    renderCardsOnly();
  });
  const span = document.createElement("span");
  span.textContent = "Reviewed";
  review.append(input, span);
  wrapper.append(review);
  return wrapper;
}

function renderDailyList(card) {
  const wrapper = document.createElement("div");
  wrapper.className = "daily-list";
  const items = Array.isArray(card.items) ? card.items : [];
  items.forEach((item, index) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = item.done;
    input.addEventListener("change", () => {
      item.done = input.checked;
      saveState();
      renderCardsOnly();
    });
    const count = document.createElement("span");
    count.className = "daily-index";
    count.textContent = String(index + 1).padStart(2, "0");
    const text = document.createElement("span");
    text.textContent = item.text;
    label.append(input, count, text);
    wrapper.append(label);
  });
  return wrapper;
}

function renderRoutineHistory(card) {
  syncRoutineTodayHistory(card);
  const wrapper = document.createElement("div");
  wrapper.className = "routine-history";
  wrapper.tabIndex = 0;
  wrapper.role = "button";
  wrapper.title = "Open daily history";
  wrapper.addEventListener("click", () => openRoutineHistory(card.id));
  wrapper.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openRoutineHistory(card.id);
    }
  });
  const dates = getRecentDateKeys(7);
  const records = new Map((card.history || []).map((entry) => [entry.date, entry]));
  const completed = dates.filter((dateKey) => (records.get(dateKey)?.percent || 0) >= 100).length;
  const label = document.createElement("span");
  label.textContent = `History ${completed}/7`;
  const dots = document.createElement("div");
  dots.className = "history-dots";
  dates.forEach((dateKey) => {
    const record = records.get(dateKey);
    const dot = document.createElement("span");
    const percent = record ? record.percent : 0;
    dot.className = "history-dot";
    dot.classList.toggle("is-done", percent >= 100);
    dot.classList.toggle("is-partial", percent > 0 && percent < 100);
    dot.classList.toggle("is-today", dateKey === getTodayKey());
    dot.title = record
      ? `${dateKey}: ${record.done}/${record.total} done`
      : `${dateKey}: no record`;
    dots.append(dot);
  });
  wrapper.append(label, dots);
  return wrapper;
}

function renderWorkout(card) {
  const wrapper = document.createElement("div");
  wrapper.className = "workout-list";
  const exercises = Array.isArray(card.exercises) ? card.exercises : [];
  exercises.forEach((exercise, index) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = exercise.done;
    input.addEventListener("change", () => {
      exercise.done = input.checked;
      saveState();
      renderCardsOnly();
    });
    const count = document.createElement("span");
    count.className = "workout-index";
    count.textContent = String(index + 1).padStart(2, "0");
    const copy = document.createElement("span");
    copy.className = "workout-copy";
    const name = document.createElement("strong");
    name.textContent = exercise.name;
    const prescription = document.createElement("small");
    prescription.textContent = exercise.prescription;
    copy.append(name, prescription);
    label.append(input, count, copy);
    wrapper.append(label);
  });
  return wrapper;
}

function renderLab(card) {
  const wrapper = document.createElement("div");
  wrapper.className = "lab-list";
  const steps = Array.isArray(card.steps) ? card.steps : [];
  steps.forEach((step, index) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = step.done;
    input.addEventListener("change", () => {
      step.done = input.checked;
      saveState();
      renderCardsOnly();
    });
    const count = document.createElement("span");
    count.className = "lab-index";
    count.textContent = String(index + 1).padStart(2, "0");
    const copy = document.createElement("span");
    copy.className = "lab-copy";
    const name = document.createElement("strong");
    name.textContent = step.name;
    const deliverable = document.createElement("small");
    deliverable.textContent = step.deliverable;
    copy.append(name, deliverable);
    label.append(input, count, copy);
    wrapper.append(label);
  });
  return wrapper;
}

function renderGoalTracker(card) {
  const wrapper = document.createElement("div");
  wrapper.className = "goal-tracker";
  const current = Number(card.currentValue) || 0;
  const target = Math.max(1, Number(card.targetValue) || 150);
  const unit = card.unit || "min";

  const value = document.createElement("p");
  value.className = "goal-value";
  value.innerHTML = `<strong>${current}</strong><span>/ ${target} ${escapeHtml(unit)}</span>`;

  const controls = document.createElement("div");
  controls.className = "goal-controls";
  const step = ["kcal", "steps"].includes(unit) ? 100 : 10;
  [-step, step].forEach((amount) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = amount > 0 ? `+${amount}` : String(amount);
    button.addEventListener("click", () => {
      card.currentValue = Math.max(0, Math.min(target, current + amount));
      saveState();
      renderCardsOnly();
    });
    controls.append(button);
  });

  wrapper.append(value, controls);
  return wrapper;
}

function getChecklistLimit(card) {
  return Array.isArray(card.items) ? card.items.length : 0;
}

function renderSingleTask(card) {
  const wrapper = document.createElement("div");
  wrapper.className = "checklist";
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = card.done;
  input.addEventListener("change", () => {
    card.done = input.checked;
    saveState();
    renderCardsOnly();
  });
  const span = document.createElement("span");
  span.textContent = "Complete";
  label.append(input, span);
  wrapper.append(label);
  return wrapper;
}

function renderTracker(card) {
  const wrapper = document.createElement("div");
  wrapper.className = `tracker-grid ${card.type}`;
  const checks = normalizeChecks(card);
  const visibleChecks = getVisibleChecks(card, checks);
  const labels = getTrackerLabels(card.type);
  const scheduleDays = normalizeScheduleDays(card.scheduleDays || [0, 2, 4]);
  const todayIndex = getCurrentWeekIndex();
  visibleChecks.forEach((done, index) => {
    const isScheduled = card.type !== "scheduled" || scheduleDays.includes(index);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "track-dot";
    button.classList.toggle("is-done", done);
    button.classList.toggle("is-scheduled", isScheduled);
    button.classList.toggle("is-today", card.type === "scheduled" && index === todayIndex);
    button.disabled = card.type === "scheduled" && !isScheduled;
    button.textContent = labels[index] || index + 1;
    button.title = getTrackerItemTitle(card.type, index);
    button.addEventListener("click", () => {
      if (card.type === "scheduled" && !isScheduled) return;
      card.checks[index] = !card.checks[index];
      saveState();
      renderCardsOnly();
    });
    wrapper.append(button);
  });
  if (visibleChecks.length < checks.length) {
    const more = document.createElement("span");
    more.className = "track-more";
    more.textContent = `+${checks.length - visibleChecks.length}`;
    wrapper.append(more);
  }
  return wrapper;
}

function getTrackerLabels(type) {
  if (type === "weekly" || type === "scheduled") return WEEKDAY_LABELS;
  if (type === "annual") return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return Array.from({ length: daysInCurrentMonth() }, (_, index) => index + 1);
}

function getTrackerItemTitle(type, index) {
  if (type === "weekly") return `Day ${index + 1}`;
  if (type === "scheduled") return `${WEEKDAY_LABELS[index]} scheduled habit`;
  if (type === "annual") return getTrackerLabels("annual")[index];
  return `Date ${index + 1}`;
}

function renderStats(cards = state.cards) {
  const total = cards.length;
  const running = cards.filter((card) => card.runningSince).length;
  const donePercent = getAverageProgress(cards);

  elements.totalCards.textContent = total;
  elements.runningTimers.textContent = running;
  elements.completionRate.textContent = `${donePercent}%`;
}

function getSelectedFormType() {
  if (elements.cardType.value === "weekly") {
    return SCORECARD_TYPES.includes(elements.scorecardPeriod.value) ? elements.scorecardPeriod.value : "weekly";
  }
  return elements.cardType.value;
}

function setFormType(type) {
  const normalizedType = TYPE_META[type] ? type : "daily";
  if (SCORECARD_TYPES.includes(normalizedType)) {
    removeTemplateOnlyTypeOptions();
    elements.cardType.value = "weekly";
    elements.scorecardPeriod.value = normalizedType;
    return;
  }
  if (!MANUAL_TYPE_OPTIONS.includes(normalizedType)) {
    ensureTemplateOnlyTypeOption(normalizedType);
  } else {
    removeTemplateOnlyTypeOptions();
  }
  elements.cardType.value = normalizedType;
  elements.scorecardPeriod.value = "weekly";
}

function ensureTemplateOnlyTypeOption(type) {
  if (!TEMPLATE_ONLY_TYPES.includes(type)) return;
  if (elements.cardType.querySelector(`option[value="${type}"]`)) return;
  const option = document.createElement("option");
  option.value = type;
  option.dataset.templateOnly = "true";
  option.textContent = `${TYPE_META[type].label} (template card)`;
  elements.cardType.append(option);
}

function removeTemplateOnlyTypeOptions() {
  elements.cardType.querySelectorAll("option[data-template-only='true']").forEach((option) => option.remove());
}

function renderConditionalFields() {
  elements.categoryCustomField.classList.toggle("is-visible", elements.cardCategory.value === "Custom");
  const type = getSelectedFormType();
  const isRoutine = type === "routine";
  const isScheduled = type === "scheduled";
  const isScorecard = elements.cardType.value === "weekly";
  const needsListInput =
    type === "checklist" ||
    type === "brief" ||
    type === "daily" ||
    isRoutine ||
    type === "lab" ||
    type === "workout";
  elements.checklistField.classList.toggle(
    "is-visible",
    needsListInput
  );
  elements.goalField.classList.toggle("is-visible", type === "minutes");
  elements.scheduleField.classList.toggle("is-visible", isScheduled);
  elements.scorecardPeriodField.classList.toggle("is-visible", isScorecard);
  elements.dailyPlanDateField.classList.toggle("is-visible", type === "daily");
  if (type === "daily" && !normalizeDateKey(elements.cardPlanDate.value)) {
    elements.cardPlanDate.value = getTodayKey();
  }
  elements.countdownField.hidden = isRoutine;
  elements.cardTypeHelp.textContent = TYPE_HELP[type] || TYPE_HELP.daily;
  if (type === "workout") {
    elements.checklistLabel.textContent = "Workout exercises";
    elements.checklistItems.placeholder =
      "Goblet squat | 3 x 8-10 | RPE 7 | 75s rest\nIncline push-up | 3 x 8-12 | RPE 7 | 75s rest";
  } else if (type === "lab") {
    elements.checklistLabel.textContent = "AI lab steps";
    elements.checklistItems.placeholder =
      "Define the task | Prompt includes role, context and output format\nImprove the response | Save version 2 and note the change";
  } else if (type === "brief") {
    elements.checklistLabel.textContent = "Brief sections";
    elements.checklistItems.placeholder =
      "Focus | Build the highest-leverage client proposal\nRule | Protect deep work before inbox time\nNext move | Draft the first proposal page";
  } else {
    elements.checklistLabel.textContent = type === "checklist" ? "Checklist items" : isRoutine ? "Daily repeating items" : "To-do items";
    elements.checklistItems.placeholder =
      type === "checklist" ? "One item per line" : "Morning stretch\nDeep work block\nDrink water\nEvening reset";
  }
  elements.imageUrlField.classList.toggle("is-visible", elements.includeImage.checked);
  renderScheduleDays();
  elements.timerModeControl.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", selectedTimerMode === button.dataset.value);
  });
  document.querySelectorAll("[data-timer-panel]").forEach((panel) => {
    panel.classList.toggle("is-visible", !isRoutine && panel.dataset.timerPanel === selectedTimerMode);
  });
  renderFormPreview();
}

function renderArtistPacks() {
  elements.packList.innerHTML = artistPacks
    .map(
      (pack) => `
        <div class="pack">
          <div class="pack-preview" style="background: ${pack.theme}"></div>
          <div>
            <h3>${pack.name}</h3>
            <p>${pack.price}</p>
          </div>
          <button type="button" title="Locked" aria-label="Locked">${ICONS.lock}</button>
        </div>
      `
    )
    .join("");
}

function renderTemplateList() {
  elements.templateList.innerHTML = boardTemplates
    .map(
      (template) => `
        <button type="button" class="template-card ${template.id === selectedTemplateId ? "is-selected" : ""}" data-template="${escapeAttribute(template.id)}">
          <span>${escapeHtml(template.category)}</span>
          <strong>${escapeHtml(template.name)}</strong>
          <small>${escapeHtml(template.description)}</small>
        </button>
      `
    )
    .join("");
}

function renderFormPreview() {
  if (!elements.cardPreview) return;
  const shouldShowPreview = hasDraftInput() && !draftPreviewDismissed;
  elements.boardPreviewPanel.hidden = !shouldShowPreview;
  if (!shouldShowPreview) {
    elements.cardPreview.innerHTML = "";
    return;
  }
  const card = buildCardFromForm({ preview: true });
  elements.previewMeta.textContent = `Board width · ${TYPE_META[card.type].label}`;
  elements.cardPreview.innerHTML = "";
  elements.cardPreview.append(renderCard(card, { interactive: false }));
  hydrateIcons(elements.cardPreview);
  hydrateIcons(elements.boardPreviewPanel);
}

function handleDraftInputChange() {
  draftPreviewDismissed = false;
  renderFormPreview();
}

function discardDraftCard() {
  resetFormState();
  render();
}

function openTemplateModal(templateId = selectedTemplateId) {
  selectedTemplateId = boardTemplates.some((template) => template.id === templateId) ? templateId : boardTemplates[0]?.id || "";
  elements.templateModal.hidden = false;
  syncModalOpenState();
  renderTemplateModal();
}

function closeTemplateModal() {
  elements.templateModal.hidden = true;
  syncModalOpenState();
}

function renderTemplateModal() {
  renderTemplateList();
  renderTemplatePreview();
  hydrateIcons(elements.templateModal);
}

function renderTemplatePreview() {
  const template = boardTemplates.find((item) => item.id === selectedTemplateId) || boardTemplates[0];
  if (!template) return;
  selectedTemplateId = template.id;
  const cards = buildTemplateCards(template.id).map(normalizeCard);
  elements.templatePreviewMeta.textContent = `${template.category} · ${cards.length} cards`;
  elements.templatePreviewTitle.textContent = template.name;
  elements.templatePreviewDescription.textContent = template.description;
  elements.addTemplateButton.disabled = false;
  renderTemplateOverview(template, cards);
  elements.templatePreviewGrid.innerHTML = "";
  cards.forEach((card) => elements.templatePreviewGrid.append(renderCard(card, { interactive: false })));
  hydrateIcons(elements.templatePreviewGrid);
}

function renderTemplateOverview(template, cards) {
  const categories = [...new Set(cards.map((card) => card.category || "General"))].sort((a, b) => a.localeCompare(b));
  const typeCounts = cards.reduce((counts, card) => {
    const label = (TYPE_META[card.type] || TYPE_META.single).label;
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});
  const runningDaily = cards.filter((card) => card.type === "routine").length;
  const timedCards = cards.filter(hasCountdown).length;
  const weeklyLoop = cards.some((card) => ["weekly", "scheduled"].includes(card.type));
  const boardFlow = cards.slice(0, 6).map((card) => card.title);

  elements.templatePreviewOverview.innerHTML = `
    <div class="overview-stats" aria-label="Template board summary">
      <div><strong>${cards.length}</strong><span>Cards</span></div>
      <div><strong>${categories.length}</strong><span>Categories</span></div>
      <div><strong>${timedCards}</strong><span>Timers</span></div>
      <div><strong>${runningDaily}</strong><span>Daily resets</span></div>
    </div>
    <div class="overview-band">
      <div>
        <p class="eyebrow">Category mix</p>
        <div class="overview-chips">
          ${categories.map((category) => `<span>${escapeHtml(category)}</span>`).join("")}
        </div>
      </div>
      <div>
        <p class="eyebrow">Card modes</p>
        <div class="overview-chips">
          ${Object.entries(typeCounts)
            .map(([label, count]) => `<span>${escapeHtml(label)} ${count}</span>`)
            .join("")}
        </div>
      </div>
    </div>
    <div class="overview-flow">
      <p class="eyebrow">${escapeHtml(template.category)} board flow</p>
      <div>
        ${boardFlow.map((title) => `<span>${escapeHtml(title)}</span>`).join("")}
        ${weeklyLoop ? "<span>Weekly review loop</span>" : ""}
      </div>
    </div>
  `;
}

function openRoutineHistory(cardId) {
  const card = state.cards.find((item) => item.id === cardId);
  if (!card || card.type !== "routine") return;
  syncRoutineTodayHistory(card);
  saveState();
  const records = [...(card.history || [])].sort((a, b) => b.date.localeCompare(a.date));
  const completed = records.filter((entry) => entry.percent >= 100).length;
  elements.historyModalTitle.textContent = card.title;
  elements.historyModalSummary.textContent = `${records.length} saved days · ${completed} complete`;
  elements.historyModalList.innerHTML = records.length
    ? records
        .map(
          (entry) => `
            <article class="history-row">
              <div>
                <strong>${escapeHtml(entry.date)}</strong>
                <span>${entry.percent}% · ${entry.done}/${entry.total} done</span>
              </div>
              <p>${escapeHtml((entry.items || []).filter((item) => item.done).map((item) => item.text).join(", ") || "No completed items")}</p>
            </article>
          `
        )
        .join("")
    : '<div class="history-empty">History will appear after the first daily reset.</div>';
  elements.historyModal.hidden = false;
  syncModalOpenState();
}

function closeHistoryModal() {
  elements.historyModal.hidden = true;
  syncModalOpenState();
}

function openRecordsModal() {
  renderRecordsModal();
  elements.recordsModal.hidden = false;
  syncModalOpenState();
}

function closeRecordsModal() {
  elements.recordsModal.hidden = true;
  syncModalOpenState();
}

function syncModalOpenState() {
  const hasOpenModal = !elements.templateModal.hidden || !elements.historyModal.hidden || !elements.recordsModal.hidden;
  document.body.classList.toggle("modal-open", hasOpenModal);
}

function renderRecordsModal() {
  const records = getArchivedCards().slice().sort((a, b) => Number(b.archivedAt || 0) - Number(a.archivedAt || 0));
  const completed = records.filter((card) => getProgress(card).percent >= 100).length;
  elements.recordsModalTitle.textContent = "Archived cards";
  elements.recordsModalSummary.textContent = records.length
    ? `${records.length} archived · ${completed} completed · restore a card when it becomes active again`
    : "Archive completed, paused or discontinued cards so the active board stays focused.";
  elements.recordsModalList.innerHTML = records.length
    ? records.map(renderRecordRow).join("")
    : '<div class="records-empty">No archived cards yet.</div>';
  hydrateIcons(elements.recordsModalList);
}

function renderRecordRow(card) {
  const progress = getProgress(card);
  const typeMeta = TYPE_META[card.type] || TYPE_META.single;
  const archivedDate = formatRecordDate(card.archivedAt);
  const context = getCardRecordContext(card);
  return `
    <article class="record-row">
      <div class="record-main">
        <strong>${escapeHtml(card.title || "Untitled card")}</strong>
        <span>${escapeHtml(typeMeta.label)} · ${escapeHtml(card.category || "General")}${context ? ` · ${escapeHtml(context)}` : ""} · ${progress.percent}% · ${escapeHtml(card.archiveReason || "archived")} · ${escapeHtml(archivedDate)}</span>
        <p>${escapeHtml(card.description || progress.label)}</p>
      </div>
      <div class="record-actions">
        <button type="button" class="secondary-action record-restore" data-restore-card="${escapeAttribute(card.id)}">Restore</button>
      </div>
    </article>
  `;
}

function getCardRecordContext(card) {
  const parts = [];
  if (card.type === "daily") {
    parts.push(getPlannedDateTitle(card).replace("Planned for ", ""));
  }
  const priority = getSelectedPriority(card.priority);
  if (priority !== "normal") {
    parts.push(PRIORITY_META[priority].label);
  }
  return parts.join(" · ");
}

function archiveCard(id) {
  const index = state.cards.findIndex((card) => card.id === id);
  if (index < 0) return;
  const [card] = state.cards.splice(index, 1);
  const archivedCard = normalizeArchivedCard({
    ...card,
    runningSince: null,
    archivedAt: Date.now(),
    archiveReason: getArchiveReason(card)
  });
  state.archivedCards = [archivedCard, ...getArchivedCards()];
  if (editingCardId === id) {
    resetFormState();
  }
  saveState();
  render();
}

function restoreArchivedCard(id) {
  const records = getArchivedCards();
  const index = records.findIndex((card) => card.id === id);
  if (index < 0) return;
  const [archivedCard] = records.splice(index, 1);
  const restoredCard = normalizeCard({
    ...archivedCard,
    order: nextOrder(),
    runningSince: null
  });
  delete restoredCard.archivedAt;
  delete restoredCard.archiveReason;
  state.archivedCards = records;
  state.cards.push(restoredCard);
  saveState();
  render();
  renderRecordsModal();
}

function getArchivedCards(sourceState = state) {
  return Array.isArray(sourceState.archivedCards) ? sourceState.archivedCards : [];
}

function normalizeArchivedCard(card) {
  const normalized = normalizeCard(card);
  normalized.archivedAt = Number.isFinite(Number(card.archivedAt)) ? Number(card.archivedAt) : Date.now();
  normalized.archiveReason = normalizeLabel(card.archiveReason || "archived");
  normalized.runningSince = null;
  return normalized;
}

function getArchiveReason(card) {
  return getProgress(card).percent >= 100 ? "completed" : "archived";
}

function formatRecordDate(value) {
  const date = new Date(Number(value) || Date.now());
  if (!Number.isFinite(date.getTime())) return "today";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function getRecentDateLabel(value) {
  const date = new Date(Number(value) || Date.now());
  if (!Number.isFinite(date.getTime())) return "Today";
  const today = dateKeyToLocalDate(getTodayKey());
  const day = dateKeyToLocalDate(getTodayKey(date));
  const dayDelta = Math.round((day.getTime() - today.getTime()) / 86400000);
  if (dayDelta === 0) return "Today";
  if (dayDelta === -1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function parseChecklistItems() {
  return elements.checklistItems.value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBriefSections() {
  return elements.checklistItems.value
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...details] = line.split("|").map((part) => part.trim()).filter(Boolean);
      return {
        label: label || "Focus",
        text: details.join(" | ") || "Write the operating rule or next decision."
      };
    });
}

function parseWorkoutExercises() {
  return elements.checklistItems.value
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...details] = line.split("|").map((part) => part.trim()).filter(Boolean);
      return {
        name: name || "Exercise",
        prescription: details.join(" | ") || "3 x 10 | RPE 7 | 60s rest"
      };
    });
}

function parseLabSteps() {
  return elements.checklistItems.value
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...details] = line.split("|").map((part) => part.trim()).filter(Boolean);
      return {
        name: name || "AI lab step",
        deliverable: details.join(" | ") || "Saved prompt and improved output"
      };
    });
}

function getDefaultWorkoutExercises() {
  return [
    { name: "Dynamic warm-up", prescription: "6 min | easy pace" },
    { name: "Goblet squat", prescription: "3 x 8-10 | RPE 7 | 75s rest" },
    { name: "Incline push-up", prescription: "3 x 8-12 | RPE 7 | 75s rest" },
    { name: "Romanian deadlift", prescription: "3 x 8-10 | RPE 7 | 90s rest" },
    { name: "Dead bug", prescription: "2 x 10/side | RPE 6 | 45s rest" }
  ];
}

function getDefaultLabSteps() {
  return [
    { name: "Write a clear task prompt", deliverable: "Prompt includes role, context and output format" },
    { name: "Run and inspect the response", deliverable: "Mark what worked and what failed" },
    { name: "Improve the prompt", deliverable: "Second version is clearer and more specific" }
  ];
}

function getDefaultBriefSections() {
  return [
    { label: "Focus", text: "Choose the most valuable outcome before adding tasks." },
    { label: "Rule", text: "Protect focus blocks before opening reactive work." },
    { label: "Next move", text: "Turn the brief into one visible action on the board." }
  ];
}

function getSelectedCategory() {
  if (elements.cardCategory.value === "Custom") {
    return normalizeCategory(elements.cardCategoryCustom.value.trim()) || "General";
  }
  return normalizeCategory(elements.cardCategory.value) || "General";
}

function getThemeForCategory(category) {
  const key = normalizeCategory(category).toLowerCase();
  if (key === "health") return "coral";
  if (key === "work") return "graphite";
  if (key === "finance") return "honey";
  if (key === "learning") return "tide";
  if (key === "personal") return "plum";
  return "leaf";
}

function setCategoryField(category) {
  const normalizedCategory = normalizeCategory(category) || "General";
  const optionValues = [...elements.cardCategory.options].map((option) => option.value);
  if (optionValues.includes(normalizedCategory)) {
    elements.cardCategory.value = normalizedCategory;
    elements.cardCategoryCustom.value = "";
    return;
  }
  elements.cardCategory.value = "Custom";
  elements.cardCategoryCustom.value = normalizedCategory;
}

function getEditableListValue(card) {
  if (card.type === "brief") {
    normalizeBriefSections(card);
    return (card.sections || []).map((section) => `${section.label} | ${section.text}`).join("\n");
  }
  if (card.type === "workout") {
    return (card.exercises || []).map((exercise) => `${exercise.name} | ${exercise.prescription}`).join("\n");
  }
  if (card.type === "lab") {
    return (card.steps || []).map((step) => `${step.name} | ${step.deliverable}`).join("\n");
  }
  return (card.items || []).map((item) => item.text).join("\n");
}

function hasDraftInput() {
  if (editingCardId) return true;
  return Boolean(
    elements.cardTitle.value.trim() ||
      elements.cardDescription.value.trim() ||
      elements.cardReward.value.trim() ||
      elements.checklistItems.value.trim() ||
      elements.imageUrl.value.trim() ||
      attachedImageData ||
      elements.includeImage.checked ||
      elements.cardBackground.value !== "clean" ||
      elements.cardPriority.value !== "normal" ||
      normalizeDateKey(elements.cardPlanDate.value) !== getTodayKey() ||
      elements.cardCategory.value !== "General" ||
      elements.cardCategoryCustom.value.trim()
  );
}

function normalizeLabel(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCategory(value) {
  const label = normalizeLabel(String(value || ""));
  if (!label) return "General";
  return CATEGORY_ALIASES[label.toLowerCase()] || label;
}

function getSelectedPriority(value) {
  return PRIORITY_META[value] ? value : "normal";
}

function getPriorityWeight(card) {
  const priority = getSelectedPriority(card?.priority);
  return PRIORITY_META[priority].weight;
}

function normalizeDateKey(value) {
  const label = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return "";
  const date = dateKeyToLocalDate(label);
  return getTodayKey(date) === label ? label : "";
}

function getCardPlanDate(card) {
  if (!card || card.type !== "daily") return getTodayKey();
  return normalizeDateKey(card.plannedDate) || getTodayKey(new Date(card.createdAt || Date.now()));
}

function getPlannedDateChip(card) {
  if (!card || card.type !== "daily") return "";
  const dateKey = getCardPlanDate(card);
  const date = dateKeyToLocalDate(dateKey);
  const relative = getRelativeDateLabel(dateKey, getProgress(card).percent);
  const dateLabel = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return relative ? `${relative} · ${dateLabel}` : dateLabel;
}

function getPlannedDateTitle(card) {
  if (!card || card.type !== "daily") return "";
  const date = dateKeyToLocalDate(getCardPlanDate(card));
  return `Planned for ${date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;
}

function getRelativeDateLabel(dateKey, percent = 0) {
  const today = dateKeyToLocalDate(getTodayKey());
  const date = dateKeyToLocalDate(dateKey);
  const dayDelta = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (dayDelta === 0) return "Today";
  if (dayDelta === 1) return "Tomorrow";
  if (dayDelta === -1 && percent < 100) return "Yesterday";
  if (dayDelta < -1 && percent < 100) return "Overdue";
  return "";
}

function populateThemeOptions() {
  elements.cardTheme.innerHTML = Object.entries(THEMES)
    .map(([value, theme]) => `<option value="${value}">${theme.label}</option>`)
    .join("");
  elements.cardTheme.value = "leaf";
  renderThemeSwatches();
}

function populateBackgroundOptions() {
  elements.cardBackground.innerHTML = Object.entries(BACKGROUNDS)
    .map(([value, background]) => `<option value="${value}">${background.label}</option>`)
    .join("");
  elements.cardBackground.value = "clean";
  renderBackgroundSwatches();
}

function renderThemeSwatches() {
  elements.themeSwatches.innerHTML = Object.entries(THEMES)
    .map(
      ([value, theme]) => `
        <button
          type="button"
          data-theme="${value}"
          class="${elements.cardTheme.value === value ? "is-active" : ""}"
          style="--swatch: ${theme.visual}; --swatch-accent: ${theme.accent};"
          aria-label="${theme.label}"
          title="${theme.label}"
        >
          <span></span>
          <strong>${theme.label}</strong>
        </button>
      `
    )
    .join("");
}

function renderBackgroundSwatches() {
  const theme = THEMES[elements.cardTheme.value] || THEMES.leaf;
  elements.backgroundSwatches.innerHTML = Object.entries(BACKGROUNDS)
    .map(([value, background]) => {
      const swatch = background.swatch || theme.bg;
      return `
        <button
          type="button"
          data-background="${value}"
          class="${elements.cardBackground.value === value ? "is-active" : ""}"
          style="--swatch: ${swatch};"
          aria-label="${background.label}"
          title="${background.label}"
        >
          <span></span>
          <strong>${background.label}</strong>
        </button>
      `;
    })
    .join("");
}

function renderScheduleDays() {
  elements.scheduleDays.querySelectorAll("button[data-day]").forEach((button) => {
    const day = Number(button.dataset.day);
    button.classList.toggle("is-active", selectedScheduleDays.includes(day));
  });
}

function getFormTimer() {
  if (selectedTimerMode === "none") {
    return {
      mode: "none",
      targetAt: null,
      duration: 0
    };
  }

  if (selectedTimerMode === "date") {
    const targetDate = new Date(elements.timerDate.value);
    const targetMs = targetDate.getTime();
    const isValidTarget = Number.isFinite(targetMs) && targetMs > Date.now();
    const duration = isValidTarget ? Math.ceil((targetMs - Date.now()) / 1000) : 24 * 60 * 60;
    return {
      mode: "date",
      targetAt: isValidTarget ? targetDate.toISOString() : null,
      duration: Math.max(60, duration)
    };
  }

  if (selectedTimerMode === "days") {
    const days = clampInt(elements.timerDays.value, 1, 365, 1);
    return {
      mode: "days",
      targetAt: null,
      duration: days * 24 * 60 * 60
    };
  }

  const hours = Math.max(0, Number.parseInt(elements.timerHours.value, 10) || 0);
  const minutes = Math.max(0, Number.parseInt(elements.timerMinutes.value, 10) || 0);
  const totalSeconds = hours * 3600 + Math.min(minutes, 59) * 60;
  return {
    mode: "hours",
    targetAt: null,
    duration: totalSeconds > 0 ? totalSeconds : 25 * 60
  };
}

function getDailyAutoTimer() {
  const duration = getSecondsUntilEndOfDay();
  return {
    mode: "daily",
    targetAt: getStartOfTomorrow().toISOString(),
    duration,
    remaining: duration
  };
}

function populateTimerFields(card) {
  normalizeTimer(card);
  if (selectedTimerMode === "none") return;

  if (selectedTimerMode === "date") {
    if (card.targetAt) {
      const targetDate = new Date(card.targetAt);
      if (Number.isFinite(targetDate.getTime())) {
        elements.timerDate.value = toDateTimeLocalValue(targetDate);
      } else {
        setDefaultTimerDate();
      }
    } else {
      setDefaultTimerDate();
    }
    return;
  }

  if (selectedTimerMode === "days") {
    elements.timerDays.value = String(Math.max(1, Math.round(card.duration / (24 * 60 * 60))));
    return;
  }

  const hours = Math.floor(card.duration / 3600);
  const minutes = Math.floor((card.duration % 3600) / 60);
  elements.timerHours.value = String(hours);
  elements.timerMinutes.value = String(minutes);
}

function toggleTimer(id) {
  const card = state.cards.find((item) => item.id === id);
  if (!card) return;
  normalizeTimer(card);
  if (!hasCountdown(card) || card.type === "routine") return;
  if (card.runningSince) {
    card.remaining = getRemaining(card);
    card.runningSince = null;
  } else {
    if (getRemaining(card) <= 0) {
      card.remaining = card.duration;
    }
    card.runningSince = Date.now();
  }
  saveState();
  renderCardsOnly();
}

function resetTimer(id) {
  const card = state.cards.find((item) => item.id === id);
  if (!card) return;
  if (card.type === "routine") {
    resetRoutineToday(card);
    saveState();
    renderCardsOnly();
    return;
  }
  normalizeTimer(card);
  if (!hasCountdown(card)) return;
  card.remaining = card.duration;
  card.runningSince = null;
  saveState();
  renderCardsOnly();
}

function startAllTimers() {
  const now = Date.now();
  state.cards.forEach((card) => {
    if (card.type === "routine") return;
    normalizeTimer(card);
    if (!hasCountdown(card)) return;
    if (card.runningSince) return;
    if (getRemaining(card) <= 0) {
      card.remaining = card.duration;
    }
    card.runningSince = now;
  });
  saveState();
  renderCardsOnly();
}

function stopAllTimers() {
  state.cards.forEach((card) => {
    if (!card.runningSince) return;
    card.remaining = getRemaining(card);
    card.runningSince = null;
  });
  saveState();
  renderCardsOnly();
}

function deleteCard(id) {
  const card = state.cards.find((item) => item.id === id);
  if (!card) return;
  const confirmed = window.confirm(`Permanently delete "${card.title}" from this browser? Archive it instead if you may need the record.`);
  if (!confirmed) return;
  state.cards = state.cards.filter((card) => card.id !== id);
  if (editingCardId === id) {
    resetFormState();
  }
  saveState();
  renderCardsOnly();
}

function moveCardToPosition(sourceId, targetId, targetColumn) {
  if (!sourceId || sourceId === targetId) return;
  const columnCount = getBoardColumnCount();
  const columns = getCustomLayoutColumns(columnCount);
  const source = removeCardFromColumns(columns, sourceId);
  if (!source) return;
  const columnIndex = clampInt(targetColumn, 0, columnCount - 1, 0);
  const targetCards = columns[columnIndex] || columns[0];
  const targetIndex = targetCards.findIndex((card) => card.id === targetId);
  targetCards.splice(targetIndex >= 0 ? targetIndex : targetCards.length, 0, source);
  commitCustomLayoutColumns(columns);
}

function moveCardToColumnEnd(sourceId, targetColumn) {
  if (!sourceId) return;
  const columnCount = getBoardColumnCount();
  const columns = getCustomLayoutColumns(columnCount);
  const source = removeCardFromColumns(columns, sourceId);
  if (!source) return;
  const columnIndex = clampInt(targetColumn, 0, columnCount - 1, 0);
  (columns[columnIndex] || columns[0]).push(source);
  commitCustomLayoutColumns(columns);
}

function getCustomLayoutColumns(columnCount) {
  return buildBoardColumns(getOrderedCards(), columnCount);
}

function removeCardFromColumns(columns, sourceId) {
  for (const column of columns) {
    const index = column.findIndex((card) => card.id === sourceId);
    if (index >= 0) {
      return column.splice(index, 1)[0];
    }
  }
  return null;
}

function commitCustomLayoutColumns(columns) {
  let order = 1;
  columns.forEach((column, columnIndex) => {
    column.forEach((card) => {
      card.layoutColumn = columnIndex;
      card.order = order;
      order += 1;
    });
  });
  state.cards = columns.flat();
  state.board.layout = "custom";
  saveState();
  renderBoardMeta();
  renderCardsOnly();
}

function smartArrange() {
  state.cards.sort((a, b) => {
    const runningDelta = Number(Boolean(b.runningSince)) - Number(Boolean(a.runningSince));
    const doneDelta = getProgress(a).percent === 100 ? 1 : 0;
    const otherDoneDelta = getProgress(b).percent === 100 ? 1 : 0;
    return (
      runningDelta ||
      doneDelta - otherDoneDelta ||
      getPriorityWeight(a) - getPriorityWeight(b) ||
      getTypeWeight(a.type) - getTypeWeight(b.type) ||
      a.createdAt - b.createdAt
    );
  });
  state.cards.forEach((card, index) => {
    delete card.layoutColumn;
    card.order = index + 1;
  });
}

function saveCurrentLayout() {
  const columns = getCustomLayoutColumns(getBoardColumnCount());
  let order = 1;
  columns.forEach((column, columnIndex) => {
    column.forEach((card) => {
      card.layoutColumn = columnIndex;
      card.order = order;
      order += 1;
    });
  });
  state.cards = columns.flat();
  state.board.layout = "custom";
  state.board.savedLayout = state.cards.map((card) => ({
    id: card.id,
    column: Number(card.layoutColumn) || 0
  }));
  saveState();
  render();
}

function restoreSavedLayout() {
  const savedLayout = Array.isArray(state.board.savedLayout) ? state.board.savedLayout : [];
  if (!savedLayout.length) return;
  const savedItems = savedLayout.map((entry, index) =>
    typeof entry === "string"
      ? { id: entry, column: null, index }
      : { id: entry.id, column: Number.isFinite(Number(entry.column)) ? Number(entry.column) : null, index }
  );
  const savedById = new Map(savedItems.filter((item) => item.id).map((item) => [item.id, item]));
  state.cards.sort((a, b) => {
    const aOrder = savedById.has(a.id) ? savedById.get(a.id).index : Number.MAX_SAFE_INTEGER;
    const bOrder = savedById.has(b.id) ? savedById.get(b.id).index : Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder || Number(a.order || 0) - Number(b.order || 0);
  });
  state.cards.forEach((card, index) => {
    const saved = savedById.get(card.id);
    if (saved && saved.column !== null) {
      card.layoutColumn = Math.max(0, Math.round(saved.column));
    }
    card.order = index + 1;
  });
  state.board.layout = "custom";
  saveState();
  render();
}

function getOrderedCards() {
  const cards = [...state.cards];
  if (state.board.layout === "custom") {
    return cards.sort(
      (a, b) =>
        getLayoutColumn(a) - getLayoutColumn(b) ||
        Number(a.order || 0) - Number(b.order || 0)
    );
  }

  if (state.board.layout === "focus") {
    return cards.sort((a, b) => {
      const running = Number(Boolean(b.runningSince)) - Number(Boolean(a.runningSince));
      const done = Number(getProgress(a).percent === 100) - Number(getProgress(b).percent === 100);
      const priority = getPriorityWeight(a) - getPriorityWeight(b);
      const progress = getProgress(a).percent - getProgress(b).percent;
      return running || done || priority || progress || a.order - b.order;
    });
  }

  return cards.sort(
    (a, b) =>
      Number(getProgress(a).percent === 100) - Number(getProgress(b).percent === 100) ||
      getPriorityWeight(a) - getPriorityWeight(b) ||
      getTypeWeight(a.type) - getTypeWeight(b.type) ||
      a.order - b.order
  );
}

function getTypeWeight(type) {
  const weights = { brief: 0, routine: 1, scheduled: 2, daily: 3, lab: 4, workout: 5, minutes: 6, checklist: 7, weekly: 8, monthly: 9, annual: 10, single: 11 };
  return Number.isFinite(weights[type]) ? weights[type] : 9;
}

function matchesFilter(card) {
  const progress = getProgress(card).percent;
  if (state.activeFilter === "active") return progress < 100;
  if (state.activeFilter === "done") return progress === 100;
  return true;
}

function matchesSearch(card) {
  const query = normalizeLabel(state.searchQuery || "").toLowerCase();
  if (!query) return true;
  return getCardSearchText(card).includes(query);
}

function getCardSearchText(card) {
  const typeMeta = TYPE_META[card.type] || TYPE_META.single;
  const progress = getProgress(card);
  const parts = [
    card.title,
    card.description,
    card.category,
    card.reward,
    typeMeta.label,
    progress.label,
    getSelectedPriority(card.priority),
    card.type === "daily" ? getPlannedDateTitle(card) : ""
  ];
  return parts.map((part) => normalizeLabel(part || "").toLowerCase()).join(" ");
}

function matchesCategory(card) {
  const activeCategories = getActiveCategories();
  return activeCategories.length === 0 || activeCategories.includes(card.category || "General");
}

function toggleCategoryFilter(category) {
  if (category === "all") {
    state.activeCategories = [];
    state.activeCategory = "all";
    return;
  }

  const activeCategories = getActiveCategories();
  state.activeCategories = activeCategories.includes(category)
    ? activeCategories.filter((item) => item !== category)
    : [...activeCategories, category];
  state.activeCategory = "all";
}

function getActiveCategories(sourceState = state) {
  if (Array.isArray(sourceState.activeCategories)) {
    return [...new Set(sourceState.activeCategories.map(normalizeCategory).filter(Boolean))];
  }
  if (sourceState.activeCategory && sourceState.activeCategory !== "all") {
    return [normalizeCategory(sourceState.activeCategory)].filter(Boolean);
  }
  return [];
}

function getAverageProgress(cards) {
  return cards.length
    ? Math.round(cards.reduce((sum, card) => sum + getProgress(card).percent, 0) / cards.length)
    : 0;
}

function getProgress(card) {
  if (card.type === "single") {
    const percent = card.done ? 100 : 0;
    return { percent, label: card.done ? "Complete" : "Not done" };
  }

  if (card.type === "brief") {
    const percent = card.reviewed ? 100 : 0;
    return { percent, label: card.reviewed ? "Reviewed" : "Open brief" };
  }

  if (card.type === "checklist" || card.type === "daily" || card.type === "routine") {
    const items = card.items || [];
    const done = items.filter((item) => item.done).length;
    const percent = items.length ? Math.round((done / items.length) * 100) : 0;
    return { percent, label: `${done}/${items.length} items` };
  }

  if (card.type === "workout") {
    const exercises = card.exercises || [];
    const done = exercises.filter((exercise) => exercise.done).length;
    const percent = exercises.length ? Math.round((done / exercises.length) * 100) : 0;
    return { percent, label: `${done}/${exercises.length} exercises` };
  }

  if (card.type === "lab") {
    const steps = card.steps || [];
    const done = steps.filter((step) => step.done).length;
    const percent = steps.length ? Math.round((done / steps.length) * 100) : 0;
    return { percent, label: `${done}/${steps.length} lab steps` };
  }

  if (card.type === "minutes") {
    const target = Math.max(1, Number(card.targetValue) || 150);
    const current = Math.max(0, Number(card.currentValue) || 0);
    const percent = Math.min(100, Math.round((current / target) * 100));
    return { percent, label: `${current}/${target} ${card.unit || "min"}` };
  }

  if (card.type === "scheduled") {
    const checks = normalizeChecks(card);
    const scheduleDays = normalizeScheduleDays(card.scheduleDays || [0, 2, 4]);
    const done = scheduleDays.filter((index) => checks[index]).length;
    const percent = scheduleDays.length ? Math.round((done / scheduleDays.length) * 100) : 0;
    return { percent, label: `${done}/${scheduleDays.length} scheduled` };
  }

  const checks = normalizeChecks(card);
  const done = checks.filter(Boolean).length;
  const percent = checks.length ? Math.round((done / checks.length) * 100) : 0;
  return { percent, label: `${done}/${checks.length} ${getTrackerUnit(card.type)}` };
}

function normalizeChecks(card) {
  const targetLength = getTrackerLength(card.type);
  if (!Array.isArray(card.checks)) card.checks = [];
  if (card.checks.length !== targetLength) {
    card.checks = Array.from({ length: targetLength }, (_, index) => Boolean(card.checks[index]));
    saveState();
  }
  return card.checks;
}

function getVisibleChecks(card, checks) {
  return checks;
}

function getTrackerLength(type) {
  if (type === "monthly") return daysInCurrentMonth();
  if (type === "annual") return 12;
  return 7;
}

function getTrackerUnit(type) {
  if (type === "scheduled") return "scheduled";
  if (type === "weekly") return "days";
  if (type === "annual") return "months";
  return "marked";
}

function hasCountdown(card) {
  if (!card) return false;
  if (card.type === "routine") return true;
  return ["daily", "date", "days", "hours"].includes(card.timerMode);
}

function getRemaining(card) {
  normalizeTimer(card);
  if (!hasCountdown(card)) return 0;
  if (card.type === "routine" || card.timerMode === "daily") {
    return getSecondsUntilEndOfDay();
  }
  const base = Math.max(0, card.remaining || 0);
  if (!card.runningSince) return base;
  const elapsed = Math.floor((Date.now() - card.runningSince) / 1000);
  return Math.max(0, base - elapsed);
}

function normalizeTimer(card) {
  if (card.type === "routine" || card.timerMode === "daily") {
    const autoTimer = getDailyAutoTimer();
    card.timerMode = "daily";
    card.targetAt = autoTimer.targetAt;
    card.duration = autoTimer.duration;
    card.remaining = autoTimer.remaining;
    card.runningSince = null;
    return;
  }

  if (card.timerMode === "none") {
    card.targetAt = null;
    card.duration = 0;
    card.remaining = 0;
    card.runningSince = null;
    return;
  }

  const previousElapsed = Number(card.elapsed) || 0;
  const duration = Number(card.duration) || Number(card.durationSeconds) || Number(card.remaining) || Math.max(previousElapsed, 25 * 60);
  card.duration = Math.max(60, Math.floor(duration));

  if (!Number.isFinite(Number(card.remaining))) {
    card.remaining = card.duration;
  }

  card.remaining = Math.max(0, Math.min(card.duration, Math.floor(Number(card.remaining))));
}

function settleExpiredTimers() {
  let changed = false;
  state.cards.forEach((card) => {
    if (card.type === "routine") return;
    if (!hasCountdown(card)) return;
    if (!card.runningSince) return;
    const remaining = getRemaining(card);
    if (remaining > 0) return;
    card.remaining = 0;
    card.runningSince = null;
    if (card.type === "single") {
      card.done = true;
    }
    changed = true;
  });

  if (changed) saveState();
}

function resetDailyRepeatingCards() {
  const today = getTodayKey();
  let changed = false;
  state.cards.forEach((card) => {
    if (card.type !== "routine") return;
    normalizeRoutineHistory(card);
    if (card.lastResetDate === today) {
      syncRoutineTodayHistory(card);
      return;
    }
    rollRoutineHistory(card, today);
    if (Array.isArray(card.items)) {
      card.items.forEach((item) => {
        item.done = false;
      });
    }
    card.lastResetDate = today;
    normalizeTimer(card);
    syncRoutineTodayHistory(card);
    changed = true;
  });

  if (changed) saveState();
}

function rollRoutineHistory(card, todayKey) {
  const previousKey = card.lastResetDate || todayKey;
  if (previousKey === todayKey) return;
  upsertRoutineHistory(card, previousKey, card.items || [], "logged");

  let cursor = addDays(dateKeyToLocalDate(previousKey), 1);
  const today = dateKeyToLocalDate(todayKey);
  while (cursor < today) {
    upsertRoutineHistory(card, getTodayKey(cursor), getMissedRoutineItems(card), "missed");
    cursor = addDays(cursor, 1);
  }
  trimRoutineHistory(card);
}

function resetRoutineToday(card) {
  if (Array.isArray(card.items)) {
    card.items.forEach((item) => {
      item.done = false;
    });
  }
  card.lastResetDate = getTodayKey();
  syncRoutineTodayHistory(card);
  normalizeTimer(card);
}

function syncRoutineTodayHistory(card) {
  if (card.type !== "routine") return;
  normalizeRoutineHistory(card);
  upsertRoutineHistory(card, getTodayKey(), card.items || [], "today");
}

function upsertRoutineHistory(card, dateKey, items, status) {
  normalizeRoutineHistory(card);
  const snapshotItems = (Array.isArray(items) ? items : []).map((item) => ({
    text: normalizeLabel(item.text || item.name || "Item"),
    done: Boolean(item.done)
  }));
  const done = snapshotItems.filter((item) => item.done).length;
  const total = snapshotItems.length;
  const entry = {
    date: dateKey,
    status,
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    items: snapshotItems
  };
  const index = card.history.findIndex((record) => record.date === dateKey);
  if (index >= 0) {
    card.history[index] = entry;
  } else {
    card.history.push(entry);
  }
  trimRoutineHistory(card);
}

function normalizeRoutineHistory(card) {
  card.history = Array.isArray(card.history)
    ? card.history
        .filter((entry) => entry && entry.date)
        .map((entry) => ({
          date: entry.date,
          status: entry.status || "logged",
          done: Math.max(0, Number(entry.done) || 0),
          total: Math.max(0, Number(entry.total) || 0),
          percent: Math.max(0, Math.min(100, Number(entry.percent) || 0)),
          items: Array.isArray(entry.items) ? entry.items.map((item) => ({ text: normalizeLabel(item.text || "Item"), done: Boolean(item.done) })) : []
        }))
    : [];
}

function trimRoutineHistory(card) {
  card.history.sort((a, b) => a.date.localeCompare(b.date));
  if (card.history.length > HISTORY_LIMIT) {
    card.history = card.history.slice(card.history.length - HISTORY_LIMIT);
  }
}

function getMissedRoutineItems(card) {
  return (card.items || []).map((item) => ({ ...item, done: false }));
}

function getImageSource(card, theme) {
  if (card.imageData) return `url("${cssEscapeUrl(card.imageData)}")`;
  if (card.imageUrl) return `url("${cssEscapeUrl(card.imageUrl)}")`;
  return theme.visual;
}

function getCardFill(card, theme) {
  const background = BACKGROUNDS[card.background] || BACKGROUNDS.clean;
  return background.fill || theme.bg;
}

function getTimerCaption(card, remaining) {
  if (!hasCountdown(card)) return "No deadline";
  if (remaining <= 0) return "Time up";
  if (card.timerMode === "daily") return "Day reset";
  if (card.timerMode === "date" && card.targetAt) {
    const date = new Date(card.targetAt);
    if (Number.isFinite(date.getTime())) {
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
  }
  if (card.timerMode === "days") return "Days left";
  return "Time left";
}

function formatRemaining(card, totalSeconds) {
  if (!hasCountdown(card)) return "Open";
  if ((card.timerMode === "date" || card.timerMode === "days") && totalSeconds >= 24 * 60 * 60) {
    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / 3600);
    return `${days}d ${String(hours).padStart(2, "0")}h`;
  }
  return formatTime(totalSeconds);
}

function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((unit) => String(unit).padStart(2, "0")).join(":");
}

function setDefaultTimerDate() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setSeconds(0, 0);
  elements.timerDate.value = toDateTimeLocalValue(tomorrow);
}

function getStartOfTomorrow(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
}

function getEndOfTomorrow(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 2, 0, 0, 0, 0);
}

function getSecondsUntilEndOfDay(date = new Date()) {
  return Math.max(1, Math.ceil((getStartOfTomorrow(date).getTime() - date.getTime()) / 1000));
}

function dateKeyToLocalDate(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0);
}

function getRecentDateKeys(count) {
  const today = new Date();
  return Array.from({ length: count }, (_, index) => getTodayKey(addDays(today, index - count + 1)));
}

function getCurrentWeekIndex(date = new Date()) {
  return (date.getDay() + 6) % 7;
}

function normalizeScheduleDays(days) {
  const normalized = [...new Set((Array.isArray(days) ? days : [0, 2, 4]).map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
  return normalized.length ? normalized : [0, 2, 4];
}

function toDateTimeLocalValue(date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result || ""));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function daysInCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

function getTodayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextOrder() {
  return state.cards.length ? Math.max(...state.cards.map((card) => card.order || 0)) + 1 : 1;
}

function createBoardRecord({ id = createId(), name, visibility = "private", layout = "smart", savedLayout = [], cards = [], archivedCards = [], createdAt = Date.now() }) {
  const normalizedCards = cards.map(normalizeCard).map((card, index) => ({
    ...card,
    order: Number(card.order) > 0 ? Number(card.order) : index + 1
  }));
  const normalizedArchivedCards = archivedCards.map(normalizeArchivedCard);
  return {
    id,
    name: normalizeLabel(name || "New board"),
    visibility,
    layout,
    savedLayout: Array.isArray(savedLayout) ? savedLayout : [],
    cards: normalizedCards,
    archivedCards: normalizedArchivedCards,
    createdAt
  };
}

function ensureBoards(nextState) {
  nextState.boards = Array.isArray(nextState.boards)
    ? nextState.boards.map((board) =>
        createBoardRecord({
          ...board,
          id: board.id || createId(),
          name: board.name || board.board?.name || "Board",
          visibility: board.visibility || board.board?.visibility || "private",
          layout: board.layout || board.board?.layout || "smart",
          savedLayout: Array.isArray(board.savedLayout) ? board.savedLayout : [],
          cards: Array.isArray(board.cards) ? board.cards : [],
          archivedCards: Array.isArray(board.archivedCards) ? board.archivedCards : [],
          createdAt: board.createdAt || Date.now()
        })
      )
    : [];

  if (!nextState.boards.length) {
    const activeId = nextState.activeBoardId || "personal-board";
    nextState.boards.push(
      createBoardRecord({
        id: activeId,
        name: nextState.board?.name || "My Progress Board",
        visibility: nextState.board?.visibility || "private",
        layout: nextState.board?.layout || "smart",
        cards: Array.isArray(nextState.cards) ? nextState.cards : [],
        archivedCards: Array.isArray(nextState.archivedCards) ? nextState.archivedCards : []
      })
    );
    nextState.activeBoardId = activeId;
  }

  if (!nextState.boards.some((board) => board.id === nextState.activeBoardId)) {
    nextState.activeBoardId = nextState.boards[0].id;
  }

  nextState.activeCategories = getActiveCategories(nextState);
  nextState.activeCategory = "all";
  applyBoardToState(nextState, nextState.activeBoardId);
  return nextState;
}

function applyBoardToState(nextState, boardId) {
  const board = nextState.boards.find((item) => item.id === boardId) || nextState.boards[0];
  if (!board) return;
  nextState.activeBoardId = board.id;
  nextState.board = {
    name: board.name,
    visibility: board.visibility,
    layout: board.layout,
    savedLayout: Array.isArray(board.savedLayout) ? board.savedLayout : []
  };
  nextState.cards = board.cards.map(normalizeCard);
  nextState.archivedCards = Array.isArray(board.archivedCards) ? board.archivedCards.map(normalizeArchivedCard) : [];
}

function syncActiveBoard() {
  if (!Array.isArray(state.boards) || !state.boards.length) {
    state.boards = [
      createBoardRecord({
        id: state.activeBoardId || "personal-board",
        name: state.board.name,
        visibility: state.board.visibility,
        layout: state.board.layout,
        cards: state.cards,
        archivedCards: getArchivedCards()
      })
    ];
    state.activeBoardId = state.boards[0].id;
  }
  const index = state.boards.findIndex((board) => board.id === state.activeBoardId);
  if (index < 0) return;
  state.boards[index] = {
    ...state.boards[index],
    name: state.board.name,
    visibility: state.board.visibility,
    layout: state.board.layout,
    savedLayout: Array.isArray(state.board.savedLayout) ? state.board.savedLayout : [],
    cards: state.cards.map(normalizeCard),
    archivedCards: getArchivedCards().map(normalizeArchivedCard)
  };
}

function switchBoard(boardId) {
  syncActiveBoard();
  applyBoardToState(state, boardId);
  state.activeFilter = "all";
  state.activeCategory = "all";
  state.activeCategories = [];
  state.focusFilter = "all";
  state.searchQuery = "";
  resetFormState();
  render();
  saveState();
}

function createBlankBoard() {
  syncActiveBoard();
  const board = createBoardRecord({
    name: `Board ${state.boards.length + 1}`,
    cards: []
  });
  state.boards.push(board);
  applyBoardToState(state, board.id);
  state.activeFilter = "all";
  state.activeCategory = "all";
  state.activeCategories = [];
  state.focusFilter = "all";
  state.searchQuery = "";
  resetFormState();
  render();
  saveState();
}

function deleteCurrentBoard() {
  syncActiveBoard();
  if (state.boards.length < 2) return;
  const currentBoard = state.boards.find((board) => board.id === state.activeBoardId);
  if (!currentBoard) return;
  const confirmed = window.confirm(`Delete "${currentBoard.name}" and its cards from this browser?`);
  if (!confirmed) return;

  const currentIndex = state.boards.findIndex((board) => board.id === currentBoard.id);
  state.boards = state.boards.filter((board) => board.id !== currentBoard.id);
  const nextBoard = state.boards[Math.max(0, currentIndex - 1)] || state.boards[0];
  applyBoardToState(state, nextBoard.id);
  state.activeFilter = "all";
  state.activeCategory = "all";
  state.activeCategories = [];
  state.focusFilter = "all";
  state.searchQuery = "";
  resetFormState();
  render();
  saveState();
}

function createBoardFromTemplate(templateId) {
  const template = boardTemplates.find((item) => item.id === templateId);
  if (!template) return;
  syncActiveBoard();
  const board = createBoardRecord({
    name: template.name,
    cards: buildTemplateCards(template.id)
  });
  state.boards.push(board);
  applyBoardToState(state, board.id);
  state.activeFilter = "all";
  state.activeCategory = "all";
  state.activeCategories = [];
  state.focusFilter = "all";
  state.searchQuery = "";
  resetFormState();
  render();
  saveState();
}

function buildTemplateCards(templateId) {
  if (templateId === "life-os") {
    return [
      makeCard({
        title: "Daily command brief",
        description: "One compact operating view before the day fills up.",
        category: "Operations",
        reward: "Clear head",
        priority: "high",
        type: "brief",
        theme: "graphite",
        background: "paper",
        timerMode: "date",
        targetAt: getStartOfTomorrow().toISOString(),
        duration: getSecondsUntilEndOfDay(),
        sections: [
          ["Intent", "Win the day by moving one personal and one business objective."],
          ["Top 3", "Revenue action, health action, relationship action."],
          ["Boundary", "No inbox or messages before the first focus block."],
          ["Shutdown", "Review wins, missed loops and tomorrow's first action."]
        ]
      }),
      makeCard({
        title: "Today top 3",
        description: "A daily plan for the three outcomes that matter most.",
        category: "Personal",
        reward: "Evening reset",
        priority: "high",
        type: "routine",
        theme: "plum",
        background: "clean",
        items: ["Pick one work win", "Pick one health win", "Pick one personal win", "Close the day with notes"]
      }),
      makeCard({
        title: "Deep work bank",
        description: "Accumulate high-focus minutes for strategy, sales, product or creation.",
        category: "Work",
        reward: "Long walk",
        type: "minutes",
        theme: "tide",
        background: "sky",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        targetValue: 600,
        currentValue: 120,
        unit: "min"
      }),
      makeCard({
        title: "Priority decision matrix",
        description: "Turn a messy task list into do, schedule, delegate or drop.",
        category: "Operations",
        reward: "Cleaner calendar",
        type: "brief",
        theme: "leaf",
        background: "mint",
        timerMode: "hours",
        duration: 20 * 60,
        sections: [
          ["Do", "Important and urgent: finish personally today."],
          ["Schedule", "Important and not urgent: protect time on the calendar."],
          ["Delegate", "Urgent and lower leverage: assign with a clear owner."],
          ["Drop", "Low value: remove from the board or park for later review."]
        ]
      }),
      makeCard({
        title: "Business pipeline pulse",
        description: "Keep revenue conversations moving with a clear next step.",
        category: "Sales",
        reward: "Proposal polish",
        type: "checklist",
        theme: "coral",
        background: "blush",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        items: [
          "List warm leads",
          "Send two follow-ups",
          "Move one proposal forward",
          "Book one decision call",
          "Update next action for each lead"
        ]
      }),
      makeCard({
        title: "Meeting follow-up queue",
        description: "Capture commitments before they become mental clutter.",
        category: "Work",
        reward: "Inbox calm",
        priority: "high",
        plannedDate: getTodayKey(),
        type: "daily",
        theme: "graphite",
        background: "clean",
        timerMode: "date",
        targetAt: getStartOfTomorrow().toISOString(),
        duration: getSecondsUntilEndOfDay(),
        items: ["Send notes", "Assign owners", "Schedule next step", "Archive reference"]
      }),
      makeCard({
        title: "Gym M/W/F",
        description: "Training attendance for strength, energy and stress control.",
        category: "Health",
        reward: "Recovery meal",
        type: "scheduled",
        theme: "coral",
        background: "blush",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        scheduleDays: [0, 2, 4],
        checks: [false, false, false, false, false, false, false]
      }),
      makeCard({
        title: "Daily energy basics",
        description: "Sleep, water, steps and food awareness before bigger goals.",
        category: "Energy",
        reward: "No-guilt rest",
        type: "routine",
        theme: "leaf",
        background: "mint",
        items: ["7+ hours sleep", "2L water", "8,000 steps", "Protein each meal", "Log calories"]
      }),
      makeCard({
        title: "Calorie awareness",
        description: "Track food intake without turning the board into a spreadsheet.",
        category: "Health",
        reward: "Favourite meal planned",
        type: "minutes",
        theme: "honey",
        background: "paper",
        timerMode: "date",
        targetAt: getStartOfTomorrow().toISOString(),
        duration: getSecondsUntilEndOfDay(),
        targetValue: 2200,
        currentValue: 650,
        unit: "kcal"
      }),
      makeCard({
        title: "Cash and commitments review",
        description: "Check personal cash, invoices, subscriptions and upcoming payments.",
        category: "Finance",
        reward: "Dinner out",
        type: "weekly",
        theme: "honey",
        background: "paper",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        checks: [false, false, false, false, true, false, false]
      }),
      makeCard({
        title: "Relationship deposits",
        description: "Keep important people visible, not only urgent work.",
        category: "Relationships",
        reward: "Slow coffee",
        type: "weekly",
        theme: "plum",
        background: "clean",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        checks: [true, false, false, true, false, false, false]
      }),
      makeCard({
        title: "Weekly executive review",
        description: "Reflect, reorganize, choose next week's leverage and clear loose ends.",
        category: "Operations",
        reward: "Sunday off",
        type: "checklist",
        theme: "tide",
        background: "sky",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        items: [
          "Capture open loops",
          "Review wins and misses",
          "Reassign unfinished tasks",
          "Choose Weekly Big 3",
          "Block focus time"
        ]
      }),
      makeCard({
        title: "Monthly life scorecard",
        description: "Mark the days you ended with health, work and money under control.",
        category: "Personal",
        reward: "Personal retreat",
        type: "monthly",
        theme: "leaf",
        background: "clean",
        timerMode: "days",
        duration: 30 * 24 * 60 * 60,
        checks: Array.from({ length: daysInCurrentMonth() }, (_, index) => index < 5)
      })
    ];
  }

  if (templateId === "ai-starter") {
    return [
      makeCard({
        title: "AI course orientation",
        description: "Set up the learning baseline, choose one AI tool and define your first use cases.",
        category: "AI Basics",
        reward: "Learning map",
        priority: "high",
        type: "checklist",
        theme: "tide",
        background: "sky",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        items: [
          "Write three everyday tasks you want AI to help with",
          "Create a folder for prompts, outputs and notes",
          "Pick one assistant tool to practise with",
          "Write your personal AI safety rules",
          "Save your first before/after example"
        ]
      }),
      makeCard({
        title: "Daily AI practice habit",
        description: "Small repeatable practice to build fluency without getting overwhelmed.",
        category: "AI Basics",
        reward: "Practice streak",
        priority: "high",
        type: "routine",
        theme: "leaf",
        background: "mint",
        timerMode: "hours",
        duration: 24 * 60 * 60,
        items: ["15 min prompt practice", "Save one useful prompt", "Verify one factual claim", "Write one learning note"]
      }),
      makeCard({
        title: "Prompting fundamentals lab",
        description: "Learn the core pattern: task, context, constraints, examples and output format.",
        category: "Prompting",
        reward: "Prompt template",
        type: "lab",
        theme: "coral",
        background: "blush",
        timerMode: "hours",
        duration: 45 * 60,
        steps: [
          ["Task framing", "Prompt states the job, audience and success criteria"],
          ["Context block", "Relevant background is separated from instructions"],
          ["Output format", "Response asks for a table, checklist or concise format"],
          ["Iteration", "Version 2 improves specificity after reviewing output"]
        ]
      }),
      makeCard({
        title: "Research and verification lab",
        description: "Use AI to research faster while checking sources, dates and uncertainty.",
        category: "Research",
        reward: "Trust checklist",
        type: "lab",
        theme: "honey",
        background: "paper",
        timerMode: "hours",
        duration: 50 * 60,
        steps: [
          ["Ask for a research plan", "Plan lists sources to check and unknowns"],
          ["Compare two sources", "Notes include date, publisher and key disagreement"],
          ["Find weak claims", "Output labels claims as confirmed, uncertain or unsupported"],
          ["Write cited summary", "Summary separates facts from recommendations"]
        ]
      }),
      makeCard({
        title: "Responsible AI checklist",
        description: "Build safe habits around private data, bias, hallucinations and human judgement.",
        category: "Ethics",
        reward: "Safety badge",
        type: "checklist",
        theme: "plum",
        background: "paper",
        timerMode: "days",
        duration: 14 * 24 * 60 * 60,
        items: [
          "Do not paste passwords, private IDs or sensitive client data",
          "Check outputs before using them in public or paid work",
          "Ask for assumptions and limitations",
          "Look for bias or missing perspectives",
          "Keep human approval for important decisions"
        ]
      }),
      makeCard({
        title: "AI workflow automation lab",
        description: "Turn one repetitive task into a clear reusable workflow.",
        category: "Automation",
        reward: "Reusable workflow",
        type: "lab",
        theme: "graphite",
        background: "clean",
        timerMode: "hours",
        duration: 60 * 60,
        steps: [
          ["Map the current workflow", "List input, process, output and review step"],
          ["Design the AI assistant role", "Prompt defines role, rules and format"],
          ["Test with three examples", "Save output quality notes"],
          ["Create final workflow card", "Checklist is ready to reuse weekly"]
        ]
      }),
      makeCard({
        title: "Weekly AI practice minutes",
        description: "Accumulate deliberate practice across prompting, verification and workflow design.",
        category: "AI Basics",
        reward: "Skill stack",
        type: "minutes",
        theme: "leaf",
        background: "clean",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        targetValue: 180,
        currentValue: 0,
        unit: "min"
      }),
      makeCard({
        title: "Capstone: personal AI assistant",
        description: "Build one complete assistant workflow for your study, work or personal board.",
        category: "Project",
        reward: "Portfolio artefact",
        type: "checklist",
        theme: "tide",
        background: "sky",
        timerMode: "date",
        targetAt: new Date(Date.now() + 4 * 7 * 24 * 60 * 60 * 1000).toISOString(),
        duration: 4 * 7 * 24 * 60 * 60,
        items: [
          "Choose one real task",
          "Write system-style role and boundaries",
          "Create three test cases",
          "Improve prompt after failures",
          "Document final prompt, use case and limits"
        ]
      })
    ];
  }

  if (templateId === "foundation") {
    return [
      makeCard({
        title: "Course orientation",
        description: "Readiness check, baseline photos, starting loads and safety notes before week one.",
        category: "Fitness",
        reward: "Course unlocked",
        priority: "high",
        type: "checklist",
        theme: "graphite",
        background: "paper",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        items: [
          "Confirm no pain or medical restriction",
          "Record bodyweight and waist",
          "Take front, side and back photos",
          "Choose starting dumbbell or machine loads",
          "Schedule three strength sessions"
        ]
      }),
      makeCard({
        title: "Daily trainee standards",
        description: "Repeat these every day to support training quality and recovery.",
        category: "Recovery",
        reward: "Recovery streak",
        priority: "high",
        type: "routine",
        theme: "leaf",
        background: "mint",
        timerMode: "hours",
        duration: 24 * 60 * 60,
        items: ["7+ hours sleep", "2L water", "7,000 steps", "10 min mobility", "Protein each meal"]
      }),
      makeCard({
        title: "Workout A: Squat + Push",
        description: "Full-body strength session for weeks 1-4. Add load when all reps feel controlled.",
        category: "Strength",
        reward: "Post-workout meal",
        type: "workout",
        theme: "coral",
        background: "blush",
        timerMode: "hours",
        duration: 60 * 60,
        exercises: [
          ["Dynamic warm-up", "6 min | easy pace"],
          ["Goblet squat", "3 x 8-10 | RPE 7 | 75s rest"],
          ["Incline push-up or DB press", "3 x 8-12 | RPE 7 | 75s rest"],
          ["Romanian deadlift", "3 x 8-10 | RPE 7 | 90s rest"],
          ["Dead bug", "2 x 10/side | RPE 6 | 45s rest"]
        ]
      }),
      makeCard({
        title: "Workout B: Pull + Hinge",
        description: "Second strength day. Keep two reps in reserve and maintain clean form.",
        category: "Strength",
        reward: "Stretch session",
        type: "workout",
        theme: "tide",
        background: "sky",
        timerMode: "hours",
        duration: 60 * 60,
        exercises: [
          ["Brisk walk warm-up", "5 min | nasal breathing"],
          ["Reverse lunge", "3 x 8/side | RPE 7 | 75s rest"],
          ["One-arm row", "3 x 10/side | RPE 7 | 75s rest"],
          ["Hip thrust or glute bridge", "3 x 10-12 | RPE 7 | 75s rest"],
          ["Farmer carry", "4 x 30m | tall posture | 60s rest"]
        ]
      }),
      makeCard({
        title: "Workout C: Conditioning + Core",
        description: "Low-impact conditioning session that builds the engine without wrecking recovery.",
        category: "Conditioning",
        reward: "Easy walk",
        type: "workout",
        theme: "honey",
        background: "paper",
        timerMode: "hours",
        duration: 45 * 60,
        exercises: [
          ["Warm-up bike or walk", "5 min | easy"],
          ["Intervals", "8 rounds | 45s hard + 75s easy"],
          ["Plank", "3 x 30-45s | RPE 7 | 45s rest"],
          ["Side plank", "2 x 20-30s/side | controlled"],
          ["Cool down", "6 min | easy pace"]
        ]
      }),
      makeCard({
        title: "Weekly cardio volume",
        description: "Build toward the weekly aerobic target using walking, cycling, rowing or swimming.",
        category: "Conditioning",
        reward: "Outdoor session",
        type: "minutes",
        theme: "leaf",
        background: "clean",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        targetValue: 150,
        currentValue: 0,
        unit: "min"
      }),
      makeCard({
        title: "8-week progression",
        description: "Follow the course phases before increasing intensity.",
        category: "Course",
        reward: "Next block plan",
        type: "checklist",
        theme: "plum",
        background: "paper",
        timerMode: "date",
        targetAt: new Date(Date.now() + 8 * 7 * 24 * 60 * 60 * 1000).toISOString(),
        duration: 8 * 7 * 24 * 60 * 60,
        items: [
          "Weeks 1-2: learn form and keep RPE 6-7",
          "Weeks 3-4: add one set to main lifts",
          "Weeks 5-6: add load when top reps are clean",
          "Week 7: test best controlled set",
          "Week 8: deload and review results"
        ]
      }),
      makeCard({
        title: "Weekly coach check-in",
        description: "Use this to decide whether to progress, repeat or deload.",
        category: "Course",
        reward: "Coach feedback",
        type: "weekly",
        theme: "graphite",
        background: "clean",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        checks: [false, false, false, false, false, false, false]
      })
    ];
  }

  if (templateId === "fitness") {
    return [
      makeCard({
        title: "Today movement",
        description: "Small daily actions that keep the streak alive.",
        category: "Fitness",
        reward: "Recovery drink",
        type: "routine",
        theme: "coral",
        background: "blush",
        timerMode: "hours",
        duration: 16 * 60 * 60,
        items: ["Morning stretch", "Walk 6,000 steps", "Protein with lunch", "Evening mobility"]
      }),
      makeCard({
        title: "Weekly workouts",
        description: "Gym sessions scheduled for Monday, Wednesday and Friday.",
        category: "Fitness",
        reward: "Rest day",
        type: "scheduled",
        theme: "leaf",
        background: "mint",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        scheduleDays: [0, 2, 4],
        checks: [false, false, false, false, false, false, false]
      }),
      makeCard({
        title: "Sleep rhythm",
        description: "Mark each day you hit the target bedtime.",
        category: "Health",
        reward: "Slow Sunday",
        type: "monthly",
        theme: "plum",
        background: "paper",
        timerMode: "days",
        duration: 30 * 24 * 60 * 60,
        checks: Array.from({ length: daysInCurrentMonth() }, () => false)
      })
    ];
  }

  if (templateId === "study") {
    return [
      makeCard({
        title: "Daily study list",
        description: "Repeatable study routine for the current sprint.",
        category: "Study",
        reward: "Free evening",
        type: "routine",
        theme: "tide",
        background: "sky",
        includeImage: false,
        timerMode: "hours",
        duration: 10 * 60 * 60,
        items: ["Review notes", "Practice questions", "Flashcards", "Summarize mistakes"]
      }),
      makeCard({
        title: "Exam countdown",
        description: "Keep the final date visible while the list changes daily.",
        category: "Study",
        reward: "Weekend off",
        type: "checklist",
        theme: "graphite",
        background: "clean",
        timerMode: "date",
        targetAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        duration: 14 * 24 * 60 * 60,
        items: ["Past paper 1", "Past paper 2", "Formula sheet", "Mock review"]
      }),
      makeCard({
        title: "Reading month",
        description: "Mark each day with at least 20 minutes of reading.",
        category: "Learning",
        reward: "New book",
        type: "monthly",
        theme: "honey",
        background: "paper",
        timerMode: "days",
        duration: 30 * 24 * 60 * 60,
        checks: Array.from({ length: daysInCurrentMonth() }, () => false)
      })
    ];
  }

  return [];
}

function makeCard(options) {
  const id = createId();
  const autoTimer = options.type === "routine" ? getDailyAutoTimer() : null;
  const timerMode = autoTimer ? "daily" : ["none", "date", "days", "hours"].includes(options.timerMode) ? options.timerMode : "none";
  const duration = timerMode === "none" ? 0 : autoTimer ? autoTimer.duration : Number(options.duration) || 25 * 60;
  const category = normalizeCategory(options.category || "General");
  const card = {
    id,
    title: options.title,
    description: options.description || "",
    category,
    reward: options.reward || "",
    priority: getSelectedPriority(options.priority),
    metadata: { category },
    type: options.type || "single",
    size: "standard",
    theme: options.theme || "leaf",
    background: options.background || "clean",
    includeImage: Boolean(options.includeImage),
    imageUrl: options.imageUrl || "",
    imageData: "",
    timerMode,
    targetAt: autoTimer ? autoTimer.targetAt : options.targetAt || null,
    duration,
    remaining: duration,
    runningSince: null,
    lastResetDate: options.type === "routine" ? getTodayKey() : null,
    history: options.type === "routine" ? [] : undefined,
    order: 0,
    createdAt: Date.now()
  };

  if (card.type === "daily") {
    card.plannedDate = normalizeDateKey(options.plannedDate) || getTodayKey();
  }

  if (Array.isArray(options.items)) {
    card.items = options.items.map((text) => ({ id: createId(), text, done: false }));
  }
  if (Array.isArray(options.exercises)) {
    card.exercises = options.exercises.map(([name, prescription]) => ({
      id: createId(),
      name,
      prescription,
      done: false
    }));
  }
  if (Array.isArray(options.steps)) {
    card.steps = options.steps.map(([name, deliverable]) => ({
      id: createId(),
      name,
      deliverable,
      done: false
    }));
  }
  if (Array.isArray(options.sections)) {
    card.sections = options.sections.map((section) => {
      const [label, text] = Array.isArray(section) ? section : [section.label, section.text];
      return {
        label: normalizeLabel(label || "Focus"),
        text: normalizeLabel(text || "Write the operating rule or next decision.")
      };
    });
  }
  if (card.type === "minutes") {
    card.targetValue = Math.max(1, Number(options.targetValue) || 150);
    card.currentValue = Math.max(0, Math.min(card.targetValue, Number(options.currentValue) || 0));
    card.unit = options.unit || "min";
  }
  if (Array.isArray(options.checks)) {
    card.checks = [...options.checks];
  }
  if (card.type === "scheduled") {
    card.scheduleDays = normalizeScheduleDays(options.scheduleDays);
    card.checks = Array.isArray(options.checks) ? [...options.checks] : Array.from({ length: 7 }, () => false);
  }
  if (card.type === "single") {
    card.done = false;
  }
  if (card.type === "brief") {
    if (!Array.isArray(card.sections)) card.sections = getDefaultBriefSections();
    card.reviewed = Boolean(options.reviewed);
  }
  return card;
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return ensureCourseBoard(ensureSampleCards(ensureBoards(cloneDefaultState())));
  try {
    const parsed = JSON.parse(stored);
    const cards = Array.isArray(parsed.cards) ? parsed.cards.map(normalizeCard) : [];
    const archivedCards = Array.isArray(parsed.archivedCards) ? parsed.archivedCards.map(normalizeArchivedCard) : [];
    return ensureCourseBoard(
      ensureSampleCards(
        ensureBoards({
          ...cloneDefaultState(),
          ...parsed,
          sampleVersion: Number(parsed.sampleVersion) || 0,
          courseBoardVersion: Number(parsed.courseBoardVersion) || 0,
          aiCourseBoardVersion: Number(parsed.aiCourseBoardVersion) || 0,
          lifeOsBoardVersion: Number(parsed.lifeOsBoardVersion) || 0,
          board: {
            ...defaultState.board,
            ...(parsed.board || {})
          },
          ui: {
            ...defaultState.ui,
            ...(parsed.ui || {})
          },
          cards,
          archivedCards
        })
      )
    );
  } catch {
    return ensureCourseBoard(ensureSampleCards(ensureBoards(cloneDefaultState())));
  }
}

function ensureSampleCards(nextState) {
  if ((Number(nextState.sampleVersion) || 0) >= SAMPLE_VERSION) return nextState;

  const existingTitles = new Set(nextState.cards.map((card) => (card.title || "").toLowerCase()));
  const samples = cloneDefaultState().cards.slice(4);
  let order = nextState.cards.length ? Math.max(...nextState.cards.map((card) => Number(card.order) || 0)) + 1 : 1;

  samples.forEach((sample) => {
    if (existingTitles.has((sample.title || "").toLowerCase())) return;
    const cloned = JSON.parse(JSON.stringify(sample));
    cloned.id = createId();
    cloned.order = order;
    cloned.createdAt = Date.now() - order * 10000;
    if (Array.isArray(cloned.items)) {
      cloned.items = cloned.items.map((item) => ({ ...item, id: createId() }));
    }
    nextState.cards.push(normalizeCard(cloned));
    existingTitles.add((cloned.title || "").toLowerCase());
    order += 1;
  });

  nextState.sampleVersion = SAMPLE_VERSION;
  nextState.activeFilter = "all";
  nextState.activeCategory = "all";
  nextState.activeCategories = [];
  const activeBoard = Array.isArray(nextState.boards)
    ? nextState.boards.find((board) => board.id === nextState.activeBoardId)
    : null;
  if (activeBoard) {
    activeBoard.cards = nextState.cards.map(normalizeCard);
  }
  return nextState;
}

function ensureCourseBoard(nextState) {
  if (!Array.isArray(nextState.boards)) return nextState;
  const fitnessCourseId = "fitness-foundation-course";
  const aiCourseId = "ai-starter-course";
  const lifeOsId = "life-work-operating-board";
  const hasFitnessCourse = nextState.boards.some((board) => board.id === fitnessCourseId);
  const hasAiCourse = nextState.boards.some((board) => board.id === aiCourseId);
  const hasLifeOs = nextState.boards.some((board) => board.id === lifeOsId);
  const needsFitnessCourse = (Number(nextState.courseBoardVersion) || 0) < COURSE_BOARD_VERSION;
  const needsAiCourse = (Number(nextState.aiCourseBoardVersion) || 0) < AI_COURSE_BOARD_VERSION;
  const needsLifeOs = (Number(nextState.lifeOsBoardVersion) || 0) < LIFE_OS_BOARD_VERSION;

  if (!hasFitnessCourse) {
    nextState.boards.push(
      createBoardRecord({
        id: fitnessCourseId,
        name: "Fitness Foundation Course",
        visibility: "private",
        layout: "smart",
        cards: buildTemplateCards("foundation"),
        createdAt: Date.now()
      })
    );
  }

  if (!hasAiCourse) {
    nextState.boards.push(
      createBoardRecord({
        id: aiCourseId,
        name: "AI Starter Course",
        visibility: "private",
        layout: "smart",
        cards: buildTemplateCards("ai-starter"),
        createdAt: Date.now()
      })
    );
  }

  if (!hasLifeOs) {
    nextState.boards.push(
      createBoardRecord({
        id: lifeOsId,
        name: "Life & Work Operating Board",
        visibility: "private",
        layout: "smart",
        cards: buildTemplateCards("life-os"),
        createdAt: Date.now()
      })
    );
  }

  if (needsFitnessCourse || !hasFitnessCourse) {
    applyBoardToState(nextState, fitnessCourseId);
    nextState.activeFilter = "all";
    nextState.activeCategory = "all";
    nextState.activeCategories = [];
  }

  if (needsAiCourse || !hasAiCourse) {
    applyBoardToState(nextState, aiCourseId);
    nextState.activeFilter = "all";
    nextState.activeCategory = "all";
    nextState.activeCategories = [];
  }

  if (needsLifeOs || !hasLifeOs) {
    applyBoardToState(nextState, lifeOsId);
    nextState.activeFilter = "all";
    nextState.activeCategory = "all";
    nextState.activeCategories = [];
  }

  nextState.courseBoardVersion = COURSE_BOARD_VERSION;
  nextState.aiCourseBoardVersion = AI_COURSE_BOARD_VERSION;
  nextState.lifeOsBoardVersion = LIFE_OS_BOARD_VERSION;
  return nextState;
}

function normalizeCard(card) {
  const next = {
    ...card,
    id: card.id || createId(),
    order: Number.isFinite(Number(card.order)) ? Number(card.order) : 0,
    createdAt: Number.isFinite(Number(card.createdAt)) ? Number(card.createdAt) : Date.now()
  };
  next.type = TYPE_META[next.type] ? next.type : "single";
  next.timerMode = ["none", "date", "days", "hours", "daily"].includes(next.timerMode) ? next.timerMode : "none";
  normalizeTimer(next);
  next.size = "standard";
  if (Number.isFinite(Number(next.layoutColumn))) {
    next.layoutColumn = Math.max(0, Math.round(Number(next.layoutColumn)));
  } else {
    delete next.layoutColumn;
  }
  next.background = BACKGROUNDS[next.background] ? next.background : "clean";
  next.imageData = next.imageData || "";
  next.category = normalizeCategory(next.category || "General");
  next.reward = normalizeLabel(next.reward || "");
  next.priority = getSelectedPriority(next.priority);
  next.metadata = next.metadata && typeof next.metadata === "object" ? { ...next.metadata } : {};
  next.metadata.category = next.category;
  if (next.type === "brief") {
    normalizeBriefSections(next);
    next.reviewed = Boolean(next.reviewed);
  }
  if ((next.type === "checklist" || next.type === "daily" || next.type === "routine") && !Array.isArray(next.items)) next.items = [];
  if (next.type === "daily") {
    next.plannedDate = normalizeDateKey(next.plannedDate) || getTodayKey(new Date(next.createdAt));
  } else {
    delete next.plannedDate;
  }
  if (next.type === "routine") {
    if (!next.lastResetDate) next.lastResetDate = getTodayKey();
    normalizeRoutineHistory(next);
    normalizeTimer(next);
  }
  if (next.type === "workout") {
    next.exercises = Array.isArray(next.exercises) ? next.exercises.map(normalizeExercise) : [];
  }
  if (next.type === "lab") {
    next.steps = Array.isArray(next.steps) ? next.steps.map(normalizeLabStep) : [];
  }
  if (next.type === "minutes") {
    next.targetValue = Math.max(1, Number(next.targetValue) || 150);
    next.currentValue = Math.max(0, Math.min(next.targetValue, Number(next.currentValue) || 0));
    next.unit = normalizeLabel(next.unit || "min");
  }
  if (next.type === "scheduled") {
    next.scheduleDays = normalizeScheduleDays(next.scheduleDays);
  }
  if ((next.type === "weekly" || next.type === "monthly" || next.type === "annual" || next.type === "scheduled") && !Array.isArray(next.checks)) {
    next.checks = [];
  }
  return next;
}

function normalizeExercise(exercise) {
  return {
    ...exercise,
    id: exercise.id || createId(),
    name: normalizeLabel(exercise.name || exercise.text || "Exercise"),
    prescription: normalizeLabel(exercise.prescription || "3 x 10 | RPE 7 | 60s rest"),
    done: Boolean(exercise.done)
  };
}

function normalizeLabStep(step) {
  return {
    ...step,
    id: step.id || createId(),
    name: normalizeLabel(step.name || step.text || "AI lab step"),
    deliverable: normalizeLabel(step.deliverable || "Saved prompt and improved output"),
    done: Boolean(step.done)
  };
}

function normalizeBriefSections(card) {
  card.sections = Array.isArray(card.sections)
    ? card.sections
        .map((section) => ({
          label: normalizeLabel(section.label || "Focus"),
          text: normalizeLabel(section.text || section.value || "Write the operating rule or next decision.")
        }))
        .filter((section) => section.label || section.text)
    : [];
  return card.sections;
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function getDefaultRecentOpen() {
  return !(globalThis.matchMedia && globalThis.matchMedia("(max-width: 640px)").matches);
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function saveState() {
  syncActiveBoard();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  elements.savedState.textContent = "Saved";
  elements.savedState.classList.remove("is-saving");
}

function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((slot) => {
    const icon = ICONS[slot.dataset.icon];
    if (icon) slot.innerHTML = icon;
  });
}

function cssEscapeUrl(url) {
  return url.replace(/"/g, "%22").replace(/\)/g, "%29");
}

function hexToRgba(hex, alpha) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return `rgba(17, 17, 17, ${alpha})`;
  const [, red, green, blue] = match;
  return `rgba(${Number.parseInt(red, 16)}, ${Number.parseInt(green, 16)}, ${Number.parseInt(blue, 16)}, ${alpha})`;
}
