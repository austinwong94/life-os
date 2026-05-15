const STORAGE_KEY = "progress-board-v1";
const SAMPLE_VERSION = 15;
const COURSE_BOARD_VERSION = 1;
const AI_COURSE_BOARD_VERSION = 1;
const LIFE_OS_BOARD_VERSION = 5;
const HISTORY_LIMIT = 370;
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const AUTO_SAVE_INTERVAL_MS = 30000;
const CLOUD_SAVE_DEBOUNCE_MS = 1400;
const CLOUD_CONFLICT_TOLERANCE_MS = 1000;
const LOCAL_DEV_RELOAD_POLL_MS = 1500;
const LOCAL_DEV_RELOAD_FILES = ["index.html", "styles.css", "app.js"];
const DIARY_BACKUP_KEY = "life-os-diary-entry-backups";
const MAX_IMAGE_FILE_BYTES = 1_500_000;
const CONTENT_CARD_TYPES = ["planner", "planlist", "diary", "quote", "video", "fitness", "food"];
const TRUSTED_VIDEO_DOMAINS = {
  youtube: ["youtube.com", "youtu.be"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.watch"]
};
const SUPABASE_CONFIG = window.PROGRESS_BOARD_SUPABASE || {
  url: "https://shrmhjulhfuodtrsqhpu.supabase.co",
  anonKey: "sb_publishable_DFWPjTEDRTsgM3pA_XPWdw_LAYQk_lP",
  redirectUrl: "https://austinwong94.github.io/life-os/"
};
const CLOUD_SESSION_KEY = "life-os-cloud-session";
const CLOUD_RECOVERY_KEY = "life-os-cloud-recovery";
const CLOUD_TABLE_MISSING_MESSAGE = "Supabase table missing. Run supabase/cloud_sync_patch.sql in the Supabase SQL Editor.";
const LOCAL_CLIENT_KEY = "life-os-client-id";
let cloudSession = loadCloudSession();
let cloudSaveTimer = null;
let cloudSaveEnabled = Boolean(cloudSession?.access_token);
let cloudStatusMessage = "";
let localStateSource = "default";
let lastDailyMaintenanceDate = getTodayKey();

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
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17.5 19H8a5 5 0 1 1 1.2-9.86A6 6 0 0 1 20 12.5 3.5 3.5 0 0 1 17.5 19Z"/></svg>',
  timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 2h4"/><path d="M12 14l3-3"/><circle cx="12" cy="14" r="8"/></svg>',
  "layout-grid": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>',
  "bar-chart": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 7v10"/><path d="M18 7v10"/><path d="M8 9v6"/><path d="M16 9v6"/><path d="M8 12h8"/><path d="M3 10v4"/><path d="M21 10v4"/></svg>',
  utensils: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 3v8"/><path d="M8 3v8"/><path d="M4 7h4"/><path d="M6 11v10"/><path d="M18 3v18"/><path d="M15 3v7a3 3 0 0 0 3 3"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
  "more-vertical": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
  "move-right": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8l4 4-4 4"/><path d="M2 12h20"/><path d="M7 16l-4-4 4-4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m20 6-11 11-5-5"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.52a2 2 0 0 1-1 1.72l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.52a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h4"/><path d="M12 12h8"/><circle cx="10" cy="12" r="2"/><path d="M4 18h12"/><path d="M20 18h0"/><circle cx="18" cy="18" r="2"/></svg>',
  quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 11H6a4 4 0 0 1 4-4v2a2 2 0 0 0-2 2v1h2v5H5v-6a6 6 0 0 1 6-6"/><path d="M19 11h-4a4 4 0 0 1 4-4v2a2 2 0 0 0-2 2v1h2v5h-5v-6a6 6 0 0 1 6-6"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="18" height="14" x="3" y="5" rx="2"/><path d="m10 9 5 3-5 3Z"/></svg>',
  "chevron-left": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m15 18-6-6 6-6"/></svg>',
  "chevron-right": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 18 6-6-6-6"/></svg>',
  "external-link": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  sidebar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m15 9 3 3-3 3"/></svg>'
};

const TYPE_META = {
  single: { label: "Task", icon: "check" },
  event: { label: "Event", icon: "calendar" },
  brief: { label: "Brief", icon: "list" },
  daily: { label: "To-do", icon: "list" },
  planner: { label: "Planner", icon: "calendar" },
  planlist: { label: "Planner-view", icon: "list" },
  diary: { label: "Diary", icon: "calendar" },
  quote: { label: "Motivation", icon: "quote" },
  video: { label: "Video", icon: "video" },
  fitness: { label: "Fitness log", icon: "dumbbell" },
  food: { label: "Food tracker", icon: "utensils" },
  routine: { label: "Routine", icon: "timer" },
  scheduled: { label: "Schedule", icon: "calendar" },
  lab: { label: "AI Lab", icon: "list" },
  workout: { label: "Workout", icon: "list" },
  minutes: { label: "Goal", icon: "timer" },
  checklist: { label: "Project", icon: "list" },
  weekly: { label: "Scorecard", icon: "calendar" },
  monthly: { label: "Month", icon: "calendar" },
  annual: { label: "Year", icon: "calendar" }
};

const TYPE_HELP = {
  daily: "Use for a one-day to-do list. It does not reset automatically, so it is best for today, tomorrow, or a specific short plan.",
  planner: "Use like a physical planner book. Pick a date and write future plans inside one card without splitting the board.",
  planlist: "Use for Today, This week, This month, or Upcoming lists connected to Planner cards on this board.",
  diary: "Use for a dated daily diary with feeling, one sentence and thoughts. Each date is saved as its own page.",
  brief: "Use for strategy, rules, decisions, priorities, or a review prompt. It is a guidance card, not a task.",
  quote: "Use for motivational words, reminders, affirmations or principles you want visible on the board.",
  video: "Use for a YouTube, Instagram or Facebook video you want to keep beside the work it supports.",
  fitness: "Use for detailed workout sessions, body metrics and report-ready fitness history.",
  food: "Use for daily meals, reusable foods, calories, macros, fiber and month-specific nutrition targets.",
  single: "Use for one clear outcome that is either done or not done.",
  event: "Use for a trip, birthday, launch, renewal or important date. The countdown is automatic and cannot be paused.",
  routine: "Use for a daily routine that repeats every day, auto-counts down to midnight, and saves daily history.",
  scheduled: "Use for habits that happen only on selected weekdays, such as gym on Monday, Wednesday and Friday.",
  minutes: "Use for a measurable target such as minutes, calories, steps, pages, reps, or sessions.",
  checklist: "Use for a project with multiple fixed steps that you tick off once.",
  weekly: "Use for a repeated scorecard. Choose week, month, or year below.",
  monthly: "Month grid. This is now handled through Scorecard grid.",
  annual: "Year grid. This is now handled through Scorecard grid.",
  lab: "Template-only guided practice card. Used by course boards when each step needs a deliverable.",
  workout: "Template-only workout card. Used by fitness boards for exercise prescriptions."
};

const TYPE_DETAILS = {
  daily: {
    best: "Today, tomorrow, day-after, or next-week task lists",
    timing: "Plan day is the main signal. Add a deadline only when the list must close by a real time."
  },
  diary: {
    best: "Daily reflection and mood history",
    timing: "No timer. The date arrows handle past and future pages."
  },
  planner: {
    best: "Future plans, reminders and dated notes",
    timing: "No timer. Choose the exact date inside the card, even months or years ahead."
  },
  planlist: {
    best: "A linked Today, Week, Month, or Upcoming list from Planner",
    timing: "No timer. It reads dated Planner notes on this board and can exclude earlier views to avoid duplicate items."
  },
  brief: {
    best: "Decisions, rules, plans and review prompts",
    timing: "Usually no timer. Add an hour timer only when using it as a focused thinking session."
  },
  quote: {
    best: "Motivation, principles and personal reminders",
    timing: "No timer. This is a visible anchor, not a task."
  },
  video: {
    best: "YouTube, Instagram or Facebook references",
    timing: "No timer. Pair it with a task card when action is needed."
  },
  fitness: {
    best: "Detailed workout logging, strength parts, running, missed areas and body metrics",
    timing: "No timer. Use the date inside the card so reports can group sessions by week or month."
  },
  food: {
    best: "Daily food logging, meal totals, reusable foods and month-by-month nutrition targets",
    timing: "No timer. The date inside the card records each day; targets are saved by month so future target changes do not rewrite old months."
  },
  single: {
    best: "One clear task or outcome",
    timing: "Timer is optional. Use hours for a focus sprint or date for a deadline."
  },
  event: {
    best: "Trips, launches, birthdays, renewals and important dates",
    timing: "Automatic countdown. It cannot be paused because the event date keeps moving closer."
  },
  routine: {
    best: "Daily repeating checklist",
    timing: "Automatic countdown to midnight with daily history saved."
  },
  scheduled: {
    best: "Habits on selected weekdays",
    timing: "Use for planned weekdays such as gym on Mon/Wed/Fri. It checks attendance, not every day of a period."
  },
  minutes: {
    best: "Measurable goals like minutes, calories, pages, steps or sessions",
    timing: "Timer is optional. Use a deadline when the goal belongs to a week, month or event."
  },
  checklist: {
    best: "Projects with fixed steps",
    timing: "Timer is optional. Use date for a deadline, or leave it blank for an open project."
  },
  weekly: {
    best: "Consistency across a full week, month, or year",
    timing: "Use when the whole period matters. Schedule is only for selected repeat days."
  },
  monthly: {
    best: "Calendar-month progress",
    timing: "Use when each day of the month matters."
  },
  annual: {
    best: "Yearly goals and milestones",
    timing: "Use when progress is reviewed month by month."
  }
};

const MANUAL_TYPE_OPTIONS = ["planner", "planlist", "daily", "diary", "brief", "quote", "video", "fitness", "food", "single", "event", "routine", "scheduled", "minutes", "checklist", "weekly"];
const SCORECARD_TYPES = ["weekly", "monthly", "annual"];
const TEMPLATE_ONLY_TYPES = ["lab", "workout"];
const TYPE_PICKER_GROUPS = [
  {
    label: "Plan",
    description: "Tasks, projects, dates",
    options: [
      { type: "planner", label: "Planner", hint: "Future dates" },
      { type: "planlist", label: "Planner-view", hint: "Linked list" },
      { type: "daily", label: "To-do", hint: "Plan ahead" },
      { type: "single", label: "Task", hint: "One outcome" },
      { type: "checklist", label: "Project", hint: "Multi-step" },
      { type: "event", label: "Event", hint: "Fixed date" },
      { type: "fitness", label: "Fitness log", hint: "Workout detail" },
      { type: "food", label: "Food tracker", hint: "Meals + macros" }
    ]
  },
  {
    label: "Repeat",
    description: "Daily or chosen days",
    options: [
      { type: "routine", label: "Routine", hint: "Daily reset" },
      { type: "scheduled", label: "Schedule", hint: "Selected days" }
    ]
  },
  {
    label: "Measure",
    description: "Targets and scorecards",
    options: [
      { type: "weekly", label: "Scorecard", hint: "Full period" },
      { type: "minutes", label: "Goal", hint: "Track number" }
    ]
  },
  {
    label: "Capture",
    description: "Notes, diary, media",
    options: [
      { type: "brief", label: "Brief", hint: "Decision guide" },
      { type: "diary", label: "Diary", hint: "Daily log" },
      { type: "quote", label: "Motivation", hint: "Visible words" },
      { type: "video", label: "Video", hint: "Saved reference" }
    ]
  }
];
const TYPE_PICKER_OPTIONS = TYPE_PICKER_GROUPS.flatMap((group) => group.options);

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
  food: "Health",
  nutrition: "Health",
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
  high: { label: "Important", weight: 0, color: "#ef5d8f", soft: "rgba(239, 93, 143, 0.14)" },
  normal: { label: "Normal", weight: 1, color: "#b8beb7", soft: "rgba(184, 190, 183, 0.14)" },
  low: { label: "Secondary", weight: 2, color: "#f2d46f", soft: "rgba(242, 212, 111, 0.22)" }
};

const DIARY_MOOD_META = {
  Happy: { icon: "😄", label: "Happy" },
  Okay: { icon: "🙂", label: "Okay" },
  Calm: { icon: "😌", label: "Calm" },
  Sad: { icon: "😔", label: "Sad" },
  Angry: { icon: "😡", label: "Angry" },
  Anxious: { icon: "😟", label: "Anxious" },
  Tired: { icon: "😴", label: "Tired" }
};

const DIARY_FEELING_ALIASES = {
  Good: "Okay",
  Clear: "Calm",
  Focused: "Okay",
  Energized: "Happy",
  Stressed: "Anxious",
  Low: "Sad"
};

const FITNESS_PARTS = [
  { key: "running", label: "Running", type: "cardio" },
  { key: "chest", label: "Chest", type: "strength", defaults: ["Bench press", "Incline dumbbell press", "Chest fly"] },
  { key: "back", label: "Back", type: "strength", defaults: ["Lat pulldown", "Seated row", "Dumbbell row"] },
  { key: "shoulders", label: "Shoulders", type: "strength", defaults: ["Overhead press", "Lateral raise", "Rear delt fly"] },
  { key: "arms", label: "Arms", type: "strength", defaults: ["Biceps curl", "Triceps pressdown", "Hammer curl"] },
  { key: "abs", label: "Abs", type: "strength", defaults: ["Plank", "Cable crunch", "Hanging knee raise"] },
  { key: "legs", label: "Legs", type: "strength", defaults: ["Squat", "Leg press", "Romanian deadlift"] },
  { key: "mobility", label: "Mobility", type: "mobility" },
  { key: "other", label: "Other", type: "other" }
];

const FITNESS_METRIC_FIELDS = [
  { key: "weightKg", label: "Weight", suffix: "kg", step: "0.01", decimals: 2, min: 0 },
  { key: "heightCm", label: "Height", suffix: "cm", step: "0.1", decimals: 1, min: 0 },
  { key: "bmi", label: "BMI", suffix: "", step: "0.1", decimals: 1, min: 0 },
  { key: "bodyFatPercent", label: "Fat", suffix: "%", step: "0.1", decimals: 1, min: 0, max: 100 },
  { key: "waistCm", label: "Waist", suffix: "cm", step: "0.1", decimals: 1, min: 0 },
  { key: "restingHr", label: "Resting HR", suffix: "bpm", step: "1", decimals: 0, min: 0 },
  { key: "sleepHours", label: "Sleep", suffix: "h", step: "0.1", decimals: 1, min: 0 },
  { key: "energy", label: "Energy", suffix: "/5", step: "1", decimals: 0, min: 1, max: 5 }
];

const FOOD_NUTRIENT_KEYS = ["calories", "protein", "carbs", "fat", "fiber"];
const FOOD_NUTRIENT_META = {
  calories: { label: "Calories", short: "kcal", unit: "kcal", decimals: 0 },
  protein: { label: "Protein", short: "P", unit: "g", decimals: 1 },
  carbs: { label: "Carbs", short: "C", unit: "g", decimals: 1 },
  fat: { label: "Fat", short: "F", unit: "g", decimals: 1 },
  fiber: { label: "Fiber", short: "Fi", unit: "g", decimals: 1 }
};
const DEFAULT_FOOD_TARGETS = {
  calories: 2200,
  protein: 150,
  carbs: 230,
  fat: 65,
  fiber: 30
};
const DEFAULT_FOOD_LIBRARY = [
  { id: "rice-white-cooked", name: "Rice", servingUnit: "100g", servingGrams: 100, calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3, fiber: 0.4, source: "USDA FoodData Central, cooked white rice" },
  { id: "purple-sweet-potato", name: "Purple potato", servingUnit: "100g", servingGrams: 100, calories: 90, protein: 2.0, carbs: 20.7, fat: 0.2, fiber: 3.3, source: "USDA FoodData Central, baked sweet potato proxy" },
  { id: "edamame-cooked", name: "Edamame", servingUnit: "100g", servingGrams: 100, calories: 121, protein: 11.9, carbs: 8.9, fat: 5.2, fiber: 5.2, source: "USDA FoodData Central, cooked edamame" },
  { id: "corn-cooked", name: "Corn", servingUnit: "100g", servingGrams: 100, calories: 96, protein: 3.4, carbs: 21.0, fat: 1.5, fiber: 2.4, source: "USDA FoodData Central, cooked sweet corn" },
  { id: "spinach-cooked", name: "Spinach", servingUnit: "100g", servingGrams: 100, calories: 23, protein: 3.0, carbs: 3.8, fat: 0.3, fiber: 2.4, source: "USDA FoodData Central, cooked spinach" },
  { id: "chicken-breast-cooked", name: "Chicken breast", servingUnit: "100g", servingGrams: 100, calories: 165, protein: 31.0, carbs: 0, fat: 3.6, fiber: 0, source: "USDA FoodData Central, cooked skinless chicken breast" },
  { id: "egg-hard-boiled", name: "Egg", servingUnit: "egg", servingGrams: 50, calories: 78, protein: 6.3, carbs: 0.6, fat: 5.3, fiber: 0, source: "USDA FoodData Central, hard-boiled egg scaled to 50g" },
  { id: "tuna-can-water", name: "Tuna can", servingUnit: "can", servingGrams: 120, calories: 139, protein: 30.6, carbs: 0, fat: 1.0, fiber: 0, source: "USDA FoodData Central generic canned tuna, edit to match label" },
  { id: "whey-protein", name: "Whey protein", servingUnit: "scoop", servingGrams: 30, calories: 120, protein: 24, carbs: 3, fat: 1.5, fiber: 0, source: "Common label default, edit to match your brand" }
];

const VISIBILITY_META = {
  private: { label: "Private", icon: "lock" },
  unlisted: { label: "Unlisted", icon: "link" },
  public: { label: "Public", icon: "eye" }
};

const boardTemplates = [
  {
    id: "life-os",
    name: "Life & Work Operating Board",
    description: "A balanced home board for daily planning, work, health, money, relationships, reflection and weekly review.",
    category: "Life OS"
  },
  {
    id: "workday-command",
    name: "Workday Command Board",
    description: "Morning plan, focus blocks, meetings, communication, energy and shutdown review.",
    category: "Workday"
  },
  {
    id: "business-operator",
    name: "Business Operator Board",
    description: "Pipeline, cash, decisions, people, delivery and weekly owner review.",
    category: "Business"
  },
  {
    id: "student-life",
    name: "Student Life Board",
    description: "Classes, assignments, study blocks, exam prep, wellbeing and campus life.",
    category: "Student"
  },
  {
    id: "personal-reset",
    name: "Personal Reset Board",
    description: "Home, energy, relationships, diary, joy list and weekend reset.",
    category: "Personal"
  },
  {
    id: "creative-life",
    name: "Creative Life Board",
    description: "Ideas, inspiration videos, creator habits, publishing cadence and mood board.",
    category: "Creative"
  },
  {
    id: "foundation",
    name: "Fitness Foundation Board",
    description: "8-week strength, cardio, mobility, nutrition and recovery course.",
    category: "Health"
  }
];

const lifeOsIdeas = [
  {
    title: "Daily rhythm",
    text: "Start with a morning brief, run focus blocks, capture meetings, then close with a short shutdown review.",
    status: "Added",
    templateId: "workday-command"
  },
  {
    title: "Quick capture first",
    text: "Use Quick add for tasks, ideas, videos, diary pages and reminders without leaving the board.",
    status: "Built",
    templateId: "life-os"
  },
  {
    title: "Work and business boards",
    text: "Use separate boards for pipeline, cash, decisions, delivery, people follow-up and owner review.",
    status: "Added",
    templateId: "business-operator"
  },
  {
    title: "Student operating board",
    text: "Balance classes, assignments, exam countdowns, study streaks, health and campus admin.",
    status: "Added",
    templateId: "student-life"
  },
  {
    title: "Personal reset board",
    text: "Keep home, energy, relationships, diary and small joys visible beside work.",
    status: "Added",
    templateId: "personal-reset"
  },
  {
    title: "Creative and inspiration cards",
    text: "Save quotes, video references, idea briefs and publishing habits in a board that feels alive.",
    status: "Added",
    templateId: "creative-life"
  },
  {
    title: "Archive instead of clutter",
    text: "Complete or discontinued cards should move to Archive so the board stays current while history is preserved.",
    status: "Built",
    templateId: "life-os"
  },
  {
    title: "Signed-in sync",
    text: "Use one Life OS login to carry all boards across browsers with conflict checks before replacing newer cloud changes.",
    status: "Built"
  }
];

const defaultState = {
  sampleVersion: SAMPLE_VERSION,
  courseBoardVersion: 0,
  aiCourseBoardVersion: 0,
  lifeOsBoardVersion: 0,
  updatedAt: Date.now(),
  updatedBy: getClientId(),
  hasUserChanges: false,
  activeBoardId: "personal-board",
  board: {
    name: "My Life OS",
    visibility: "private",
    layout: "smart"
  },
  ui: {
    sidebarOpen: true,
    categoriesOpen: false,
    controlsOpen: true,
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
        { id: createId(), text: "Timer actions", done: true },
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
      reward: "",
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
    },
    {
      id: createId(),
      title: "Future planner",
      description: "Write plans into the date they belong to, like a physical planner book.",
      category: "Personal",
      reward: "",
      metadata: { category: "Personal" },
      type: "planner",
      size: "standard",
      theme: "tide",
      background: "paper",
      includeImage: false,
      imageUrl: "",
      timerMode: "none",
      duration: 0,
      remaining: 0,
      runningSince: null,
      activePlannerDate: getTodayKey(addDays(new Date(), 7)),
      plannerEntries: {
        [getTodayKey()]: {
          note: "Buy groceries for dinner.\nReview renewal reminder before lunch.",
          updatedAt: Date.now() - 9800
        },
        [getTodayKey(addDays(new Date(), 2))]: {
          note: "Prepare questions for the client call.",
          updatedAt: Date.now() - 9700
        },
        [getTodayKey(addDays(new Date(), 7))]: {
          note: "Meeting follow-up, trip idea, renewal reminder, or plan for a future date.",
          updatedAt: Date.now() - 9500
        },
        [getTodayKey(addDays(new Date(), 40))]: {
          note: "Check passport, flights and hotel options.",
          updatedAt: Date.now() - 9400
        }
      },
      order: 14,
      createdAt: Date.now() - 9500
    },
    {
      id: createId(),
      title: "Planner today",
      description: "Linked view for Personal planner items due today.",
      category: "Personal",
      reward: "",
      metadata: { category: "Personal" },
      type: "planlist",
      plannerView: "today",
      plannerViewOptions: { excludeToday: false, excludeWeek: false },
      size: "standard",
      theme: "leaf",
      background: "clean",
      includeImage: false,
      imageUrl: "",
      timerMode: "none",
      duration: 0,
      remaining: 0,
      runningSince: null,
      order: 15,
      createdAt: Date.now() - 9400
    },
    {
      id: createId(),
      title: "Planner week",
      description: "Shows the rest of this week without repeating today's list.",
      category: "Personal",
      reward: "",
      metadata: { category: "Personal" },
      type: "planlist",
      plannerView: "week",
      plannerViewOptions: { excludeToday: true, excludeWeek: false },
      size: "standard",
      theme: "tide",
      background: "sky",
      includeImage: false,
      imageUrl: "",
      timerMode: "none",
      duration: 0,
      remaining: 0,
      runningSince: null,
      order: 16,
      createdAt: Date.now() - 9300
    },
    {
      id: createId(),
      title: "Planner month",
      description: "Shows later this month without repeating the weekly view.",
      category: "Personal",
      reward: "",
      metadata: { category: "Personal" },
      type: "planlist",
      plannerView: "month",
      plannerViewOptions: { excludeToday: true, excludeWeek: true },
      size: "standard",
      theme: "plum",
      background: "paper",
      includeImage: false,
      imageUrl: "",
      timerMode: "none",
      duration: 0,
      remaining: 0,
      runningSince: null,
      order: 17,
      createdAt: Date.now() - 9200
    },
    {
      id: createId(),
      title: "Upcoming planner",
      description: "Longer-range Personal plans beyond this month.",
      category: "Personal",
      reward: "",
      metadata: { category: "Personal" },
      type: "planlist",
      plannerView: "upcoming",
      plannerViewOptions: { excludeToday: false, excludeWeek: false },
      size: "standard",
      theme: "honey",
      background: "paper",
      includeImage: false,
      imageUrl: "",
      timerMode: "none",
      duration: 0,
      remaining: 0,
      runningSince: null,
      order: 18,
      createdAt: Date.now() - 9100
    },
    {
      id: createId(),
      title: "Daily diary",
      description: "A quick check-in for mood, one sentence and thoughts.",
      category: "Personal",
      reward: "",
      metadata: { category: "Personal" },
      type: "diary",
      size: "standard",
      theme: "plum",
      background: "paper",
      includeImage: false,
      imageUrl: "",
      timerMode: "none",
      duration: 0,
      remaining: 0,
      runningSince: null,
      activeDate: getTodayKey(),
      lastDiaryDate: getTodayKey(),
      diaryEntries: {
        [getTodayKey()]: {
          feeling: "Focused",
          sentence: "I am building a board that can hold my whole life system.",
          thoughts: "Use this space for the day, then move back and forward with the arrows when reviewing older entries.",
          updatedAt: Date.now() - 9000
        }
      },
      order: 19,
      createdAt: Date.now() - 9000
    },
    {
      id: createId(),
      title: "Today's reminder",
      description: "Small progress is still progress when it is visible and reviewed.",
      category: "Personal",
      reward: "",
      metadata: { category: "Personal" },
      type: "quote",
      quoteAuthor: "Life OS principle",
      size: "standard",
      theme: "honey",
      background: "paper",
      includeImage: false,
      imageUrl: "",
      timerMode: "none",
      duration: 0,
      remaining: 0,
      runningSince: null,
      order: 20,
      createdAt: Date.now() - 8000
    },
    {
      id: createId(),
      title: "Video study card",
      description: "Save a useful video directly on the board beside the task or habit it supports.",
      category: "Learning",
      reward: "",
      metadata: { category: "Learning" },
      type: "video",
      videoUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      size: "standard",
      theme: "tide",
      background: "sky",
      includeImage: false,
      imageUrl: "",
      timerMode: "none",
      duration: 0,
      remaining: 0,
      runningSince: null,
      order: 21,
      createdAt: Date.now() - 7000
    },
    {
      id: createId(),
      title: "Joy list",
      description: "Small things to look forward to so the board supports energy, not only output.",
      category: "Personal",
      reward: "",
      metadata: { category: "Personal" },
      type: "brief",
      size: "standard",
      theme: "honey",
      background: "paper",
      includeImage: false,
      imageUrl: "",
      timerMode: "none",
      duration: 0,
      remaining: 0,
      runningSince: null,
      sections: [
        { label: "Today", text: "A proper meal, a walk, or a quiet reset after the main block." },
        { label: "This week", text: "One social moment, one hobby block, and one slower evening." },
        { label: "After hard work", text: "Pick a recovery action that makes tomorrow easier." }
      ],
      reviewed: false,
      order: 22,
      createdAt: Date.now() - 6000
    },
    {
      id: createId(),
      title: "Japan trip countdown",
      description: "Flights, packing and travel documents before departure.",
      category: "Personal",
      reward: "",
      metadata: { category: "Personal" },
      type: "event",
      size: "standard",
      theme: "tide",
      background: "sky",
      includeImage: false,
      imageUrl: "",
      timerMode: "date",
      targetAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      duration: 60 * 24 * 60 * 60,
      remaining: 60 * 24 * 60 * 60,
      runningSince: null,
      order: 23,
      createdAt: Date.now() - 5000
    }
  ],
  archivedCards: [],
  boards: []
};

let state = loadState();
let draggedCardId = null;
let editingCardId = null;
let editingPlannerTaskKey = "";
let plannerTaskEditDraft = null;
let selectedTimerMode = "none";
let attachedImageData = "";
let draftPreviewDismissed = false;
let draftTouched = false;
let selectedTemplateId = boardTemplates[0]?.id || "";
let selectedScheduleDays = [0, 2, 4];
let boardResizeFrame = null;
let pendingUndoAction = null;
let undoToastTimer = null;
let textEditGuardUntil = 0;
let deferredBoardRenderTimer = null;
let pendingBoardRenderOptions = null;
let applyingExternalStorageUpdate = false;
let localDevSourceSignature = "";
let localDevReloadPending = false;
let activeReportType = "fitness";
let activeMoveCardId = "";

const elements = {
  appShell: document.querySelector("#appShell"),
  workspace: document.querySelector(".workspace"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  railAddButton: document.querySelector("#railAddButton"),
  railTemplatesButton: document.querySelector("#railTemplatesButton"),
  railArchiveButton: document.querySelector("#railArchiveButton"),
  railReportsButton: document.querySelector("#railReportsButton"),
  railSettingsButton: document.querySelector("#railSettingsButton"),
  settingsModal: document.querySelector("#settingsModal"),
  settingsModalTitle: document.querySelector("#settingsModalTitle"),
  settingsModalCloseButton: document.querySelector("#settingsModalCloseButton"),
  settingsPanelMount: document.querySelector("#settingsPanelMount"),
  boardPanel: document.querySelector(".board-panel"),
  templatePanel: document.querySelector(".template-panel"),
  cloudPanel: document.querySelector(".cloud-panel"),
  boardName: document.querySelector("#boardName"),
  boardTitle: document.querySelector("#boardTitle"),
  todayLine: document.querySelector("#todayLine"),
  visibilityLabel: document.querySelector("#visibilityLabel"),
  visibilityControl: document.querySelector("#visibilityControl"),
  layoutControl: document.querySelector("#layoutControl"),
  savedState: document.querySelector("#savedState"),
  boardSelect: document.querySelector("#boardSelect"),
  boardQuickSelect: document.querySelector("#boardQuickSelect"),
  newBoardButton: document.querySelector("#newBoardButton"),
  deleteBoardButton: document.querySelector("#deleteBoardButton"),
  form: document.querySelector("#cardForm"),
  cardComposerPanel: document.querySelector("#cardComposerPanel"),
  composerCloseButton: document.querySelector("#composerCloseButton"),
  formTitle: document.querySelector("#formTitle"),
  submitCardButton: document.querySelector("#submitCardButton"),
  formSubmitLabel: document.querySelector("#formSubmitLabel"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  cardTitle: document.querySelector("#cardTitle"),
  cardDescription: document.querySelector("#cardDescription"),
  cardCategory: document.querySelector("#cardCategory"),
  categoryCustomField: document.querySelector("#categoryCustomField"),
  cardCategoryCustom: document.querySelector("#cardCategoryCustom"),
  cardPriority: document.querySelector("#cardPriority"),
  priorityButtons: document.querySelector("#priorityButtons"),
  dailyPlanDateField: document.querySelector("#dailyPlanDateField"),
  cardPlanDate: document.querySelector("#cardPlanDate"),
  cardType: document.querySelector("#cardType"),
  cardTypeButtons: document.querySelector("#cardTypeButtons"),
  cardTypeHelp: document.querySelector("#cardTypeHelp"),
  typeInsight: document.querySelector("#typeInsight"),
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
  timerDetailField: document.querySelector("#timerDetailField"),
  timerShowSeconds: document.querySelector("#timerShowSeconds"),
  checklistField: document.querySelector("#checklistField"),
  checklistLabel: document.querySelector("#checklistLabel"),
  checklistItems: document.querySelector("#checklistItems"),
  goalField: document.querySelector("#goalField"),
  goalTarget: document.querySelector("#goalTarget"),
  goalUnit: document.querySelector("#goalUnit"),
  plannerField: document.querySelector("#plannerField"),
  plannerDate: document.querySelector("#plannerDate"),
  plannerNote: document.querySelector("#plannerNote"),
  plannerViewField: document.querySelector("#plannerViewField"),
  plannerViewMode: document.querySelector("#plannerViewMode"),
  plannerViewModeButtons: document.querySelector("#plannerViewModeButtons"),
  plannerExcludeTodayField: document.querySelector("#plannerExcludeTodayField"),
  plannerViewExcludeToday: document.querySelector("#plannerViewExcludeToday"),
  plannerExcludeWeekField: document.querySelector("#plannerExcludeWeekField"),
  plannerViewExcludeWeek: document.querySelector("#plannerViewExcludeWeek"),
  plannerExcludeMonthField: document.querySelector("#plannerExcludeMonthField"),
  plannerViewExcludeMonth: document.querySelector("#plannerViewExcludeMonth"),
  plannerViewShowGuide: document.querySelector("#plannerViewShowGuide"),
  diaryField: document.querySelector("#diaryField"),
  diaryDate: document.querySelector("#diaryDate"),
  diaryFeeling: document.querySelector("#diaryFeeling"),
  diarySentence: document.querySelector("#diarySentence"),
  diaryThoughts: document.querySelector("#diaryThoughts"),
  quoteField: document.querySelector("#quoteField"),
  quoteAuthor: document.querySelector("#quoteAuthor"),
  videoField: document.querySelector("#videoField"),
  videoUrl: document.querySelector("#videoUrl"),
  fitnessField: document.querySelector("#fitnessField"),
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
  topControlsToggleButton: document.querySelector("#topControlsToggleButton"),
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
  exportDataButton: document.querySelector("#exportDataButton"),
  importDataButton: document.querySelector("#importDataButton"),
  importDataFile: document.querySelector("#importDataFile"),
  saveLayoutButton: document.querySelector("#saveLayoutButton"),
  restoreLayoutButton: document.querySelector("#restoreLayoutButton"),
  arrangeButton: document.querySelector("#arrangeButton"),
  openTemplatesButton: document.querySelector("#openTemplatesButton"),
  openIdeasButton: document.querySelector("#openIdeasButton"),
  cloudStatus: document.querySelector("#cloudStatus"),
  cloudCheckButton: document.querySelector("#cloudCheckButton"),
  cloudEmail: document.querySelector("#cloudEmail"),
  cloudPassword: document.querySelector("#cloudPassword"),
  cloudSignInButton: document.querySelector("#cloudSignInButton"),
  cloudSignUpButton: document.querySelector("#cloudSignUpButton"),
  cloudResendButton: document.querySelector("#cloudResendButton"),
  cloudPullButton: document.querySelector("#cloudPullButton"),
  cloudPushButton: document.querySelector("#cloudPushButton"),
  cloudSignOutButton: document.querySelector("#cloudSignOutButton"),
  cloudNote: document.querySelector("#cloudNote"),
  templateModal: document.querySelector("#templateModal"),
  templateModalCloseButton: document.querySelector("#templateModalCloseButton"),
  templateList: document.querySelector("#templateList"),
  templatePreviewMeta: document.querySelector("#templatePreviewMeta"),
  templatePreviewTitle: document.querySelector("#templatePreviewTitle"),
  templatePreviewDescription: document.querySelector("#templatePreviewDescription"),
  templatePreviewOverview: document.querySelector("#templatePreviewOverview"),
  templatePreviewGrid: document.querySelector("#templatePreviewGrid"),
  addTemplateButton: document.querySelector("#addTemplateButton"),
  ideasModal: document.querySelector("#ideasModal"),
  ideasModalCloseButton: document.querySelector("#ideasModalCloseButton"),
  ideasGrid: document.querySelector("#ideasGrid"),
  historyModal: document.querySelector("#historyModal"),
  historyModalCloseButton: document.querySelector("#historyModalCloseButton"),
  historyModalTitle: document.querySelector("#historyModalTitle"),
  historyModalSummary: document.querySelector("#historyModalSummary"),
  historyModalList: document.querySelector("#historyModalList"),
  recordsModal: document.querySelector("#recordsModal"),
  recordsModalCloseButton: document.querySelector("#recordsModalCloseButton"),
  recordsModalTitle: document.querySelector("#recordsModalTitle"),
  recordsModalSummary: document.querySelector("#recordsModalSummary"),
  recordsSearch: document.querySelector("#recordsSearch"),
  recordsDateFilter: document.querySelector("#recordsDateFilter"),
  recordsSort: document.querySelector("#recordsSort"),
  recordsTypeFilter: document.querySelector("#recordsTypeFilter"),
  recordsAreaFilter: document.querySelector("#recordsAreaFilter"),
  recordsReasonFilter: document.querySelector("#recordsReasonFilter"),
  recordsModalList: document.querySelector("#recordsModalList"),
  reportsModal: document.querySelector("#reportsModal"),
  reportsModalCloseButton: document.querySelector("#reportsModalCloseButton"),
  reportRange: document.querySelector("#reportRange"),
  reportPrintButton: document.querySelector("#reportPrintButton"),
  reportPreview: document.querySelector("#reportPreview"),
  reportPrintArea: document.querySelector("#reportPrintArea"),
  moveCardModal: document.querySelector("#moveCardModal"),
  moveCardModalCloseButton: document.querySelector("#moveCardModalCloseButton"),
  moveCardSummary: document.querySelector("#moveCardSummary"),
  moveBoardSelect: document.querySelector("#moveBoardSelect"),
  moveCardNote: document.querySelector("#moveCardNote"),
  moveCardCancelButton: document.querySelector("#moveCardCancelButton"),
  moveCardConfirmButton: document.querySelector("#moveCardConfirmButton"),
  undoToast: document.querySelector("#undoToast"),
  undoToastText: document.querySelector("#undoToastText"),
  undoToastButton: document.querySelector("#undoToastButton"),
  undoToastCloseButton: document.querySelector("#undoToastCloseButton")
};

mountSettingsPanels();
hydrateIcons();
populateThemeOptions();
populateBackgroundOptions();
setDefaultTimerDate();
renderTemplateList();
bindEvents();
resetFormState();
render();
handleCloudAuthRedirect();
clearStartupBoardSearch();
[100, 400, 900].forEach((delay) => window.setTimeout(clearStartupBoardSearch, delay));
startLocalDevAutoReload();

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    applyExternalStorageState(event.newValue);
  }
});

setInterval(() => {
  if (state.cards.some((card) => card.runningSince || shouldTickCountdownEverySecond(card))) {
    settleExpiredTimers();
    renderCardsOnly({ reason: "tick" });
  }
}, 1000);

setInterval(() => {
  renderBoardMeta();
  const todayKey = getTodayKey();
  if (todayKey !== lastDailyMaintenanceDate) {
    lastDailyMaintenanceDate = todayKey;
    renderCardsOnly({ reason: "daily-rollover" });
    return;
  }
  if (state.cards.some((card) => isAutomaticCountdown(card))) {
    settleExpiredTimers();
    renderCardsOnly({ reason: "auto" });
  }
}, 60000);

setInterval(() => {
  saveState({ quiet: true, touch: false });
}, AUTO_SAVE_INTERVAL_MS);

window.addEventListener("pagehide", () => {
  saveState({ quiet: true, skipCloud: true, touch: false });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveState({ quiet: true, skipCloud: true, touch: false });
    if (cloudSaveEnabled) {
      queueCloudSave({ immediate: true, silent: true });
    }
    return;
  }
  if (cloudSaveEnabled) {
    queueCloudSave({ immediate: true, silent: true });
  }
});

function mountSettingsPanels() {
  if (!elements.settingsPanelMount) return;
  [elements.boardPanel, elements.cloudPanel, elements.recentPanel]
    .filter(Boolean)
    .forEach((panel) => elements.settingsPanelMount.append(panel));
}

function setSettingsPanelMode() {
  elements.boardPanel.hidden = false;
  elements.cloudPanel.hidden = false;
  elements.recentPanel.hidden = false;
}

function bindEvents() {
  elements.sidebarToggle.addEventListener("click", () => {
    openSettingsModal();
  });

  elements.railAddButton.addEventListener("click", () => {
    openCardComposer({ reset: true });
  });

  elements.railTemplatesButton.addEventListener("click", () => {
    openTemplateModal();
  });

  elements.railArchiveButton.addEventListener("click", openRecordsModal);

  elements.railReportsButton.addEventListener("click", openReportsModal);

  elements.railSettingsButton.addEventListener("click", () => {
    openSettingsModal();
  });

  window.addEventListener("resize", queueBoardRender);

  elements.boardName.addEventListener("input", (event) => {
    state.board.name = event.target.value.trimStart() || "My Life OS";
    renderBoardMeta();
    saveState();
  });

  elements.boardSelect.addEventListener("change", (event) => {
    switchBoard(event.target.value);
  });

  elements.boardQuickSelect.addEventListener("change", (event) => {
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
  elements.plannerViewMode.addEventListener("change", renderConditionalFields);
  elements.priorityButtons.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-priority]");
    if (!button) return;
    elements.cardPriority.value = getSelectedPriority(button.dataset.priority);
    renderPriorityButtons();
    renderFormPreview();
  });
  elements.plannerViewModeButtons.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-planner-view]");
    if (!button) return;
    elements.plannerViewMode.value = normalizePlannerViewMode(button.dataset.plannerView);
    renderConditionalFields();
  });
  elements.cardTypeButtons.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-type]");
    if (!button) return;
    setFormType(button.dataset.type);
    renderConditionalFields();
  });
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
  elements.plannerNote.addEventListener("focus", () => {
    preparePlannerBulletTextarea(elements.plannerNote);
  });
  elements.plannerNote.addEventListener("keydown", handlePlannerBulletKeydown);
  elements.plannerNote.addEventListener("blur", () => {
    elements.plannerNote.value = cleanPlannerNote(elements.plannerNote.value);
    handleDraftInputChange();
  });
  elements.diaryThoughts.addEventListener("input", () => {
    autoGrowTextarea(elements.diaryThoughts);
    autosaveEditingDiaryFromForm();
  });
  elements.diarySentence.addEventListener("input", () => {
    autosaveEditingDiaryFromForm();
  });
  elements.diaryFeeling.addEventListener("change", () => {
    autosaveEditingDiaryFromForm();
  });
  elements.diaryDate.addEventListener("change", () => {
    autosaveEditingDiaryFromForm();
  });

  elements.imageFile.addEventListener("change", async () => {
    const file = elements.imageFile.files && elements.imageFile.files[0];
    attachedImageData = "";
    if (file) {
      try {
        attachedImageData = await fileToSafeImageDataUrl(file);
        elements.includeImage.checked = Boolean(attachedImageData);
      } catch (error) {
        window.alert(error.message || "This image could not be attached.");
        elements.imageFile.value = "";
        elements.includeImage.checked = false;
      }
    }
    renderConditionalFields();
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveCardFromForm();
  });

  elements.cancelEditButton.addEventListener("click", () => {
    closeCardComposer({ reset: true });
    renderCardsOnly();
  });

  elements.draftPreviewCloseButton.addEventListener("click", discardDraftCard);
  elements.composerCloseButton.addEventListener("click", () => {
    closeCardComposer({ reset: true });
  });

  document.querySelector(".view-pills").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    state.activeFilter = button.dataset.filter;
    state.focusFilter = "all";
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
    openCardComposer({ reset: true });
  });

  elements.topControlsToggleButton.addEventListener("click", toggleBoardControls);

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

  elements.exportDataButton.addEventListener("click", exportBoardBackup);

  elements.importDataButton.addEventListener("click", () => {
    elements.importDataFile.click();
  });

  elements.importDataFile.addEventListener("change", async () => {
    const file = elements.importDataFile.files && elements.importDataFile.files[0];
    await importBoardBackup(file);
  });

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
    closeSettingsModal();
    openTemplateModal();
  });

  elements.openIdeasButton.addEventListener("click", () => {
    closeSettingsModal();
    openIdeasModal();
  });

  elements.cloudSignInButton.addEventListener("click", () => signInToCloud());
  elements.cloudSignUpButton.addEventListener("click", () => signUpForCloud());
  elements.cloudResendButton.addEventListener("click", () => resendCloudConfirmation());
  elements.cloudCheckButton.addEventListener("click", () => checkCloudSetup());
  elements.cloudPullButton.addEventListener("click", () => pullCloudState({ confirmReplace: true }));
  elements.cloudPushButton.addEventListener("click", () => pushCloudState({ manual: true }));
  elements.cloudSignOutButton.addEventListener("click", signOutCloud);

  elements.templateModalCloseButton.addEventListener("click", closeTemplateModal);
  elements.settingsModalCloseButton.addEventListener("click", closeSettingsModal);
  elements.ideasModalCloseButton.addEventListener("click", closeIdeasModal);
  elements.historyModalCloseButton.addEventListener("click", closeHistoryModal);
  elements.recordsModalCloseButton.addEventListener("click", closeRecordsModal);
  elements.reportsModalCloseButton.addEventListener("click", closeReportsModal);
  elements.moveCardModalCloseButton.addEventListener("click", closeMoveCardModal);
  elements.moveCardCancelButton.addEventListener("click", closeMoveCardModal);
  elements.moveCardConfirmButton.addEventListener("click", confirmMoveCardToBoard);

  elements.settingsModal.addEventListener("click", (event) => {
    if (event.target === elements.settingsModal) {
      closeSettingsModal();
    }
  });

  elements.templateModal.addEventListener("click", (event) => {
    if (event.target === elements.templateModal) {
      closeTemplateModal();
    }
  });

  elements.ideasModal.addEventListener("click", (event) => {
    if (event.target === elements.ideasModal) {
      closeIdeasModal();
    }
  });

  elements.ideasModal.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-open-template]");
    if (!button) return;
    closeIdeasModal();
    openTemplateModal(button.dataset.openTemplate);
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

  elements.reportsModal.addEventListener("click", (event) => {
    if (event.target === elements.reportsModal) {
      closeReportsModal();
    }
  });

  elements.moveCardModal.addEventListener("click", (event) => {
    if (event.target === elements.moveCardModal) {
      closeMoveCardModal();
    }
  });

  elements.reportsModal.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-report-type]");
    if (!button) return;
    activeReportType = ["fitness", "food", "diary"].includes(button.dataset.reportType)
      ? button.dataset.reportType
      : "fitness";
    renderReportsModal();
  });

  elements.reportRange.addEventListener("change", renderReportsModal);
  elements.reportPrintButton.addEventListener("click", printCurrentReport);

  elements.recordsModalList.addEventListener("click", (event) => {
    const archiveButton = event.target.closest("button[data-archive-ready-card]");
    if (archiveButton) {
      archiveCard(archiveButton.dataset.archiveReadyCard);
      renderRecordsModal();
      return;
    }
    const deleteButton = event.target.closest("button[data-delete-archived-card]");
    if (deleteButton) {
      permanentlyDeleteArchivedCard(deleteButton.dataset.deleteArchivedCard);
      return;
    }
    const button = event.target.closest("button[data-restore-card]");
    if (!button) return;
    restoreArchivedCard(button.dataset.restoreCard);
  });

  elements.recordsSearch.addEventListener("input", (event) => {
    state.ui.archiveSearch = normalizeLabel(event.target.value);
    saveState();
    renderRecordsModal();
  });

  [
    [elements.recordsDateFilter, "archiveDate"],
    [elements.recordsSort, "archiveSort"],
    [elements.recordsTypeFilter, "archiveType"],
    [elements.recordsAreaFilter, "archiveArea"],
    [elements.recordsReasonFilter, "archiveReason"]
  ].forEach(([select, key]) => {
    select.addEventListener("change", () => {
      state.ui[key] = select.value;
      saveState();
      renderRecordsModal();
    });
  });

  elements.undoToastButton.addEventListener("click", runPendingUndo);
  elements.undoToastCloseButton.addEventListener("click", clearUndoToast);

  document.addEventListener("focusin", (event) => {
    if (isProtectedDraftElement(event.target)) {
      textEditGuardUntil = Date.now() + 1000;
    }
  });

  document.addEventListener("focusout", (event) => {
    if (!isProtectedDraftElement(event.target)) return;
    textEditGuardUntil = Date.now() + 1200;
    scheduleDeferredBoardRender(1250);
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".card-menu-shell")) return;
    closeCardActionMenus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCardActionMenus();
    }
    if (event.key === "Escape" && !elements.cardComposerPanel.hidden) {
      closeCardComposer({ reset: true });
      return;
    }
    if (event.key === "Escape" && !elements.settingsModal.hidden) {
      closeSettingsModal();
      return;
    }
    if (event.key === "Escape" && state.ui.categoriesOpen) {
      state.ui.categoriesOpen = false;
      saveState();
      renderCardsOnly();
    }
    if (event.key === "Escape" && !elements.templateModal.hidden) {
      closeTemplateModal();
    }
    if (event.key === "Escape" && !elements.ideasModal.hidden) {
      closeIdeasModal();
    }
    if (event.key === "Escape" && !elements.historyModal.hidden) {
      closeHistoryModal();
    }
    if (event.key === "Escape" && !elements.recordsModal.hidden) {
      closeRecordsModal();
    }
    if (event.key === "Escape" && !elements.reportsModal.hidden) {
      closeReportsModal();
    }
    if (event.key === "Escape" && !elements.moveCardModal.hidden) {
      closeMoveCardModal();
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
    try {
      attachedImageData = await fileToSafeImageDataUrl(elements.imageFile.files[0]);
    } catch (error) {
      window.alert(error.message || "This image could not be attached.");
      return;
    }
  }

  const card = buildCardFromForm({ preview: false });
  if (editingCardId) {
    updateExistingCard(card);
  } else {
    state.cards.push(card);
  }

  resetFormState();
  closeCardComposer();
  textEditGuardUntil = 0;
  render();
  renderCardsOnly({ force: true });
  saveState();
}

function buildCardFromForm({ preview }) {
  const type = getSelectedFormType();
  const timer = type === "routine" ? getDailyAutoTimer() : isUntimedContentType(type) ? getEmptyTimer() : getFormTimer();
  const includeImage = elements.includeImage.checked;
  const title = elements.cardTitle.value.trim() || getDefaultCardTitle(type);
  const card = {
    id: preview ? "preview-card" : createId(),
    title,
    description: elements.cardDescription.value.trim(),
    category: getSelectedCategory(),
    reward: "",
    priority: getSelectedPriority(elements.cardPriority.value),
    metadata: {
      category: getSelectedCategory()
    },
    type,
    size: "standard",
    theme: elements.cardTheme.value || "leaf",
    background: elements.cardBackground.value || "clean",
    includeImage,
    imageUrl: includeImage ? normalizeRemoteAssetUrl(elements.imageUrl.value) : "",
    imageData: includeImage ? attachedImageData : "",
    timerMode: timer.mode,
    targetAt: timer.targetAt,
    duration: timer.duration,
    remaining: timer.duration,
    showTimerSeconds: Boolean(elements.timerShowSeconds.checked),
    runningSince: null,
    lastResetDate: type === "routine" ? getTodayKey() : null,
    history: type === "routine" ? [] : undefined,
    order: preview ? 0 : nextOrder(),
    createdAt: Date.now()
  };

  if (type === "planner") {
    const dateKey = normalizeDateKey(elements.plannerDate.value) || getTodayKey();
    const note = cleanPlannerNote(elements.plannerNote.value);
    card.plannerGroup = getPlannerGroup(card);
    card.activePlannerDate = dateKey;
    card.plannerEntries = {
      [dateKey]: normalizePlannerEntry({
        note,
        updatedAt: note ? Date.now() : 0
      })
    };
  }

  if (type === "planlist") {
    card.plannerGroup = getPlannerGroup(card);
    card.plannerView = normalizePlannerViewMode(elements.plannerViewMode.value);
    card.plannerViewDate = getTodayKey();
    card.plannerViewOptions = normalizePlannerViewOptions({
      excludeToday: elements.plannerViewExcludeToday.checked,
      excludeWeek: elements.plannerViewExcludeWeek.checked,
      excludeMonth: elements.plannerViewExcludeMonth.checked,
      showGuide: elements.plannerViewShowGuide.checked
    });
    syncPlannerViewCardCopy(card);
  }

  if (type === "diary") {
    const dateKey = normalizeDateKey(elements.diaryDate.value) || getTodayKey();
    const entry = normalizeDiaryEntry({
      feeling: elements.diaryFeeling.value,
      sentence: elements.diarySentence.value,
      thoughts: elements.diaryThoughts.value,
      updatedAt: Date.now()
    });
    card.activeDate = dateKey;
    card.lastDiaryDate = getTodayKey();
    card.diaryEntries = {
      [dateKey]: entry
    };
  }

  if (type === "quote") {
    card.quoteAuthor = normalizeLabel(elements.quoteAuthor.value.trim());
  }

  if (type === "video") {
    card.videoUrl = normalizeVideoUrl(elements.videoUrl.value.trim());
  }

  if (type === "fitness") {
    card.category = "Health";
    card.metadata.category = "Health";
    card.activeFitnessDate = getTodayKey();
    card.fitnessEntries = {
      [getTodayKey()]: normalizeFitnessEntry()
    };
  }

  if (type === "food") {
    card.category = "Health";
    card.metadata.category = "Health";
    card.activeFoodDate = getTodayKey();
    card.activeFoodMealId = "";
    card.foodLibrary = normalizeFoodLibrary();
    card.foodTargets = {
      [getFoodMonthKey(getTodayKey())]: normalizeFoodTarget(DEFAULT_FOOD_TARGETS)
    };
    card.foodEntries = {
      [getTodayKey()]: normalizeFoodEntry()
    };
    normalizeFoodCard(card);
  }

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
  const mergedDiaryEntries =
    current.type === "diary" && nextCard.type === "diary"
      ? { ...(current.diaryEntries || {}), ...(nextCard.diaryEntries || {}) }
      : nextCard.diaryEntries;
  const mergedPlannerEntries =
    current.type === "planner" && nextCard.type === "planner"
      ? { ...(current.plannerEntries || {}), ...(nextCard.plannerEntries || {}) }
      : nextCard.plannerEntries;
  const mergedFoodEntries =
    current.type === "food" && nextCard.type === "food"
      ? { ...(current.foodEntries || {}), ...(nextCard.foodEntries || {}) }
      : nextCard.foodEntries;
  const mergedFoodTargets =
    current.type === "food" && nextCard.type === "food"
      ? { ...(current.foodTargets || {}), ...(nextCard.foodTargets || {}) }
      : nextCard.foodTargets;
  state.cards[index] = {
    ...nextCard,
    diaryEntries: mergedDiaryEntries,
    plannerEntries: mergedPlannerEntries,
    foodEntries: mergedFoodEntries,
    foodTargets: mergedFoodTargets,
    foodLibrary: current.type === "food" && nextCard.type === "food" ? current.foodLibrary : nextCard.foodLibrary,
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
  elements.formTitle.textContent = "Edit card";
  elements.formSubmitLabel.textContent = "Update card";
  elements.submitCardButton.querySelector("[data-icon]").dataset.icon = "pencil";
  elements.cancelEditButton.hidden = false;

  elements.cardTitle.value = getCardDisplayTitle(card);
  elements.cardDescription.value = getCardDisplayDescription(card);
  setCategoryField(card.category || "General");
  elements.cardPriority.value = getSelectedPriority(card.priority);
  elements.cardPlanDate.value = getCardPlanDate(card);
  setFormType(card.type || "daily");
  selectedScheduleDays = normalizeScheduleDays(card.scheduleDays || selectedScheduleDays);
  elements.checklistItems.value = getEditableListValue(card);
  const plannerDate = getActivePlannerDate(card);
  const plannerEntry = card.type === "planner" ? getPlannerEntry(card, plannerDate) : normalizePlannerEntry();
  elements.plannerDate.value = plannerDate;
  elements.plannerNote.value = formatPlannerNoteForEditing(plannerEntry.note);
  elements.plannerViewMode.value = normalizePlannerViewMode(card.plannerView);
  const plannerViewOptions = normalizePlannerViewOptions(card.plannerViewOptions);
  elements.plannerViewExcludeToday.checked = plannerViewOptions.excludeToday;
  elements.plannerViewExcludeWeek.checked = plannerViewOptions.excludeWeek;
  elements.plannerViewExcludeMonth.checked = plannerViewOptions.excludeMonth;
  elements.plannerViewShowGuide.checked = plannerViewOptions.showGuide;
  const diaryDate = getActiveDiaryDate(card);
  const diaryEntry = card.type === "diary" ? getDiaryEntry(card, diaryDate) : normalizeDiaryEntry();
  elements.diaryDate.value = diaryDate;
  elements.diaryFeeling.value = diaryEntry.feeling || "Calm";
  elements.diarySentence.value = diaryEntry.sentence || "";
  elements.diaryThoughts.value = diaryEntry.thoughts || "";
  elements.quoteAuthor.value = card.quoteAuthor || "";
  elements.videoUrl.value = card.videoUrl || "";
  elements.goalTarget.value = String(card.targetValue || 150);
  elements.goalUnit.value = card.unit || "min";
  elements.cardSize.value = "standard";
  elements.cardTheme.value = card.theme || "leaf";
  elements.cardBackground.value = card.background || "clean";
  elements.includeImage.checked = Boolean(card.includeImage);
  elements.imageUrl.value = card.imageUrl || "";
  elements.imageFile.value = "";
  attachedImageData = card.imageData || "";
  elements.timerShowSeconds.checked = Boolean(card.showTimerSeconds);
  selectedTimerMode = ["none", "date", "days", "hours"].includes(card.timerMode) ? card.timerMode : "none";
  populateTimerFields(card);
  renderScheduleDays();
  renderThemeSwatches();
  renderBackgroundSwatches();
  renderConditionalFields();
  hydrateIcons(elements.submitCardButton);
  openCardComposer();
}

function resetFormState() {
  editingCardId = null;
  draftPreviewDismissed = false;
  draftTouched = false;
  elements.form.reset();
  elements.formTitle.textContent = "Add card";
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
  elements.plannerDate.value = getTodayKey();
  elements.plannerNote.value = "";
  elements.plannerViewMode.value = "today";
  elements.plannerViewExcludeToday.checked = false;
  elements.plannerViewExcludeWeek.checked = false;
  elements.plannerViewExcludeMonth.checked = false;
  elements.plannerViewShowGuide.checked = false;
  elements.diaryDate.value = getTodayKey();
  elements.diaryFeeling.value = "Calm";
  elements.diarySentence.value = "";
  elements.diaryThoughts.value = "";
  elements.quoteAuthor.value = "";
  elements.videoUrl.value = "";
  selectedScheduleDays = [0, 2, 4];
  selectedTimerMode = "none";
  attachedImageData = "";
  elements.imageFile.value = "";
  elements.timerHours.value = "0";
  elements.timerMinutes.value = "25";
  elements.timerDays.value = "1";
  elements.timerShowSeconds.checked = false;
  elements.goalTarget.value = "150";
  elements.goalUnit.value = "min";
  setDefaultTimerDate();
  renderScheduleDays();
  renderThemeSwatches();
  renderBackgroundSwatches();
  renderConditionalFields();
  hydrateIcons(elements.submitCardButton);
}

function openCardComposer(options = {}) {
  closeOtherOverlays("composer");
  if (options.reset) {
    resetFormState();
  }
  elements.cardComposerPanel.hidden = false;
  elements.appShell.classList.add("composer-open");
  document.body.classList.add("composer-open");
  draftPreviewDismissed = false;
  renderConditionalFields();
  hydrateIcons(elements.cardComposerPanel);
  syncRailActiveState();
  if (options.focus !== false) {
    requestAnimationFrame(() => elements.cardTitle.focus());
  }
}

function closeCardComposer(options = {}) {
  elements.cardComposerPanel.hidden = true;
  elements.appShell.classList.remove("composer-open");
  document.body.classList.remove("composer-open");
  if (options.dismissPreview) {
    draftPreviewDismissed = true;
    draftTouched = false;
  }
  if (options.reset) {
    resetFormState();
  }
  renderFormPreview();
  syncRailActiveState();
}

function closeOtherOverlays(activeSurface = "") {
  if (activeSurface !== "composer" && !elements.cardComposerPanel.hidden) {
    closeCardComposer({ dismissPreview: true });
  }
  if (activeSurface !== "settings") elements.settingsModal.hidden = true;
  if (activeSurface !== "template") elements.templateModal.hidden = true;
  if (activeSurface !== "ideas") elements.ideasModal.hidden = true;
  if (activeSurface !== "history") elements.historyModal.hidden = true;
  if (activeSurface !== "records") elements.recordsModal.hidden = true;
  if (activeSurface !== "reports") elements.reportsModal.hidden = true;
  if (activeSurface !== "move") elements.moveCardModal.hidden = true;
  syncModalOpenState();
}

function closeCardActionMenus() {
  document.querySelectorAll(".card-menu-shell.is-open").forEach((shell) => {
    shell.classList.remove("is-open");
    const menu = shell.querySelector(".card-menu");
    const toggle = shell.querySelector(".card-menu-toggle");
    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  });
}

function getMoveDestinationBoards() {
  return Array.isArray(state.boards)
    ? state.boards.filter((board) => board.id !== state.activeBoardId)
    : [];
}

function openMoveCardModal(cardId) {
  const card = state.cards.find((item) => item.id === cardId);
  if (!card) return;
  syncActiveBoard();
  activeMoveCardId = cardId;
  closeOtherOverlays("move");
  renderMoveCardModal(card);
  elements.moveCardModal.hidden = false;
  syncModalOpenState();
}

function closeMoveCardModal() {
  activeMoveCardId = "";
  elements.moveCardModal.hidden = true;
  syncModalOpenState();
}

function renderMoveCardModal(card) {
  const destinations = getMoveDestinationBoards();
  elements.moveCardSummary.textContent = `"${card.title || "Untitled card"}" will move out of ${state.board.name}.`;
  elements.moveBoardSelect.innerHTML = "";
  destinations.forEach((board) => {
    const option = document.createElement("option");
    option.value = board.id;
    option.textContent = board.name || "Untitled board";
    elements.moveBoardSelect.append(option);
  });
  const linkedWarning =
    card.type === "planner"
      ? "Planner-view cards on the old board will no longer read this planner card after it moves."
      : card.type === "planlist"
        ? "Planner-view cards read Planner data from the destination board after moving."
        : "The card keeps its checklist, notes, diary pages, fitness logs, food logs and history.";
  elements.moveCardNote.textContent = destinations.length ? linkedWarning : "Create another board before moving this card.";
  elements.moveCardConfirmButton.disabled = destinations.length === 0;
  hydrateIcons(elements.moveCardModal);
}

function confirmMoveCardToBoard() {
  const card = state.cards.find((item) => item.id === activeMoveCardId);
  const targetBoardId = elements.moveBoardSelect.value;
  if (!card || !targetBoardId || targetBoardId === state.activeBoardId) return;
  if (["planner", "planlist"].includes(card.type)) {
    const confirmed = window.confirm("This card is connected to planner data on its board. Move it anyway?");
    if (!confirmed) return;
  }
  moveActiveCardToBoard(card.id, targetBoardId);
}

function render() {
  renderShell();
  renderBoardMeta();
  renderCloudStatus();
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
  elements.appShell.classList.add("rail-shell");
  syncRailActiveState();
}

function toggleBoardControls() {
  state.ui.controlsOpen = state.ui.controlsOpen === false;
  renderBoardMeta();
  saveState();
}

function renderBoardMeta() {
  renderBoardSwitcher();
  const controlsOpen = state.ui.controlsOpen !== false;
  elements.workspace.classList.toggle("controls-collapsed", !controlsOpen);
  const controlsLabel = controlsOpen ? "Hide controls" : "Show controls";
  elements.topControlsToggleButton.title = controlsLabel;
  elements.topControlsToggleButton.setAttribute("aria-label", controlsLabel);
  elements.topControlsToggleButton.setAttribute("aria-pressed", String(!controlsOpen));
  elements.topControlsToggleButton.classList.toggle("is-active", !controlsOpen);
  elements.boardName.value = state.board.name;
  elements.boardTitle.textContent = state.board.name;
  elements.todayLine.textContent = formatTodayLine();
  elements.restoreLayoutButton.disabled = !Array.isArray(state.board.savedLayout) || !state.board.savedLayout.length;
  elements.boardSearch.value = state.searchQuery || "";
  elements.clearSearchButton.hidden = !normalizeLabel(state.searchQuery || "");
  const recordCount = getArchivedCards().length;
  const readyArchiveCount = getReadyToArchiveCards().length;
  elements.openRecordsButton.textContent = readyArchiveCount
    ? `Archive ${readyArchiveCount} ready`
    : recordCount
      ? `Archive ${recordCount}`
      : "Archive";

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

function clearStartupBoardSearch() {
  const hadSearch = Boolean(normalizeLabel(state.searchQuery || elements.boardSearch.value || ""));
  state.searchQuery = "";
  elements.boardSearch.value = "";
  elements.clearSearchButton.hidden = true;
  if (hadSearch) {
    renderCardsOnly({ preserveScroll: false });
  }
}

function renderBoardSwitcher() {
  syncActiveBoard();
  const boardOptions = state.boards
    .map((board) => `<option value="${escapeAttribute(board.id)}">${escapeHtml(board.name)}</option>`)
    .join("");
  elements.boardSelect.innerHTML = boardOptions;
  elements.boardQuickSelect.innerHTML = boardOptions;
  elements.boardSelect.value = state.activeBoardId;
  elements.boardQuickSelect.value = state.activeBoardId;
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
  elements.categoryToggle.setAttribute("aria-label", selectedCategories.length ? `Area filter: ${selectedCategories.join(", ")}` : "Area filter");
  elements.categoryToggle.title = selectedCategories.length ? `Showing ${selectedCategories.join(", ")}` : "Filter areas";
  elements.categoryToggleLabel.textContent = selectionLabel;
  elements.categoryPills.hidden = !canFilterCategories || !state.ui.categoriesOpen;

  if (!canFilterCategories) {
    elements.categoryPills.innerHTML = "";
    return;
  }

  elements.categoryPills.innerHTML = `
    <div class="category-panel-head">
      <div>
        <strong>Filter areas</strong>
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
  if (!categories.length) return "Areas";
  if (categories.length === 1) return categories[0];
  if (categories.length === 2) return categories.join(" + ");
  return "Multiple areas";
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
  elements.quickPlanField.hidden = !["daily", "planner"].includes(elements.quickTodoType.value);
  const isContent = isUntimedContentType(elements.quickTodoType.value);
  elements.quickTodoTiming.closest(".quick-field").hidden = isContent;
  if (elements.quickTodoType.value === "event" && elements.quickTodoTiming.value === "none") {
    elements.quickTodoTiming.value = "week";
  }
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
  elements.quickTodoType.value = "daily";
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
  const timer = isUntimedContentType(type) ? getEmptyTimer() : getQuickCaptureTimer(elements.quickTodoTiming.value);
  const title = normalizeLabel(elements.quickTodoTitle.value.trim()) || getQuickCaptureFallbackTitle(type);
  const priority = getSelectedPriority(elements.quickTodoPriority.value);
  const notes = items.join("\n");
  const card = makeCard({
    title,
    description: getQuickCaptureDescription(type, notes),
    category,
    reward: "",
    priority,
    plannedDate: type === "daily" ? getQuickCapturePlanDate(elements.quickTodoPlan.value) : undefined,
    activePlannerDate: type === "planner" ? getQuickCapturePlanDate(elements.quickTodoPlan.value) : undefined,
    type,
    theme: getThemeForCategory(category),
    background: "clean",
    timerMode: timer.mode,
    targetAt: timer.targetAt,
    duration: timer.duration,
    items: ["daily", "checklist"].includes(type) ? (items.length ? items : getQuickCaptureFallbackItems(type)) : undefined,
    sections: type === "brief" ? (items.length ? items.map((item, index) => [`Note ${index + 1}`, item]) : [["Focus", "Clarify the decision, rule or idea."]]) : undefined,
    diaryEntries:
      type === "diary"
        ? {
            [getTodayKey()]: normalizeDiaryEntry({
              feeling: "Calm",
              sentence: items[0] || "",
              thoughts: items.slice(1).join("\n"),
              updatedAt: Date.now()
            })
          }
        : undefined,
    plannerEntries:
      type === "planner"
        ? {
            [getQuickCapturePlanDate(elements.quickTodoPlan.value)]: normalizePlannerEntry({
              note: notes || title,
              updatedAt: Date.now()
            })
          }
        : undefined,
    activeDate: type === "diary" ? getTodayKey() : undefined,
    quoteAuthor: type === "quote" ? "Personal reminder" : undefined,
    videoUrl: type === "video" ? normalizeVideoUrl(items[0] || "") : undefined
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
  if (value === "day-after") return getTodayKey(addDays(new Date(), 2));
  if (value === "next-week") return getTodayKey(addDays(new Date(), 7));
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
    const duration = 7 * 24 * 60 * 60;
    return { mode: "days", targetAt: new Date(Date.now() + duration * 1000).toISOString(), duration };
  }
  return { mode: "none", targetAt: null, duration: 0 };
}

function getQuickCaptureFallbackTitle(type) {
  if (type === "planner") return "Future planner";
  if (type === "planlist") return "Planner-view";
  if (type === "diary") return "Daily diary";
  if (type === "quote") return "Motivation";
  if (type === "video") return "Video card";
  if (type === "fitness") return "Fitness workout log";
  if (type === "food") return "Daily food tracker";
  if (type === "single") return "New task";
  if (type === "event") return "New event";
  if (type === "checklist") return "New project";
  if (type === "brief") return "New idea";
  return "New to-do list";
}

function getDefaultCardTitle(type) {
  if (type === "planner") return "Future planner";
  if (type === "planlist") return "Planner-view";
  if (type === "diary") return "Daily diary";
  if (type === "quote") return "Motivation";
  if (type === "video") return "Video card";
  if (type === "food") return "Daily food tracker";
  if (type === "brief") return "Strategy brief";
  if (type === "event") return "Event countdown";
  if (type === "checklist") return "Project checklist";
  if (type === "minutes") return "Goal";
  if (type === "scheduled") return "Scheduled habit";
  if (type === "routine") return "Daily routine";
  if (SCORECARD_TYPES.includes(type)) return "Scorecard";
  return "New task";
}

function getQuickCaptureDescription(type, notes) {
  if (type === "planner") return "A dated planner note saved inside the planner card.";
  if (type === "diary") return "A quick dated diary page.";
  if (type === "quote") return normalizeLabel(notes) || "A useful reminder for the day.";
  if (type === "video") return "Saved video to watch or reference from the board.";
  if (type === "food") return "Track meals, macros, fiber and monthly nutrition targets.";
  return "Quick capture added from the board.";
}

function getQuickCaptureFallbackItems(type) {
  if (type === "checklist") return ["Define outcome", "Choose next step", "Review progress"];
  return ["Choose top priority", "Finish the next action", "Review before sleep"];
}

function renderCardsOnly(options = {}) {
  if (shouldDeferBoardRender(options)) {
    queueDeferredBoardRender(options);
    return;
  }
  const scrollSnapshot = options.preserveScroll === false ? null : captureScrollPosition();
  settleExpiredTimers();
  resetDailyRepeatingCards();
  resetDiaryCardsToToday();
  repairPlannerRenamedCompletedCarryovers();
  carryPlannerIncompleteTasksToToday();
  const orderedCards = getOrderedCards();
  const filteredByStatus = orderedCards.filter((card) => matchesFilter(card));
  const filteredBySearch = filteredByStatus.filter((card) => matchesSearch(card));
  const filteredByFocus = filteredBySearch.filter((card) => matchesFocus(card));
  if (!draggedCardId) {
    elements.boardGrid.classList.remove("is-dragging-card");
  }
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

  renderStats(orderedCards);
  renderRecentCards();
  hydrateIcons(elements.boardGrid);
  restoreScrollPosition(scrollSnapshot);
}

function isDraftTextElement(element) {
  if (!element || element.disabled || element.readOnly) return false;
  if (element.tagName === "TEXTAREA") return true;
  if (element.tagName !== "INPUT") return false;
  return ["text", "search", "url", "email", "password", "number", "date", "datetime-local", "time"].includes(element.type);
}

function isProtectedDraftElement(element) {
  if (!isDraftTextElement(element)) return false;
  return Boolean(
    elements.boardGrid?.contains(element) ||
      elements.cardComposerPanel?.contains(element) ||
      elements.quickTodoPanel?.contains(element)
  );
}

function hasUnsubmittedDraftText() {
  return state.cards.some((card) => normalizeLabel(card.dailyDraftText || card.plannerDraftText || ""));
}

function isBackgroundBoardRender(options = {}) {
  return options.reason === "tick" || options.reason === "auto";
}

function shouldDeferBoardRender(options = {}) {
  if (options.force) return false;
  if (draggedCardId) return false;
  const active = document.activeElement;
  if (isProtectedDraftElement(active)) return true;
  if (hasUnsubmittedDraftText() && isBackgroundBoardRender(options)) return true;
  return Date.now() < textEditGuardUntil;
}

function queueDeferredBoardRender(options = {}) {
  const preserveScroll = pendingBoardRenderOptions?.preserveScroll === false || options.preserveScroll === false ? false : undefined;
  pendingBoardRenderOptions = { ...(pendingBoardRenderOptions || {}), ...options };
  if (preserveScroll === false) pendingBoardRenderOptions.preserveScroll = false;
  scheduleDeferredBoardRender();
}

function scheduleDeferredBoardRender(delay = 500) {
  window.clearTimeout(deferredBoardRenderTimer);
  deferredBoardRenderTimer = window.setTimeout(() => {
    if (shouldDeferBoardRender({ force: false })) {
      scheduleDeferredBoardRender(500);
      return;
    }
    if (!pendingBoardRenderOptions) return;
    const nextOptions = { ...(pendingBoardRenderOptions || {}), force: true };
    pendingBoardRenderOptions = null;
    renderCardsOnly(nextOptions);
  }, delay);
}

function captureScrollPosition() {
  return {
    windowY: window.scrollY || 0,
    workspaceTop: elements.workspace ? elements.workspace.scrollTop : 0
  };
}

function restoreScrollPosition(snapshot) {
  if (!snapshot) return;
  requestAnimationFrame(() => {
    if (elements.workspace) {
      elements.workspace.scrollTop = snapshot.workspaceTop;
    }
    if (window.scrollY !== snapshot.windowY) {
      window.scrollTo({ top: snapshot.windowY, left: 0, behavior: "auto" });
    }
  });
}

function renderBoardColumns(cards) {
  const columnCount = getBoardColumnCount();
  elements.boardGrid.style.setProperty("--board-columns", columnCount);
  elements.boardGrid.classList.toggle("columns-1", columnCount === 1);
  elements.boardGrid.classList.toggle("columns-2", columnCount === 2);
  elements.boardGrid.classList.toggle("columns-3", columnCount === 3);
  const featuredCards = cards.filter(isFeaturedBoardCard);
  const columnCards = cards.filter((card) => !isFeaturedBoardCard(card));
  const featuredSideCards = featuredCards.length === 1 && columnCount >= 3 ? columnCards.splice(0, 1) : [];

  if (featuredCards.length) {
    const featuredGrid = document.createElement("div");
    featuredGrid.className = `board-featured-grid columns-${columnCount}`;
    featuredGrid.style.setProperty("--board-columns", columnCount);
    featuredCards.forEach((card) => featuredGrid.append(renderCard(card, { columnIndex: 0, featured: true })));
    featuredSideCards.forEach((card) => featuredGrid.append(renderCard(card, { columnIndex: 2, featuredSide: true })));
    elements.boardGrid.append(featuredGrid);
  }

  if (!columnCards.length) return;

  const columnsShell = document.createElement("div");
  columnsShell.className = "board-columns-grid";
  columnsShell.style.setProperty("--board-columns", columnCount);
  columnsShell.addEventListener("dragover", (event) => {
    if (!draggedCardId) return;
    event.preventDefault();
  });
  columnsShell.addEventListener("drop", (event) => {
    if (!draggedCardId) return;
    event.preventDefault();
    const targetColumn = getPointerColumnIndex(event, columnsShell, columnCount);
    moveCardToColumnEnd(draggedCardId, targetColumn);
  });
  const columns = buildBoardColumns(columnCards, columnCount);
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
      event.stopPropagation();
      column.classList.remove("is-drop-ready");
      if (!draggedCardId) return;
      moveCardToColumnEnd(draggedCardId, columnIndex);
    });

    columnCards.forEach((card) => column.append(renderCard(card, { columnIndex })));
    const dropTarget = document.createElement("div");
    dropTarget.className = "column-drop-target";
    dropTarget.textContent = columnCards.length ? "Drop to bottom" : "Drop here";
    column.append(dropTarget);
    columnsShell.append(column);
  });
  elements.boardGrid.append(columnsShell);
}

function isFeaturedBoardCard(card) {
  return false;
}

function getBoardColumnCount() {
  const width = elements.boardGrid.clientWidth || elements.boardGrid.getBoundingClientRect().width || window.innerWidth;
  if (width < 680) return 1;
  if (width < 860) return 2;
  return 3;
}

function getRenderedBoardColumnCount() {
  const renderedColumns = elements.boardGrid.querySelectorAll(".board-columns-grid > .board-column").length;
  return renderedColumns || getBoardColumnCount();
}

function getPointerColumnIndex(event, container, columnCount) {
  const count = Math.max(1, Number(columnCount) || 1);
  const rect = container.getBoundingClientRect();
  if (!rect.width) return 0;
  const progress = (event.clientX - rect.left) / rect.width;
  return clampInt(Math.floor(progress * count), 0, count - 1, 0);
}

function buildBoardColumns(cards, columnCount) {
  const count = Math.max(1, Math.min(3, Number(columnCount) || 1));
  const columns = Array.from({ length: count }, () => []);
  const hasManualColumns = state.board.layout === "custom" && cards.some((card) => Number.isFinite(Number(card.layoutColumn)));
  cards.forEach((card) => {
    const columnIndex =
      hasManualColumns && Number.isFinite(Number(card.layoutColumn))
        ? clampInt(card.layoutColumn, 0, count - 1, 0)
        : getShortestColumnIndex(columns);
    columns[columnIndex].push(card);
  });
  if (hasManualColumns) {
    columns.forEach((column) => column.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)));
  }
  return columns;
}

function getShortestColumnIndex(columns) {
  return columns.reduce((bestIndex, column, index) => {
    const bestHeight = columns[bestIndex].reduce((sum, card) => sum + estimateCardHeight(card), 0);
    const height = column.reduce((sum, card) => sum + estimateCardHeight(card), 0);
    return height < bestHeight ? index : bestIndex;
  }, 0);
}

function estimateCardHeight(card) {
  let height = 156;
  if (hasCountdown(card)) height += 28;
  if (card.description) height += 28;
  if (card.includeImage) height += 92;

  if (card.type === "brief") height += Math.min(card.sections?.length || 3, 4) * 52;
  if (card.type === "daily" || card.type === "routine") height += Math.min(card.items?.length || 3, 6) * 38;
  if (card.type === "routine") height += 34;
  if (card.type === "checklist") height += Math.min(card.items?.length || 3, 6) * 28;
  if (card.type === "workout") height += Math.min(card.exercises?.length || 4, 6) * 44;
  if (card.type === "lab") height += Math.min(card.steps?.length || 4, 6) * 46;
  if (card.type === "minutes") height += 82;
  if (card.type === "weekly" || card.type === "scheduled") height += 48;
  if (card.type === "monthly") height += 142;
  if (card.type === "annual") height += 84;
  if (card.type === "planner") height += 168;
  if (card.type === "diary") height += 240;
  if (card.type === "quote") height += 96;
  if (card.type === "video") height += 190;
  if (card.type === "fitness") height += 360;
  if (card.type === "food") height += 440;
  if (card.type === "single") height += 48;
  return height;
}

function getLayoutColumn(card) {
  return Number.isFinite(Number(card.layoutColumn)) ? Number(card.layoutColumn) : Number.MAX_SAFE_INTEGER;
}

function getEmptyStateMarkup(statusCount) {
  if (state.focusFilter && state.focusFilter !== "all") {
    if (state.focusFilter === "done") {
      return "<div><h3>No cards ready to archive</h3><p>Completed cards will appear here until you archive them.</p></div>";
    }
    if (state.focusFilter === "overdue") {
      return "<div><h3>No overdue cards</h3><p>Nothing past due right now.</p></div>";
    }
    return "<div><h3>No focus cards</h3><p>Clear the focus filter or choose another focus tile.</p></div>";
  }
  if (normalizeLabel(state.searchQuery || "")) {
    return "<div><h3>No matching cards</h3><p>Try a title, area, card type, or date.</p></div>";
  }
  if (statusCount > 0 && getActiveCategories().length) {
    return "<div><h3>No cards in this area</h3><p>Clear the area filter or choose another area.</p></div>";
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
    const isActive = state.focusFilter === button.dataset.focus;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.title = isActive ? "Click again to show all cards" : `Show ${button.querySelector("strong")?.textContent || "focus"} cards`;
  });
}

function getPlanningDateKey(card) {
  if (!card) return "";
  if (card.type === "daily") return getCardPlanDate(card);
  if (card.type === "food") return getActiveFoodDate(card);
  if (card.type === "event" && card.targetAt) return getDateKeyFromIso(card.targetAt);
  if (card.timerMode === "date" && card.targetAt) return getDateKeyFromIso(card.targetAt);
  return "";
}

function getDateKeyFromIso(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return getTodayKey(date);
}

function getPlanningSortValue(card) {
  const dateKey = getPlanningDateKey(card);
  return dateKey ? dateKeyToLocalDate(dateKey).getTime() : Number.MAX_SAFE_INTEGER;
}

function getDayDelta(dateKey) {
  const today = dateKeyToLocalDate(getTodayKey());
  const date = dateKeyToLocalDate(dateKey);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function getTodayFocusCounts(cards) {
  return cards.reduce(
    (counts, card) => {
      if (isTodayFocusCard(card)) counts.today += 1;
      if (isMustDoCard(card)) counts.must += 1;
      if (isOverdueCard(card)) counts.overdue += 1;
      if (isReadyToArchiveCard(card)) counts.done += 1;
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
  if (state.focusFilter === "done") return isReadyToArchiveCard(card);
  return true;
}

function isTodayFocusCard(card) {
  if (card.type === "daily") return getCardPlanDate(card) === getTodayKey();
  if (card.type === "planner" || card.type === "diary") return true;
  if (card.type === "fitness" || card.type === "food") return true;
  if (card.type === "planlist") return normalizePlannerViewMode(card.plannerView) === "today";
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

function getCardDisplayTitle(card) {
  if (card?.type === "planlist") return getPlannerViewCardTitle(card.plannerView);
  return card?.title || getDefaultCardTitle(card?.type || "single");
}

function getCardDisplayDescription(card) {
  if (card?.type === "planlist") {
    const options = normalizePlannerViewOptions(card.plannerViewOptions);
    return options.showGuide ? getPlannerViewCardDescription(card.plannerView, options) : "";
  }
  if (card?.type === "quote") return "";
  return card?.description || "";
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
  node.classList.toggle("is-featured", Boolean(options.featured));
  node.classList.add("size-standard", `theme-${card.theme}`, `type-${card.type}`, `background-${card.background || "clean"}`);
  node.classList.toggle("has-image", card.includeImage);
  node.classList.toggle("no-timer", !hasTimer);
  node.classList.toggle("is-content-card", isProgresslessCard(card));
  node.classList.toggle("is-running", Boolean(card.runningSince));
  node.classList.toggle("is-expired", hasTimer && remaining <= 0);
  const priority = getSelectedPriority(card.priority);
  const priorityMeta = PRIORITY_META[priority];
  node.classList.toggle("priority-high", priority === "high");
  node.classList.toggle("priority-low", priority === "low");
  node.style.setProperty("--card-bg", theme.bg);
  node.style.setProperty("--card-ink", theme.ink);
  node.style.setProperty("--card-muted", theme.muted);
  node.style.setProperty("--card-accent", theme.accent);
  node.style.setProperty("--card-soft", theme.soft);
  node.style.setProperty("--card-fill", getCardFill(card, theme));
  node.style.setProperty("--card-shadow-color", hexToRgba(theme.accent, 0.24));
  node.style.setProperty("--image-source", getImageSource(card, theme));
  node.style.setProperty("--priority-color", priorityMeta.color);
  node.style.setProperty("--priority-soft", priorityMeta.soft);

  const typeMeta = TYPE_META[card.type] || TYPE_META.single;
  node.querySelector(".card-type").innerHTML = `${ICONS[typeMeta.icon]}<span>${typeMeta.label}</span>`;
  const category = node.querySelector(".card-category");
  category.textContent = card.category || "General";
  node.querySelector(".card-percent").textContent = isProgresslessCard(card) ? progress.label : `${progress.percent}%`;
  const dateChip = node.querySelector(".card-date-chip");
  const plannedDateLabel = getPlannedDateChip(card);
  if (plannedDateLabel) {
    dateChip.hidden = false;
    dateChip.textContent = plannedDateLabel;
    dateChip.title = getPlannedDateTitle(card);
  }
  node.querySelector("h3").textContent = getCardDisplayTitle(card);
  node.querySelector(".card-description").textContent = getCardDisplayDescription(card);
  if (card.type === "quote") {
    node.querySelector("h3").hidden = true;
    node.querySelector(".card-description").hidden = true;
  }
  const timerDisplay = node.querySelector(".timer-display");
  const isAutoTimer = isAutomaticCountdown(card);
  timerDisplay.classList.toggle("is-auto", isAutoTimer);
  timerDisplay.querySelector("strong").textContent = formatRemaining(card, remaining);
  node.querySelector(".timer-caption").textContent = getTimerCaption(card, remaining);
  node.querySelector(".progress-track span").style.width = `${progress.percent}%`;
  node.querySelector(".card-progress p").textContent = `${progress.percent}% · ${progress.label}`;

  const toggleButton = node.querySelector(".timer-toggle");
  toggleButton.hidden = !hasTimer || isAutoTimer;
  toggleButton.title = isAutoTimer ? "Automatic countdown" : card.runningSince ? "Pause timer" : "Start timer";
  toggleButton.setAttribute("aria-label", toggleButton.title);
  toggleButton.innerHTML = `${ICONS[card.runningSince ? "pause" : "play"]}<span>${card.runningSince ? "Pause" : "Start"}</span>`;
  toggleButton.disabled = !interactive || !hasTimer;
  toggleButton.classList.toggle("is-auto", isAutoTimer);
  if (interactive && hasTimer && !isAutoTimer) {
    toggleButton.addEventListener("click", () => toggleTimer(card.id));
  }

  const cardActions = node.querySelector(".card-actions");
  const resetButton = node.querySelector(".timer-reset");
  const menuShell = node.querySelector(".card-menu-shell");
  const menuToggle = node.querySelector(".card-menu-toggle");
  const cardMenu = node.querySelector(".card-menu");
  const moveButton = node.querySelector("[data-card-action='move']");
  resetButton.hidden = !hasTimer || (isAutoTimer && card.type !== "routine");
  resetButton.title = card.type === "routine" ? "Reset today" : "Reset timer";
  resetButton.setAttribute("aria-label", resetButton.title);
  resetButton.disabled = !interactive || !hasTimer;
  menuToggle.disabled = !interactive;
  moveButton.disabled = getMoveDestinationBoards().length === 0;
  moveButton.title = moveButton.disabled ? "Create another board first" : "Move to another board";
  if (interactive) {
    if (hasTimer) {
      resetButton.addEventListener("click", () => resetTimer(card.id));
    }
    menuToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = !cardMenu.hidden;
      closeCardActionMenus();
      cardMenu.hidden = isOpen;
      menuShell.classList.toggle("is-open", !isOpen);
      menuToggle.setAttribute("aria-expanded", isOpen ? "false" : "true");
    });
    cardMenu.addEventListener("click", (event) => {
      const actionButton = event.target.closest("button[data-card-action]");
      if (!actionButton || actionButton.disabled) return;
      event.stopPropagation();
      closeCardActionMenus();
      const action = actionButton.dataset.cardAction;
      if (action === "edit") startEditingCard(card.id);
      if (action === "move") openMoveCardModal(card.id);
      if (action === "archive") archiveCard(card.id);
      if (action === "delete") deleteCard(card.id);
    });
  }

  if (!hasTimer) {
    const topLine = node.querySelector(".card-topline");
    topLine.append(cardActions);
    node.querySelector(".timer-row").hidden = true;
    if (card.type === "quote") {
      node.querySelector(".card-main").hidden = true;
    }
  }

  const body = node.querySelector(".card-body");
  if (card.type === "planner") {
    body.append(renderPlanner(card));
  }
  if (card.type === "planlist") {
    body.append(renderPlannerLinkedList(card));
  }
  if (card.type === "diary") {
    body.append(renderDiary(card));
  }
  if (card.type === "quote") {
    body.append(renderQuote(card));
  }
  if (card.type === "video") {
    body.append(renderVideoCard(card));
  }
  if (card.type === "fitness") {
    body.append(renderFitnessLog(card));
  }
  if (card.type === "food") {
    body.append(renderFoodTracker(card));
  }
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

  if (!interactive) {
    body.querySelectorAll("button, input, textarea").forEach((control) => {
      control.disabled = true;
    });
  }

  if (interactive) {
    node.addEventListener("dragstart", (event) => {
      draggedCardId = card.id;
      event.dataTransfer.effectAllowed = "move";
      node.classList.add("is-dragging");
      elements.boardGrid.classList.add("is-dragging-card");
    });

    node.addEventListener("dragend", () => {
      draggedCardId = null;
      node.classList.remove("is-dragging");
      elements.boardGrid.classList.remove("is-dragging-card");
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
      moveCardToPosition(draggedCardId, card.id, options.columnIndex ?? 0);
    });
  }

  return node;
}

function renderPlanner(card) {
  normalizePlannerCard(card);
  const activeDate = getActivePlannerDate(card);
  const entry = getPlannerEntry(card, activeDate);
  const wrapper = document.createElement("div");
  wrapper.className = "planner-card";

  const dayPanel = document.createElement("div");
  dayPanel.className = "planner-day-panel";
  const dateItems = countPlannerNoteLines(entry.note);

  const dateRow = document.createElement("div");
  dateRow.className = "planner-date-select-row";
  const dateInput = document.createElement("input");
  dateInput.className = "planner-date-input";
  dateInput.type = "date";
  dateInput.value = activeDate;
  dateInput.setAttribute("aria-label", "Planner date");
  dateInput.addEventListener("change", () => {
    setPlannerDate(card, dateInput.value);
  });
  const dateMeta = document.createElement("span");
  dateMeta.textContent = `${formatPlannerDate(activeDate)} · ${
    dateItems ? `${dateItems} item${dateItems === 1 ? "" : "s"}` : "Ready"
  }`;
  dateRow.append(dateInput, dateMeta);

  const addForm = document.createElement("form");
  addForm.className = "planner-add-row";
  const taskInput = document.createElement("input");
  taskInput.className = "planner-task-input";
  taskInput.type = "text";
  taskInput.maxLength = 160;
  taskInput.value = card.plannerDraftText || "";
  taskInput.placeholder = "Write a task, meeting, trip idea or reminder";
  taskInput.setAttribute("aria-label", "Planner task");
  taskInput.addEventListener("input", () => {
    card.plannerDraftText = taskInput.value;
    persistLocalDraftState();
  });
  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.className = "planner-submit-button";
  addButton.title = "Add to upcoming";
  addButton.setAttribute("aria-label", "Add to upcoming");
  addButton.innerHTML = ICONS.plus;
  addForm.append(taskInput, addButton);
  addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const submittedText = stripPlannerBullet(taskInput.value);
    if (!submittedText) return;
    card.plannerDraftText = "";
    taskInput.value = "";
    if (!addPlannerTaskToDate(card, activeDate, submittedText)) return;
    persistLocalDraftState();
  });

  dayPanel.append(dateRow, addForm);
  wrapper.append(dayPanel);
  return wrapper;
}

function renderPlannerLinkedList(card) {
  const view = normalizePlannerViewMode(card.plannerView);
  const options = normalizePlannerViewOptions(card.plannerViewOptions);
  const group = getPlannerGroup(card);
  const viewData = getPlannerViewData(view, group, options, getPlannerViewDate(card));
  const doneCount = viewData.items.filter((item) => item.done).length;
  const wrapper = document.createElement("div");
  wrapper.className = "planner-linked-list";

  const head = document.createElement("div");
  head.className = "planner-linked-head";
  const copy = document.createElement("div");
  const titleRow = document.createElement("div");
  titleRow.className = "planner-linked-title-row";
  if (view === "today") {
    const previousButton = document.createElement("button");
    previousButton.type = "button";
    previousButton.className = "planner-linked-day-button";
    previousButton.title = "Previous day";
    previousButton.setAttribute("aria-label", "Previous planner day");
    previousButton.innerHTML = ICONS["chevron-left"];
    previousButton.addEventListener("click", () => shiftPlannerViewDate(card, -1));
    titleRow.append(previousButton);
  }
  const title = document.createElement("strong");
  title.textContent = view === "today" ? getPlannerViewDayHeading(viewData.dayKey) : getPlannerViewLabel(view);
  titleRow.append(title);
  if (view === "today") {
    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "planner-linked-day-button";
    nextButton.title = "Next day";
    nextButton.setAttribute("aria-label", "Next planner day");
    nextButton.innerHTML = ICONS["chevron-right"];
    nextButton.addEventListener("click", () => shiftPlannerViewDate(card, 1));
    titleRow.append(nextButton);
  }
  const source = document.createElement("span");
  source.textContent = viewData.sourceLabel;
  copy.append(titleRow, source);
  const count = document.createElement("em");
  count.textContent = viewData.items.length ? `${doneCount}/${viewData.items.length} done` : "Ready";
  head.append(copy, count);

  const optionSummary = document.createElement("p");
  optionSummary.className = "planner-linked-summary";
  optionSummary.textContent = getPlannerViewSummary(view, options);
  optionSummary.hidden = !options.showGuide;

  const dateContext = document.createElement("p");
  dateContext.className = "planner-linked-date-context";
  dateContext.textContent = view === "today" ? viewData.dateLabel : "";
  dateContext.hidden = view !== "today";

  const addForm = renderPlannerLinkedAddForm(card, view, options, viewData.dayKey);

  const list = document.createElement("div");
  list.className = "planner-linked-items";
  if (!viewData.items.length) {
    const empty = document.createElement("p");
    empty.className = "planner-linked-empty";
    empty.textContent = viewData.empty;
    list.append(empty);
  } else if (viewData.sections?.length) {
    let renderedCount = 0;
    viewData.sections.forEach((section) => {
      if (renderedCount >= viewData.limit) return;
      const visibleItems = section.items.slice(0, viewData.limit - renderedCount);
      if (!visibleItems.length) return;
      const sectionHead = document.createElement("div");
      sectionHead.className = "planner-linked-section";
      sectionHead.innerHTML = `<span>${escapeHtml(section.label)}</span><em>${section.items.length}</em>`;
      list.append(sectionHead);
      visibleItems.forEach((item) => {
        list.append(renderPlannerLinkedItem(item));
      });
      renderedCount += visibleItems.length;
    });
    if (viewData.items.length > renderedCount) {
      const more = document.createElement("p");
      more.className = "planner-linked-more";
      more.textContent = `+${viewData.items.length - renderedCount} more in this view`;
      list.append(more);
    }
  } else {
    const visibleItems = Number.isFinite(viewData.limit) ? viewData.items.slice(0, viewData.limit) : viewData.items;
    visibleItems.forEach((item) => {
      list.append(renderPlannerLinkedItem(item));
    });
    if (Number.isFinite(viewData.limit) && viewData.items.length > viewData.limit) {
      const more = document.createElement("p");
      more.className = "planner-linked-more";
      more.textContent = `+${viewData.items.length - viewData.limit} more in this view`;
      list.append(more);
    }
  }

  wrapper.append(head);
  if (options.showGuide) wrapper.append(optionSummary);
  wrapper.append(dateContext, addForm, list);
  return wrapper;
}

function renderPlannerLinkedAddForm(card, view, options, dayKey = getTodayKey()) {
  const form = document.createElement("form");
  form.className = "planner-linked-add";
  const mode = normalizePlannerViewMode(view);
  const dateKey = normalizeDateKey(card.plannerQuickDate) || getDefaultPlannerViewAddDate(mode, options);
  const selectedDayKey = normalizeDateKey(dayKey) || getTodayKey();

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "planner-linked-add-date";
  dateInput.value = mode === "today" ? selectedDayKey : dateKey;
  dateInput.setAttribute("aria-label", "Planner task date");
  dateInput.hidden = mode === "today";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "planner-linked-add-input";
  input.maxLength = 160;
  input.value = card.plannerDraftText || "";
  input.placeholder = mode === "today" ? "Add something for this day" : "Add a dated planner task";
  input.setAttribute("aria-label", "Add planner task");
  input.addEventListener("input", () => {
    card.plannerDraftText = input.value;
    persistLocalDraftState();
  });
  dateInput.addEventListener("change", () => {
    card.plannerQuickDate = normalizeDateKey(dateInput.value) || getDefaultPlannerViewAddDate(mode, options);
    persistLocalDraftState();
  });

  const button = document.createElement("button");
  button.type = "submit";
  button.className = "planner-linked-add-button";
  button.title = "Add planner task";
  button.setAttribute("aria-label", "Add planner task");
  button.innerHTML = ICONS.plus;

  form.append(dateInput, input, button);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const targetDate = mode === "today" ? selectedDayKey : normalizeDateKey(dateInput.value) || getDefaultPlannerViewAddDate(mode, options);
    const submittedText = stripPlannerBullet(input.value);
    if (!submittedText) return;
    card.plannerQuickDate = targetDate;
    card.plannerDraftText = "";
    input.value = "";
    if (!addPlannerTaskFromPlannerView(card, targetDate, submittedText)) return;
    persistLocalDraftState();
  });
  return form;
}

function renderPlannerLinkedItem(item) {
  const taskKey = getPlannerTaskRowKey(item);
  if (editingPlannerTaskKey === taskKey) {
    return renderPlannerLinkedEditItem(item);
  }

  const row = document.createElement("div");
  row.className = "planner-linked-item";
  row.classList.toggle("is-done", Boolean(item.done));

  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "planner-linked-check";
  check.checked = Boolean(item.done);
  check.title = item.done ? "Mark as open" : "Mark as done";
  check.setAttribute("aria-label", `${item.done ? "Mark open" : "Mark done"}: ${item.title}`);
  check.addEventListener("change", () => togglePlannerTaskDone(item));

  const date = document.createElement("button");
  date.type = "button";
  date.className = "planner-linked-date";
  const originalDateKey = item.isCarryover ? normalizeDateKey(item.carryoverFrom) : "";
  const displayDateKey = originalDateKey || item.dateKey;
  date.classList.toggle("is-carryover", Boolean(originalDateKey));
  date.textContent = originalDateKey ? formatPlannerOriginDate(originalDateKey) : formatPlannerListDate(item.dateKey);
  date.title = originalDateKey ? `Open original planner date: ${formatPlannerOriginDate(originalDateKey)}` : "Open planner date";
  date.addEventListener("click", () => setPlannerDate(item.card, displayDateKey));

  const main = document.createElement("div");
  main.className = "planner-linked-main";
  const meta = document.createElement("div");
  meta.className = "planner-linked-meta";
  meta.append(date);

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "planner-linked-copy";
  copy.title = "Edit task name or date";
  copy.addEventListener("click", () => startPlannerTaskEdit(item));
  if (item.isCarryover && !item.done) {
    const badge = document.createElement("span");
    badge.className = "planner-linked-carryover";
    badge.textContent = "Incomplete";
    badge.title = originalDateKey ? `Carried from ${formatPlannerOriginDate(originalDateKey)}` : "Carried from a past planner day";
    meta.append(badge);
  }
  if (item.done && item.completedAt) {
    const completed = document.createElement("span");
    completed.className = "planner-linked-completed";
    completed.textContent = formatPlannerCompletedAt(item.completedAt);
    completed.title = `Completed ${formatPlannerCompletedTooltip(item.completedAt)}`;
    meta.append(completed);
  }
  copy.textContent = item.title;

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "planner-linked-edit-button";
  edit.title = "Edit task";
  edit.setAttribute("aria-label", `Edit planner task: ${item.title}`);
  edit.innerHTML = ICONS.pencil;
  edit.addEventListener("click", () => startPlannerTaskEdit(item));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "planner-linked-delete";
  remove.title = "Delete planner task";
  remove.setAttribute("aria-label", `Delete planner task: ${item.title}`);
  remove.innerHTML = ICONS["trash-2"];
  remove.addEventListener("click", () => deletePlannerTask(item));

  const actions = document.createElement("div");
  actions.className = "planner-linked-actions";
  actions.append(edit, remove);

  main.append(meta, copy);
  row.append(check, main, actions);
  return row;
}

function getPlannerTaskRowKey(item) {
  return [item?.card?.id || "", normalizeDateKey(item?.dateKey), Number.isInteger(item?.lineIndex) ? item.lineIndex : "", getPlannerItemKey(item?.title)].join("|");
}

function startPlannerTaskEdit(item) {
  editingPlannerTaskKey = getPlannerTaskRowKey(item);
  plannerTaskEditDraft = {
    key: editingPlannerTaskKey,
    title: item.title || "",
    dateKey: normalizeDateKey(item.dateKey) || getTodayKey()
  };
  renderCardsOnly({ force: true });
}

function cancelPlannerTaskEdit() {
  editingPlannerTaskKey = "";
  plannerTaskEditDraft = null;
  renderCardsOnly({ force: true });
}

function getPlannerTaskEditDraft(item) {
  const key = getPlannerTaskRowKey(item);
  if (!plannerTaskEditDraft || plannerTaskEditDraft.key !== key) {
    plannerTaskEditDraft = {
      key,
      title: item.title || "",
      dateKey: normalizeDateKey(item.dateKey) || getTodayKey()
    };
  }
  return plannerTaskEditDraft;
}

function renderPlannerLinkedEditItem(item) {
  const draft = getPlannerTaskEditDraft(item);
  const row = document.createElement("div");
  row.className = "planner-linked-item is-editing";

  const form = document.createElement("form");
  form.className = "planner-linked-edit-form";

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "planner-linked-edit-date";
  dateInput.value = normalizeDateKey(draft.dateKey) || normalizeDateKey(item.dateKey) || getTodayKey();
  dateInput.setAttribute("aria-label", "Task date");
  dateInput.addEventListener("input", () => {
    draft.dateKey = normalizeDateKey(dateInput.value) || draft.dateKey;
  });

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "planner-linked-edit-input";
  titleInput.value = draft.title;
  titleInput.setAttribute("aria-label", "Task name");
  titleInput.addEventListener("input", () => {
    draft.title = titleInput.value;
  });

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "planner-linked-edit-save";
  save.title = "Save task";
  save.setAttribute("aria-label", "Save planner task");
  save.innerHTML = ICONS.check;

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "planner-linked-edit-cancel";
  cancel.title = "Cancel edit";
  cancel.setAttribute("aria-label", "Cancel planner task edit");
  cancel.innerHTML = ICONS.x;
  cancel.addEventListener("click", cancelPlannerTaskEdit);

  form.append(dateInput, titleInput, save, cancel);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const saved = updatePlannerTask(item, titleInput.value, dateInput.value);
    if (!saved) return;
    editingPlannerTaskKey = "";
    plannerTaskEditDraft = null;
  });

  row.append(form);
  window.requestAnimationFrame(() => titleInput.focus());
  return row;
}

function buildPlannerNote(lines) {
  return lines.map((line) => `- ${line}`).join("\n");
}

function updatePlannerTask(item, nextTitle, nextDateKey) {
  if (!item?.card || !item.dateKey) return false;
  const title = stripPlannerBullet(nextTitle);
  const oldDate = normalizeDateKey(item.dateKey);
  const newDate = normalizeDateKey(nextDateKey) || oldDate;
  if (!title || !oldDate || !newDate) return false;

  const oldEntry = getPlannerEntry(item.card, oldDate);
  const oldLines = getPlannerNoteLines(oldEntry.note);
  const lineIndex = getPlannerLineIndex(oldLines, item);
  if (lineIndex < 0) return false;

  const oldLine = oldLines[lineIndex];
  const oldKey = getPlannerItemKey(oldLine);
  const newKey = getPlannerItemKey(title);
  const linkedSourceDate = item.isCarryover ? normalizeDateKey(item.carryoverFrom) : oldDate;
  const nextLinkedSourceDate = item.isCarryover ? linkedSourceDate : newDate;
  const oldCheckedItems = { ...(oldEntry.checkedItems || {}) };
  const oldCarryoverItems = { ...(oldEntry.carryoverItems || {}) };
  const oldItemRecords = { ...(oldEntry.itemRecords || {}) };
  const preservedCheck = oldCheckedItems[oldKey];
  const preservedCarryover = oldCarryoverItems[oldKey];
  const preservedRecord = oldItemRecords[oldKey] || { createdAt: Date.now() };

  oldLines.splice(lineIndex, 1);
  delete oldCheckedItems[oldKey];
  delete oldCarryoverItems[oldKey];
  delete oldItemRecords[oldKey];
  removeCarryoverCopyForSourceTask(item.card, oldDate, oldLine);
  item.card.plannerEntries[oldDate] = normalizePlannerEntry({
    note: buildPlannerNote(oldLines),
    checkedItems: oldCheckedItems,
    carryoverItems: oldCarryoverItems,
    itemRecords: oldItemRecords,
    updatedAt: Date.now()
  });

  const targetEntry = oldDate === newDate ? item.card.plannerEntries[oldDate] : getPlannerEntry(item.card, newDate);
  const targetLines = oldDate === newDate ? oldLines : getPlannerNoteLines(targetEntry.note);
  const targetCheckedItems = { ...(targetEntry.checkedItems || {}) };
  const targetCarryoverItems = { ...(targetEntry.carryoverItems || {}) };
  const targetItemRecords = { ...(targetEntry.itemRecords || {}) };
  const insertIndex = oldDate === newDate ? Math.min(lineIndex, targetLines.length) : targetLines.length;

  targetLines.splice(insertIndex, 0, title);
  if (preservedCheck) targetCheckedItems[newKey] = normalizePlannerDoneRecord(preservedCheck);
  if (preservedCarryover) targetCarryoverItems[newKey] = preservedCarryover;
  targetItemRecords[newKey] = preservedRecord;

  item.card.plannerEntries[newDate] = normalizePlannerEntry({
    note: buildPlannerNote(targetLines),
    checkedItems: targetCheckedItems,
    carryoverItems: targetCarryoverItems,
    itemRecords: targetItemRecords,
    updatedAt: Date.now()
  });
  updatePlannerLinkedTaskReferences(item.card, oldLine, title, linkedSourceDate, nextLinkedSourceDate);
  const preservedCompletedAt = Number(normalizePlannerDoneRecord(preservedCheck)?.completedAt) || 0;
  if (isTimestampOnDate(preservedCompletedAt, getTodayKey())) {
    ensureCompletedTodayCopyForSourceTask(item.card, newDate, title, preservedCompletedAt);
  }
  item.card.activePlannerDate = newDate;
  editingPlannerTaskKey = "";
  plannerTaskEditDraft = null;
  saveState();
  renderCardsOnly({ force: true });
  return true;
}

function mergePlannerItemRecord(currentRecord, incomingRecord) {
  const currentCreatedAt = normalizeTimestamp(currentRecord?.createdAt || currentRecord);
  const incomingCreatedAt = normalizeTimestamp(incomingRecord?.createdAt || incomingRecord);
  const createdAt = [currentCreatedAt, incomingCreatedAt].filter(Boolean).sort((a, b) => a - b)[0] || Date.now();
  return { createdAt };
}

function updatePlannerLinkedTaskReferences(card, oldTitle, newTitle, sourceDate, nextSourceDate = sourceDate) {
  const oldKey = getPlannerItemKey(oldTitle);
  const newKey = getPlannerItemKey(newTitle);
  const normalizedSourceDate = normalizeDateKey(sourceDate);
  const normalizedNextSourceDate = normalizeDateKey(nextSourceDate) || normalizedSourceDate;
  if (!card || !oldKey || !newKey || !normalizedSourceDate) return false;

  let changed = false;
  Object.entries(card.plannerEntries || {}).forEach(([dateKey, entry]) => {
    const plannerDate = normalizeDateKey(dateKey);
    if (!plannerDate) return;
    const normalizedEntry = normalizePlannerEntry(entry);
    const lines = getPlannerNoteLines(normalizedEntry.note);
    const isLinkedSource = plannerDate === normalizedSourceDate;
    const isLinkedCarryover = getPlannerEntryCarryoverDate(normalizedEntry, oldKey, "") === normalizedSourceDate;
    if (!isLinkedSource && !isLinkedCarryover) return;
    if (!lines.some((line) => getPlannerItemKey(line) === oldKey)) return;

    let entryChanged = false;
    const checkedItems = { ...(normalizedEntry.checkedItems || {}) };
    const carryoverItems = { ...(normalizedEntry.carryoverItems || {}) };
    const itemRecords = { ...(normalizedEntry.itemRecords || {}) };

    if (oldKey !== newKey) {
      if (checkedItems[oldKey] && !checkedItems[newKey]) checkedItems[newKey] = checkedItems[oldKey];
      delete checkedItems[oldKey];

      if (carryoverItems[oldKey]) {
        carryoverItems[newKey] = {
          ...(carryoverItems[newKey] || carryoverItems[oldKey]),
          fromDate: normalizedNextSourceDate
        };
      }
      delete carryoverItems[oldKey];

      if (itemRecords[oldKey]) itemRecords[newKey] = mergePlannerItemRecord(itemRecords[newKey], itemRecords[oldKey]);
      delete itemRecords[oldKey];
      entryChanged = true;
    } else if (carryoverItems[oldKey] && getPlannerEntryCarryoverDate(normalizedEntry, oldKey, "") !== normalizedNextSourceDate) {
      carryoverItems[oldKey] = {
        ...carryoverItems[oldKey],
        fromDate: normalizedNextSourceDate
      };
      entryChanged = true;
    }

    const alreadyHasNewLine = oldKey !== newKey && lines.some((line) => getPlannerItemKey(line) === newKey);
    let insertedNewLine = alreadyHasNewLine;
    const nextLines = [];
    lines.forEach((line) => {
      if (getPlannerItemKey(line) !== oldKey) {
        nextLines.push(line);
        return;
      }
      if (insertedNewLine) {
        entryChanged = true;
        return;
      }
      nextLines.push(newTitle);
      insertedNewLine = true;
      if (line !== newTitle) entryChanged = true;
    });

    if (!entryChanged) return;
    card.plannerEntries[plannerDate] = normalizePlannerEntry({
      ...normalizedEntry,
      note: buildPlannerNote(nextLines),
      checkedItems,
      carryoverItems,
      itemRecords,
      updatedAt: Date.now()
    });
    changed = true;
  });
  return changed;
}


function renderDiary(card) {
  normalizeDiaryCard(card);
  const activeDate = getActiveDiaryDate(card);
  const entry = getDiaryEntry(card, activeDate);
  const wrapper = document.createElement("div");
  wrapper.className = "diary-card";

  const nav = document.createElement("div");
  nav.className = "diary-nav";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.title = "Previous day";
  previous.setAttribute("aria-label", "Previous day");
  previous.innerHTML = ICONS["chevron-left"];
  previous.addEventListener("click", () => {
    moveDiaryDate(card, -1);
  });
  const next = document.createElement("button");
  next.type = "button";
  next.title = "Next day";
  next.setAttribute("aria-label", "Next day");
  next.innerHTML = ICONS["chevron-right"];
  next.addEventListener("click", () => {
    moveDiaryDate(card, 1);
  });
  const dateCopy = document.createElement("div");
  const dateLabel = document.createElement("strong");
  dateLabel.textContent = formatDiaryDate(activeDate);
  const status = document.createElement("span");
  status.textContent = entry.updatedAt ? `Saved ${formatRecordDateTime(entry.updatedAt)}` : "New page";
  dateCopy.append(dateLabel, status);
  nav.append(previous, dateCopy, next);

  const moodPicker = document.createElement("div");
  moodPicker.className = "mood-picker";
  getDiaryFeelings().forEach((feeling) => {
    const mood = DIARY_MOOD_META[feeling] || { icon: feeling, label: feeling };
    const button = document.createElement("button");
    button.type = "button";
    button.classList.toggle("is-active", entry.feeling === feeling);
    button.textContent = mood.icon;
    button.title = mood.label;
    button.setAttribute("aria-label", mood.label);
    button.addEventListener("click", () => {
      updateDiaryEntry(card, activeDate, { feeling });
      renderCardsOnly();
    });
    moodPicker.append(button);
  });

  const sentence = document.createElement("textarea");
  sentence.className = "diary-sentence";
  sentence.rows = 2;
  sentence.placeholder = "One sentence for this day";
  sentence.value = entry.sentence || "";
  sentence.addEventListener("input", () => {
    updateDiaryEntry(card, activeDate, { sentence: sentence.value }, { rerender: false });
    autoGrowTextarea(sentence);
  });
  sentence.addEventListener("change", renderCardsOnly);

  const thoughts = document.createElement("textarea");
  thoughts.className = "diary-thoughts";
  thoughts.rows = 4;
  thoughts.placeholder = "Thoughts, lessons, wins, worries or reminders";
  thoughts.value = entry.thoughts || "";
  thoughts.addEventListener("input", () => {
    updateDiaryEntry(card, activeDate, { thoughts: thoughts.value }, { rerender: false });
    autoGrowTextarea(thoughts);
  });
  thoughts.addEventListener("change", renderCardsOnly);

  wrapper.append(nav, moodPicker, sentence, thoughts);
  requestAnimationFrame(() => {
    autoGrowTextarea(sentence);
    autoGrowTextarea(thoughts);
  });
  return wrapper;
}

function renderQuote(card) {
  const wrapper = document.createElement("blockquote");
  wrapper.className = "quote-block";
  const quote = document.createElement("p");
  quote.textContent = card.description || card.title || "Add words you want to keep visible.";
  const footer = document.createElement("footer");
  footer.textContent = card.quoteAuthor || "";
  wrapper.append(quote);
  if (footer.textContent) wrapper.append(footer);
  return wrapper;
}

function renderVideoCard(card) {
  const wrapper = document.createElement("div");
  wrapper.className = "video-card";
  const embed = getVideoEmbed(card.videoUrl);

  if (embed && canRenderInlineVideo()) {
    const shell = document.createElement("div");
    shell.className = "video-shell";
    const iframe = document.createElement("iframe");
    iframe.src = embed.src;
    iframe.title = card.title || "Embedded video";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.sandbox = "allow-scripts allow-same-origin allow-presentation allow-popups";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    shell.append(iframe);
    wrapper.append(shell);
  } else if (embed) {
    const preview = document.createElement("div");
    preview.className = "video-preview";
    if (embed.thumbnail) {
      preview.style.setProperty("--video-thumb", `url("${cssEscapeUrl(embed.thumbnail)}")`);
    }
    preview.innerHTML = `${ICONS.video}<strong>${escapeHtml(embed.providerLabel)} saved</strong><span>${escapeHtml(card.title || "Video card")}</span>`;
    wrapper.append(preview);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "video-placeholder";
    placeholder.innerHTML = `${ICONS.video}<strong>Paste a supported video link</strong><span>YouTube, Instagram or Facebook</span>`;
    wrapper.append(placeholder);
  }

  if (card.videoUrl) {
    const link = document.createElement("a");
    link.className = "video-link";
    link.href = card.videoUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = `${ICONS["external-link"]}<span>Open video</span>`;
    wrapper.append(link);
  }

  return wrapper;
}

function normalizeFitnessCard(card) {
  card.fitnessEntries = card.fitnessEntries && typeof card.fitnessEntries === "object" ? card.fitnessEntries : {};
  card.activeFitnessDate = normalizeDateKey(card.activeFitnessDate) || getTodayKey();
  card.activeFitnessPart = FITNESS_PARTS.some((part) => part.key === card.activeFitnessPart) ? card.activeFitnessPart : "";
  card.fitnessMetricsOpen = Boolean(card.fitnessMetricsOpen);
  Object.entries(card.fitnessEntries).forEach(([dateKey, entry]) => {
    const normalizedDate = normalizeDateKey(dateKey);
    if (!normalizedDate) {
      delete card.fitnessEntries[dateKey];
      return;
    }
    card.fitnessEntries[normalizedDate] = normalizeFitnessEntry(entry);
    if (normalizedDate !== dateKey) delete card.fitnessEntries[dateKey];
  });
  const activeEntry = card.fitnessEntries[card.activeFitnessDate];
  const activeParts = activeEntry ? getActiveFitnessParts(activeEntry) : [];
  if (!activeParts.some((part) => part.key === card.activeFitnessPart)) {
    card.activeFitnessPart = activeParts[0]?.key || "";
  }
}

function normalizeFitnessEntry(entry = {}) {
  const parts = entry.parts && typeof entry.parts === "object" ? entry.parts : {};
  const normalizedParts = {};
  FITNESS_PARTS.forEach((meta) => {
    normalizedParts[meta.key] = normalizeFitnessPart(meta, parts[meta.key] || {});
  });
  return {
    parts: normalizedParts,
    metrics: normalizeFitnessMetrics(entry.metrics || {}),
    notes: normalizeLabel(entry.notes || ""),
    updatedAt: normalizeTimestamp(entry.updatedAt) || 0
  };
}

function normalizeFitnessPart(meta, part = {}) {
  const active = Boolean(part.active);
  if (meta.type === "cardio") {
    return {
      active,
      distanceKm: normalizeOptionalNumber(part.distanceKm),
      durationMinutes: normalizeOptionalNumber(part.durationMinutes),
      intensity: normalizeFitnessIntensity(part.intensity),
      notes: normalizeLabel(part.notes || "")
    };
  }
  if (meta.type === "strength") {
    const exercises = Array.isArray(part.exercises) ? part.exercises.map(normalizeFitnessExercise).filter((item) => item.name) : [];
    return { active, exercises, notes: normalizeLabel(part.notes || "") };
  }
  return {
    active,
    durationMinutes: normalizeOptionalNumber(part.durationMinutes),
    area: normalizeLabel(part.area || meta.label),
    notes: normalizeLabel(part.notes || "")
  };
}

function normalizeFitnessExercise(exercise = {}) {
  return {
    id: exercise.id || createId(),
    name: normalizeLabel(exercise.name || "Exercise"),
    sets: normalizeOptionalNumber(exercise.sets),
    reps: normalizeLabel(exercise.reps || ""),
    weightKg: normalizeOptionalNumber(exercise.weightKg),
    rpe: normalizeOptionalNumber(exercise.rpe),
    notes: normalizeLabel(exercise.notes || "")
  };
}

function normalizeFitnessMetrics(metrics = {}) {
  const next = {};
  FITNESS_METRIC_FIELDS.forEach((field) => {
    next[field.key] = normalizeOptionalNumber(metrics[field.key]);
  });
  const calculatedBmi = calculateBMI(next.weightKg, next.heightCm);
  if (calculatedBmi !== "") {
    next.bmi = calculatedBmi;
  }
  return next;
}

function normalizeOptionalNumber(value) {
  if (value === "" || value === null || typeof value === "undefined") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

function normalizeFitnessIntensity(value) {
  return ["Easy", "Moderate", "Hard", "Max"].includes(value) ? value : "Moderate";
}

function calculateBMI(weightKg, heightCm) {
  const weight = Number(weightKg);
  const height = Number(heightCm) / 100;
  if (!weight || !height) return "";
  return Number((weight / (height * height)).toFixed(1));
}

function getActiveFitnessDate(card) {
  normalizeFitnessCard(card);
  return normalizeDateKey(card.activeFitnessDate) || getTodayKey();
}

function getFitnessEntry(card, dateKey = getActiveFitnessDate(card)) {
  normalizeFitnessCard(card);
  const normalizedDate = normalizeDateKey(dateKey) || getTodayKey();
  if (!card.fitnessEntries[normalizedDate]) {
    card.fitnessEntries[normalizedDate] = normalizeFitnessEntry();
  }
  return card.fitnessEntries[normalizedDate];
}

function getFitnessPartMeta(key) {
  return FITNESS_PARTS.find((part) => part.key === key) || FITNESS_PARTS[0];
}

function getActiveFitnessParts(entry) {
  return FITNESS_PARTS.filter((meta) => entry.parts?.[meta.key]?.active);
}

function updateFitnessEntry(card, dateKey, updater, options = {}) {
  if (options.rerender) {
    syncFitnessUiStateFromDom(card);
  }
  const normalizedDate = normalizeDateKey(dateKey) || getTodayKey();
  const entry = getFitnessEntry(card, normalizedDate);
  updater(entry);
  entry.metrics = normalizeFitnessMetrics(entry.metrics);
  entry.updatedAt = Date.now();
  card.fitnessEntries[normalizedDate] = normalizeFitnessEntry(entry);
  saveState({ quiet: true });
  if (options.rerender) renderCardsOnly({ force: true });
}

function syncFitnessUiStateFromDom(card) {
  const node = [...(elements.boardGrid?.querySelectorAll(".task-card") || [])].find((item) => item.dataset.id === card.id);
  const metrics = node?.querySelector(".fitness-metrics");
  if (metrics) {
    card.fitnessMetricsOpen = Boolean(metrics.open);
  }
}

function ensureFitnessStrengthExercise(part, meta) {
  if (!Array.isArray(part.exercises)) part.exercises = [];
  if (part.exercises.length) return;
  part.exercises.push(normalizeFitnessExercise({ name: meta.defaults?.[0] || "Exercise", sets: 3, reps: "8-12", weightKg: "", rpe: 7 }));
}

function renderFitnessLog(card) {
  normalizeFitnessCard(card);
  const dateKey = getActiveFitnessDate(card);
  const entry = getFitnessEntry(card, dateKey);
  const activeParts = getActiveFitnessParts(entry);
  const wrapper = document.createElement("div");
  wrapper.className = "fitness-log";

  const nav = document.createElement("div");
  nav.className = "fitness-nav";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.innerHTML = ICONS["chevron-left"];
  previous.title = "Previous day";
  previous.addEventListener("click", () => {
    card.activeFitnessDate = getTodayKey(addDays(dateKeyToLocalDate(dateKey), -1));
    saveState();
    renderCardsOnly({ force: true });
  });
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = dateKey;
  dateInput.addEventListener("change", () => {
    card.activeFitnessDate = normalizeDateKey(dateInput.value) || getTodayKey();
    getFitnessEntry(card, card.activeFitnessDate);
    saveState();
    renderCardsOnly({ force: true });
  });
  const next = document.createElement("button");
  next.type = "button";
  next.innerHTML = ICONS["chevron-right"];
  next.title = "Next day";
  next.addEventListener("click", () => {
    card.activeFitnessDate = getTodayKey(addDays(dateKeyToLocalDate(dateKey), 1));
    saveState();
    renderCardsOnly({ force: true });
  });
  const status = document.createElement("span");
  status.textContent = entry.updatedAt ? `Saved ${formatRecordDate(entry.updatedAt)}` : "No workout yet";
  nav.append(previous, dateInput, next, status);

  const parts = document.createElement("div");
  parts.className = "fitness-parts";
  FITNESS_PARTS.forEach((meta) => {
    const part = entry.parts[meta.key];
    const button = document.createElement("button");
    button.type = "button";
    button.classList.toggle("is-active", part.active);
    button.classList.toggle("is-selected", card.activeFitnessPart === meta.key);
    button.textContent = part.active ? `${meta.label}` : meta.label;
    button.title = part.active ? `Edit ${meta.label}` : `Log ${meta.label}`;
    button.addEventListener("click", () => {
      updateFitnessEntry(card, dateKey, (nextEntry) => {
        const nextPart = nextEntry.parts[meta.key];
        if (!nextPart.active) {
          nextPart.active = true;
        }
        card.activeFitnessPart = meta.key;
        if (nextPart.active && meta.type === "strength") ensureFitnessStrengthExercise(nextPart, meta);
      }, { rerender: true });
    });
    parts.append(button);
  });

  const activeBody = document.createElement("div");
  activeBody.className = "fitness-active";
  if (!activeParts.length) {
    const empty = document.createElement("p");
    empty.className = "fitness-empty";
    empty.textContent = "Select the workout parts completed for this date.";
    activeBody.append(empty);
  } else {
    activeBody.append(renderFitnessSummaryStrip(entry, activeParts));
    const selectedMeta = activeParts.find((meta) => meta.key === card.activeFitnessPart) || activeParts[0];
    activeBody.append(renderFitnessPartEditor(card, dateKey, selectedMeta, entry.parts[selectedMeta.key]));
  }

  wrapper.append(nav, parts, activeBody, renderFitnessMetrics(card, dateKey, entry));
  return wrapper;
}

function renderFitnessSummaryStrip(entry, activeParts) {
  const strip = document.createElement("div");
  strip.className = "fitness-summary-strip";
  activeParts.forEach((meta) => {
    const pill = document.createElement("span");
    pill.className = "fitness-summary-pill";
    pill.innerHTML = `<strong>${escapeHtml(meta.label)}</strong><small>${escapeHtml(getFitnessPartSummary(meta, entry.parts[meta.key]))}</small>`;
    strip.append(pill);
  });
  return strip;
}

function getFitnessPartSummary(meta, part) {
  if (!part) return "Logged";
  if (meta.type === "cardio") {
    const distance = Number(part.distanceKm) || 0;
    const minutes = Number(part.durationMinutes) || 0;
    if (distance && minutes) return `${formatReportNumber(distance)} km · ${formatReportNumber(minutes)} min`;
    if (distance) return `${formatReportNumber(distance)} km`;
    if (minutes) return `${formatReportNumber(minutes)} min`;
    return "Cardio";
  }
  if (meta.type === "strength") {
    const exercises = Array.isArray(part.exercises) ? part.exercises : [];
    const sets = exercises.reduce((sum, exercise) => sum + (Number(exercise.sets) || 0), 0);
    if (sets && exercises.length) return `${sets} sets · ${exercises.length} ex`;
    if (exercises.length) return `${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`;
    return "Strength";
  }
  const minutes = Number(part.durationMinutes) || 0;
  return minutes ? `${formatReportNumber(minutes)} min` : part.area || "Logged";
}

function renderFitnessPartEditor(card, dateKey, meta, part) {
  if (meta.type === "cardio") return renderFitnessCardioEditor(card, dateKey, meta, part);
  if (meta.type === "strength") return renderFitnessStrengthEditor(card, dateKey, meta, part);
  return renderFitnessSimpleEditor(card, dateKey, meta, part);
}

function renderFitnessCardioEditor(card, dateKey, meta, part) {
  const section = createFitnessSection(meta.label, () => removeFitnessPart(card, dateKey, meta.key));
  const grid = document.createElement("div");
  grid.className = "fitness-field-grid fitness-cardio-grid";
  grid.append(
    createFitnessNumberField("Km", part.distanceKm, (value) => {
      updateFitnessEntry(card, dateKey, (entry) => { entry.parts[meta.key].distanceKm = value; });
    }, { step: "0.01", decimals: 2, min: 0 }),
    createFitnessNumberField("Minutes", part.durationMinutes, (value) => {
      updateFitnessEntry(card, dateKey, (entry) => { entry.parts[meta.key].durationMinutes = value; });
    }, { step: "0.1", decimals: 1, min: 0 }),
    createFitnessSelectField("Effort", part.intensity, ["Easy", "Moderate", "Hard", "Max"], (value) => {
      updateFitnessEntry(card, dateKey, (entry) => { entry.parts[meta.key].intensity = value; });
    })
  );
  const pace = document.createElement("span");
  pace.className = "fitness-pace";
  const distance = Number(part.distanceKm);
  const minutes = Number(part.durationMinutes);
  pace.textContent = distance && minutes ? `${(minutes / distance).toFixed(1)} min/km` : "Pace";
  grid.append(pace);
  section.append(grid, createFitnessNotesDisclosure("Running notes", part.notes, (value) => {
    updateFitnessEntry(card, dateKey, (entry) => { entry.parts[meta.key].notes = value; });
  }));
  return section;
}

function renderFitnessStrengthEditor(card, dateKey, meta, part) {
  const section = createFitnessSection(meta.label, () => removeFitnessPart(card, dateKey, meta.key));
  const list = document.createElement("div");
  list.className = "fitness-exercises";
  part.exercises.forEach((exercise, index) => {
    const row = document.createElement("div");
    row.className = "fitness-exercise-row";
    row.append(
      createFitnessTextField("Exercise", exercise.name, (value) => updateFitnessExercise(card, dateKey, meta.key, index, { name: value })),
      createFitnessNumberField("Sets", exercise.sets, (value) => updateFitnessExercise(card, dateKey, meta.key, index, { sets: value }), { step: "1", decimals: 0, min: 0 }),
      createFitnessTextField("Reps", exercise.reps, (value) => updateFitnessExercise(card, dateKey, meta.key, index, { reps: value })),
      createFitnessNumberField("Kg", exercise.weightKg, (value) => updateFitnessExercise(card, dateKey, meta.key, index, { weightKg: value }), { step: "0.25", decimals: 2, min: 0 }),
      createFitnessNumberField("RPE", exercise.rpe, (value) => updateFitnessExercise(card, dateKey, meta.key, index, { rpe: value }), { step: "0.5", decimals: 1, min: 1, max: 10 })
    );
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "fitness-remove-exercise";
    remove.innerHTML = ICONS["trash-2"];
    remove.title = "Remove exercise";
    remove.addEventListener("click", () => {
      updateFitnessEntry(card, dateKey, (entry) => {
        entry.parts[meta.key].exercises.splice(index, 1);
      }, { rerender: true });
    });
    row.append(remove);
    list.append(row);
  });
  const add = document.createElement("button");
  add.type = "button";
  add.className = "fitness-add-exercise";
  add.innerHTML = `${ICONS.plus}<span>Add exercise</span>`;
  add.addEventListener("click", () => {
    updateFitnessEntry(card, dateKey, (entry) => {
      const nextPart = entry.parts[meta.key];
      const fallback = meta.defaults?.[nextPart.exercises.length % (meta.defaults.length || 1)] || "Exercise";
      nextPart.exercises.push(normalizeFitnessExercise({ name: fallback, sets: 3, reps: "8-12", rpe: 7 }));
    }, { rerender: true });
  });
  section.append(list, add, createFitnessNotesDisclosure(`${meta.label} notes`, part.notes, (value) => {
    updateFitnessEntry(card, dateKey, (entry) => { entry.parts[meta.key].notes = value; });
  }));
  return section;
}

function renderFitnessSimpleEditor(card, dateKey, meta, part) {
  const section = createFitnessSection(meta.label, () => removeFitnessPart(card, dateKey, meta.key));
  const grid = document.createElement("div");
  grid.className = "fitness-field-grid";
  grid.append(
    createFitnessNumberField("Minutes", part.durationMinutes, (value) => {
      updateFitnessEntry(card, dateKey, (entry) => { entry.parts[meta.key].durationMinutes = value; });
    }, { step: "0.1", decimals: 1, min: 0 }),
    createFitnessTextField("Area", part.area, (value) => {
      updateFitnessEntry(card, dateKey, (entry) => { entry.parts[meta.key].area = value; });
    })
  );
  section.append(grid, createFitnessNotesDisclosure(`${meta.label} notes`, part.notes, (value) => {
    updateFitnessEntry(card, dateKey, (entry) => { entry.parts[meta.key].notes = value; });
  }));
  return section;
}

function removeFitnessPart(card, dateKey, partKey) {
  updateFitnessEntry(card, dateKey, (entry) => {
    if (!entry.parts[partKey]) return;
    entry.parts[partKey].active = false;
    const nextActive = getActiveFitnessParts(entry).find((meta) => meta.key !== partKey);
    card.activeFitnessPart = nextActive?.key || "";
  }, { rerender: true });
}

function updateFitnessExercise(card, dateKey, partKey, index, updates) {
  updateFitnessEntry(card, dateKey, (entry) => {
    const part = entry.parts[partKey];
    part.exercises[index] = normalizeFitnessExercise({ ...part.exercises[index], ...updates });
  });
}

function renderFitnessMetrics(card, dateKey, entry) {
  const section = document.createElement("details");
  section.className = "fitness-section fitness-metrics fitness-disclosure";
  section.open = Boolean(card.fitnessMetricsOpen);
  const summary = document.createElement("summary");
  const summaryText = getFitnessMetricsSummary(entry.metrics);
  summary.innerHTML = `<strong>Body metrics</strong><span>${escapeHtml(summaryText)}</span>`;
  section.addEventListener("toggle", () => {
    card.fitnessMetricsOpen = section.open;
    saveState({ quiet: true });
  });
  const grid = document.createElement("div");
  grid.className = "fitness-metric-grid";
  FITNESS_METRIC_FIELDS.forEach((field) => {
    if (field.key === "bmi" && calculateBMI(entry.metrics.weightKg, entry.metrics.heightCm) !== "") {
      grid.append(createFitnessReadonlyField(`${field.label}${field.suffix ? ` (${field.suffix})` : ""}`, formatFitnessMetricNumber(field.key, entry.metrics.bmi), "Auto"));
      return;
    }
    grid.append(createFitnessNumberField(`${field.label}${field.suffix ? ` (${field.suffix})` : ""}`, formatFitnessMetricInputValue(field.key, entry.metrics[field.key]), (value) => {
      updateFitnessEntry(card, dateKey, (nextEntry) => {
        nextEntry.metrics[field.key] = value;
      });
    }, {
      step: field.step,
      decimals: field.decimals,
      min: field.min,
      max: field.max,
      onCommit: field.key === "weightKg" || field.key === "heightCm" ? () => queueDeferredBoardRender({ reason: "fitness-metrics" }) : null
    }));
  });
  section.append(summary, grid, createFitnessNotesDisclosure("Session notes", entry.notes, (value) => {
    updateFitnessEntry(card, dateKey, (nextEntry) => { nextEntry.notes = value; });
  }));
  return section;
}

function getFitnessMetricsSummary(metrics) {
  const summary = [];
  if (metrics.weightKg !== "") summary.push(`${formatFitnessMetricNumber("weightKg", metrics.weightKg)} kg`);
  if (metrics.bodyFatPercent !== "") summary.push(`${formatFitnessMetricNumber("bodyFatPercent", metrics.bodyFatPercent)}% fat`);
  if (metrics.bmi !== "") summary.push(`BMI ${formatFitnessMetricNumber("bmi", metrics.bmi)}`);
  return summary.join(" · ") || "Optional";
}

function createFitnessSection(title, onRemove) {
  const section = document.createElement("section");
  section.className = "fitness-section";
  const header = document.createElement("div");
  header.className = "fitness-section-header";
  const heading = document.createElement("h4");
  heading.textContent = title;
  header.append(heading);
  if (typeof onRemove === "function") {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "fitness-remove-part";
    remove.textContent = "Remove";
    remove.addEventListener("click", onRemove);
    header.append(remove);
  }
  section.append(header);
  return section;
}

function createFitnessNumberField(label, value, onInput, options = {}) {
  return createFitnessTextField(label, value, onInput, {
    type: "number",
    inputMode: "decimal",
    step: options.step || "0.1",
    min: options.min,
    max: options.max,
    onCommit: options.onCommit
  });
}

function createFitnessTextField(label, value, onInput, options = {}) {
  const field = document.createElement("label");
  field.className = "fitness-field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = options.type || "text";
  if (options.step) input.step = options.step;
  if (typeof options.min !== "undefined") input.min = String(options.min);
  if (typeof options.max !== "undefined") input.max = String(options.max);
  if (options.inputMode) input.inputMode = options.inputMode;
  input.value = value === "" || value === null || typeof value === "undefined" ? "" : String(value);
  input.addEventListener("input", () => onInput(input.value));
  if (typeof options.onCommit === "function") {
    input.addEventListener("change", () => options.onCommit(input.value));
  }
  field.append(span, input);
  return field;
}

function createFitnessReadonlyField(label, value, badge = "") {
  const field = document.createElement("div");
  field.className = "fitness-field fitness-readonly-field";
  const span = document.createElement("span");
  span.textContent = label;
  const output = document.createElement("div");
  output.className = "fitness-readonly-value";
  output.innerHTML = `<strong>${escapeHtml(value || "-")}</strong>${badge ? `<small>${escapeHtml(badge)}</small>` : ""}`;
  field.append(span, output);
  return field;
}

function getFitnessMetricField(key) {
  return FITNESS_METRIC_FIELDS.find((field) => field.key === key) || {};
}

function formatFitnessMetricInputValue(key, value) {
  if (value === "" || value === null || typeof value === "undefined") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const field = getFitnessMetricField(key);
  if (field.decimals === 0) return String(Math.round(number));
  return String(number);
}

function formatFitnessMetricNumber(key, value) {
  if (value === "" || value === null || typeof value === "undefined") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const field = getFitnessMetricField(key);
  const decimals = typeof field.decimals === "number" ? field.decimals : 1;
  if (decimals === 0) return String(Math.round(number));
  return number.toFixed(decimals).replace(/\.?0+$/, "");
}

function createFitnessSelectField(label, value, options, onChange) {
  const field = document.createElement("label");
  field.className = "fitness-field";
  const span = document.createElement("span");
  span.textContent = label;
  const select = document.createElement("select");
  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    select.append(option);
  });
  select.value = value || options[0];
  select.addEventListener("change", () => onChange(select.value));
  field.append(span, select);
  return field;
}

function createFitnessTextArea(label, value, onInput) {
  const field = document.createElement("label");
  field.className = "fitness-field fitness-textarea";
  const span = document.createElement("span");
  span.textContent = label;
  const textarea = document.createElement("textarea");
  textarea.rows = 2;
  textarea.value = value || "";
  textarea.addEventListener("input", () => {
    onInput(textarea.value);
    autoGrowTextarea(textarea);
  });
  field.append(span, textarea);
  requestAnimationFrame(() => autoGrowTextarea(textarea));
  return field;
}

function createFitnessNotesDisclosure(label, value, onInput) {
  const details = document.createElement("details");
  details.className = "fitness-notes-panel";
  details.open = Boolean(value);
  const summary = document.createElement("summary");
  summary.textContent = value ? "Notes saved" : "Add notes";
  const textarea = createFitnessTextArea(label, value, (nextValue) => {
    onInput(nextValue);
    summary.textContent = nextValue ? "Notes saved" : "Add notes";
  });
  details.append(summary, textarea);
  return details;
}

function normalizeFoodCard(card) {
  card.activeFoodDate = normalizeDateKey(card.activeFoodDate) || getTodayKey();
  card.foodLibrary = normalizeFoodLibrary(card.foodLibrary);
  card.foodEntries = card.foodEntries && typeof card.foodEntries === "object" ? card.foodEntries : {};
  card.foodTargets = card.foodTargets && typeof card.foodTargets === "object" ? card.foodTargets : {};
  card.foodTargetsOpen = Boolean(card.foodTargetsOpen);
  card.foodLibraryOpen = Boolean(card.foodLibraryOpen);
  Object.entries(card.foodEntries).forEach(([dateKey, entry]) => {
    const normalizedDate = normalizeDateKey(dateKey);
    if (!normalizedDate) {
      delete card.foodEntries[dateKey];
      return;
    }
    card.foodEntries[normalizedDate] = normalizeFoodEntry(entry);
    if (normalizedDate !== dateKey) delete card.foodEntries[dateKey];
  });
  hydrateFoodEntrySnapshots(card);
  const entry = getFoodEntry(card, card.activeFoodDate);
  if (!entry.meals.some((meal) => meal.id === card.activeFoodMealId)) {
    card.activeFoodMealId = entry.meals[0]?.id || "";
  }
  const monthKey = getFoodMonthKey(card.activeFoodDate);
  if (!card.foodTargets[monthKey]) {
    card.foodTargets[monthKey] = normalizeFoodTarget(card.foodTargets.default || DEFAULT_FOOD_TARGETS);
  }
}

function normalizeFoodLibrary(library = []) {
  const byId = new Map();
  const sourceLibrary = Array.isArray(library) && library.length ? library : DEFAULT_FOOD_LIBRARY;
  sourceLibrary.forEach((food) => {
    const normalized = normalizeFoodDefinition(food);
    if (normalized.name) byId.set(normalized.id, normalized);
  });
  if (!byId.size) {
    DEFAULT_FOOD_LIBRARY.forEach((food) => {
      const normalized = normalizeFoodDefinition(food);
      byId.set(normalized.id, normalized);
    });
  }
  return [...byId.values()];
}

function normalizeFoodDefinition(food = {}) {
  const id = normalizeLabel(food.id || "").replace(/[^a-zA-Z0-9_-]/g, "") || createId();
  return {
    id,
    name: normalizeLabel(food.name || "Food"),
    servingUnit: normalizeLabel(food.servingUnit || "100g") || "100g",
    servingGrams: Math.max(1, normalizeOptionalNumber(food.servingGrams) || 100),
    source: normalizeLabel(food.source || "Custom"),
    ...normalizeFoodNutrients(food)
  };
}

function normalizeFoodNutrients(source = {}) {
  return FOOD_NUTRIENT_KEYS.reduce((nutrients, key) => {
    nutrients[key] = Math.max(0, normalizeOptionalNumber(source[key]) || 0);
    return nutrients;
  }, {});
}

function normalizeFoodTarget(target = {}) {
  return {
    ...DEFAULT_FOOD_TARGETS,
    ...FOOD_NUTRIENT_KEYS.reduce((next, key) => {
      const value = normalizeOptionalNumber(target[key]);
      next[key] = value === "" ? DEFAULT_FOOD_TARGETS[key] : Math.max(0, value);
      return next;
    }, {})
  };
}

function normalizeFoodEntry(entry = {}) {
  const meals = Array.isArray(entry.meals) && entry.meals.length
    ? entry.meals.map(normalizeFoodMeal)
    : getDefaultFoodMeals();
  return {
    meals,
    updatedAt: normalizeTimestamp(entry.updatedAt) || 0
  };
}

function normalizeFoodMeal(meal = {}, index = 0) {
  return {
    id: meal.id || createId(),
    name: normalizeLabel(meal.name || `Meal ${index + 1}`),
    items: Array.isArray(meal.items) ? meal.items.map(normalizeFoodItem).filter(Boolean) : []
  };
}

function normalizeFoodItem(item = {}) {
  const amount = normalizeOptionalNumber(item.amount);
  return {
    id: item.id || createId(),
    foodId: normalizeLabel(item.foodId || item.food || ""),
    amount: amount === "" ? 1 : Math.max(0, amount),
    unit: item.unit === "g" ? "g" : "serving",
    name: normalizeLabel(item.name || ""),
    servingUnit: normalizeLabel(item.servingUnit || ""),
    servingGrams: Math.max(0, normalizeOptionalNumber(item.servingGrams) || 0),
    source: normalizeLabel(item.source || ""),
    ...normalizeFoodNutrients(item)
  };
}

function createFoodItemSnapshot(food = {}) {
  const normalized = normalizeFoodDefinition(food);
  return {
    name: normalized.name,
    servingUnit: normalized.servingUnit,
    servingGrams: normalized.servingGrams,
    source: normalized.source,
    ...normalizeFoodNutrients(normalized)
  };
}

function hasFoodItemSnapshot(item = {}) {
  return Boolean(
    normalizeLabel(item.name || "") &&
    normalizeLabel(item.servingUnit || "") &&
    Number(item.servingGrams) > 0 &&
    FOOD_NUTRIENT_KEYS.some((key) => Number(item[key]) > 0)
  );
}

function hydrateFoodEntrySnapshots(card) {
  Object.values(card.foodEntries || {}).forEach((entry) => {
    (entry.meals || []).forEach((meal) => {
      (meal.items || []).forEach((item) => {
        if (hasFoodItemSnapshot(item)) return;
        const food = getFoodById(card, item.foodId);
        if (food) Object.assign(item, createFoodItemSnapshot(food));
      });
    });
  });
}

function getDefaultFoodMeals() {
  return [1, 2, 3].map((number) => ({
    id: createId(),
    name: `Meal ${number}`,
    items: []
  }));
}

function getActiveFoodDate(card) {
  normalizeFoodCard(card);
  return normalizeDateKey(card.activeFoodDate) || getTodayKey();
}

function getFoodEntry(card, dateKey = getActiveFoodDate(card)) {
  const normalizedDate = normalizeDateKey(dateKey) || getTodayKey();
  if (!card.foodEntries || typeof card.foodEntries !== "object") card.foodEntries = {};
  if (!card.foodEntries[normalizedDate]) {
    card.foodEntries[normalizedDate] = normalizeFoodEntry();
  }
  return card.foodEntries[normalizedDate];
}

function getFoodMonthKey(dateKey) {
  const normalizedDate = normalizeDateKey(dateKey) || getTodayKey();
  return normalizedDate.slice(0, 7);
}

function getFoodTarget(card, dateKey = getActiveFoodDate(card)) {
  normalizeFoodCard(card);
  const monthKey = getFoodMonthKey(dateKey);
  card.foodTargets[monthKey] = normalizeFoodTarget(card.foodTargets[monthKey] || card.foodTargets.default || DEFAULT_FOOD_TARGETS);
  return card.foodTargets[monthKey];
}

function getFoodById(card, foodId) {
  return normalizeFoodLibrary(card.foodLibrary).find((food) => food.id === foodId) || null;
}

function getFoodForLoggedItem(card, item = {}) {
  if (hasFoodItemSnapshot(item)) {
    return normalizeFoodDefinition({
      id: item.foodId || item.id,
      name: item.name,
      servingUnit: item.servingUnit,
      servingGrams: item.servingGrams,
      source: item.source,
      ...normalizeFoodNutrients(item)
    });
  }
  return getFoodById(card, item.foodId);
}

function calculateFoodItem(card, item) {
  const food = getFoodForLoggedItem(card, item);
  if (!food) return createEmptyFoodTotals();
  const amount = Math.max(0, Number(item.amount) || 0);
  const multiplier = item.unit === "g" ? amount / Math.max(1, Number(food.servingGrams) || 100) : amount;
  return multiplyFoodNutrients(food, multiplier);
}

function multiplyFoodNutrients(source, multiplier = 1) {
  return FOOD_NUTRIENT_KEYS.reduce((totals, key) => {
    totals[key] = (Number(source[key]) || 0) * multiplier;
    return totals;
  }, {});
}

function createEmptyFoodTotals() {
  return FOOD_NUTRIENT_KEYS.reduce((totals, key) => {
    totals[key] = 0;
    return totals;
  }, {});
}

function addFoodTotals(...items) {
  return items.reduce((totals, item) => {
    FOOD_NUTRIENT_KEYS.forEach((key) => {
      totals[key] += Number(item?.[key]) || 0;
    });
    return totals;
  }, createEmptyFoodTotals());
}

function getFoodMealTotals(card, meal) {
  return addFoodTotals(...(meal.items || []).map((item) => calculateFoodItem(card, item)));
}

function getFoodEntryTotals(card, entry) {
  return addFoodTotals(...(entry.meals || []).map((meal) => getFoodMealTotals(card, meal)));
}

function renderFoodTracker(card) {
  normalizeFoodCard(card);
  const dateKey = getActiveFoodDate(card);
  const entry = getFoodEntry(card, dateKey);
  const target = getFoodTarget(card, dateKey);
  const totals = getFoodEntryTotals(card, entry);
  const wrapper = document.createElement("div");
  wrapper.className = "food-tracker";

  wrapper.append(
    renderFoodDateNav(card, dateKey, entry),
    renderFoodTotalSummary(card, totals, target, dateKey),
    renderFoodTargetEditor(card, dateKey, target),
    renderFoodAddPanel(card, dateKey, entry),
    renderFoodMeals(card, dateKey, entry),
    renderFoodLibraryEditor(card)
  );
  return wrapper;
}

function renderFoodDateNav(card, dateKey, entry) {
  const nav = document.createElement("div");
  nav.className = "food-nav";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.innerHTML = ICONS["chevron-left"];
  previous.title = "Previous day";
  previous.addEventListener("click", () => {
    card.activeFoodDate = getTodayKey(addDays(dateKeyToLocalDate(dateKey), -1));
    saveState();
    renderCardsOnly({ force: true });
  });
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = dateKey;
  dateInput.addEventListener("change", () => {
    card.activeFoodDate = normalizeDateKey(dateInput.value) || getTodayKey();
    getFoodEntry(card, card.activeFoodDate);
    saveState();
    renderCardsOnly({ force: true });
  });
  const next = document.createElement("button");
  next.type = "button";
  next.innerHTML = ICONS["chevron-right"];
  next.title = "Next day";
  next.addEventListener("click", () => {
    card.activeFoodDate = getTodayKey(addDays(dateKeyToLocalDate(dateKey), 1));
    saveState();
    renderCardsOnly({ force: true });
  });
  const status = document.createElement("span");
  status.textContent = entry.updatedAt ? `Saved ${formatRecordDate(entry.updatedAt)}` : "No meals yet";
  nav.append(previous, dateInput, next, status);
  return nav;
}

function renderFoodTotalSummary(card, totals, target, dateKey) {
  const section = document.createElement("section");
  section.className = "food-summary-panel";
  const header = document.createElement("div");
  header.className = "food-summary-header";
  const title = document.createElement("div");
  title.innerHTML = `<strong>${escapeHtml(formatFoodDateTitle(dateKey))}</strong><span>${escapeHtml(getFoodStatusLabel(totals, target))}</span>`;
  const calories = document.createElement("div");
  calories.className = "food-calories";
  calories.innerHTML = `<strong>${formatFoodNumber(totals.calories, "calories")}</strong><span>/ ${formatFoodNumber(target.calories, "calories")} kcal</span>`;
  header.append(title, calories);

  const grid = document.createElement("div");
  grid.className = "food-macro-grid";
  FOOD_NUTRIENT_KEYS.forEach((key) => {
    const item = document.createElement("div");
    item.className = "food-macro";
    const percent = target[key] ? Math.min(140, (totals[key] / target[key]) * 100) : 0;
    item.innerHTML = `
      <span>${escapeHtml(FOOD_NUTRIENT_META[key].short)}</span>
      <strong>${formatFoodNumber(totals[key], key)}${key === "calories" ? "" : "g"}</strong>
      <small>${formatFoodNumber(target[key], key)}${key === "calories" ? " kcal" : "g"}</small>
      <i style="--food-progress:${percent}%"></i>
    `;
    grid.append(item);
  });
  section.append(header, grid);
  return section;
}

function renderFoodTargetEditor(card, dateKey, target) {
  const details = document.createElement("details");
  details.className = "food-target-panel";
  details.open = Boolean(card.foodTargetsOpen);
  details.addEventListener("toggle", () => {
    card.foodTargetsOpen = details.open;
    saveState({ quiet: true });
  });
  const monthLabel = dateKeyToLocalDate(dateKey).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const summary = document.createElement("summary");
  summary.innerHTML = `<strong>Monthly target</strong><span>${escapeHtml(monthLabel)}</span>`;
  const grid = document.createElement("div");
  grid.className = "food-target-grid";
  FOOD_NUTRIENT_KEYS.forEach((key) => {
    grid.append(createFoodNumberField(FOOD_NUTRIENT_META[key].label, target[key], (value) => {
      const monthKey = getFoodMonthKey(dateKey);
      const currentTarget = normalizeFoodTarget(card.foodTargets[monthKey] || target);
      card.foodTargets[monthKey] = normalizeFoodTarget({
        ...currentTarget,
        [key]: value
      });
      saveFoodCard(card, dateKey);
    }, { step: key === "calories" ? "10" : "1", onCommit: () => renderCardsOnly({ force: true }) }));
  });
  const note = document.createElement("p");
  note.className = "food-source-note";
  note.textContent = "Targets are saved by month, so changing June targets will not rewrite May records.";
  details.append(summary, grid, note);
  return details;
}

function renderFoodAddPanel(card, dateKey, entry) {
  const panel = document.createElement("section");
  panel.className = "food-add-panel";
  const mealTabs = document.createElement("div");
  mealTabs.className = "food-meal-tabs";
  entry.meals.forEach((meal) => {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.toggle("is-active", meal.id === card.activeFoodMealId);
    button.textContent = meal.name;
    button.addEventListener("click", () => {
      card.activeFoodMealId = meal.id;
      saveState();
      renderCardsOnly({ force: true });
    });
    mealTabs.append(button);
  });
  const addMeal = document.createElement("button");
  addMeal.type = "button";
  addMeal.className = "food-add-meal";
  addMeal.innerHTML = `${ICONS.plus}<span>Meal</span>`;
  addMeal.addEventListener("click", () => {
    const meal = { id: createId(), name: `Meal ${entry.meals.length + 1}`, items: [] };
    entry.meals.push(meal);
    card.activeFoodMealId = meal.id;
    saveFoodCard(card, dateKey, { rerender: true });
  });
  mealTabs.append(addMeal);

  const foodChips = document.createElement("div");
  foodChips.className = "food-chip-row";
  card.foodLibrary.forEach((food) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = food.name;
    button.title = `${food.name}: ${formatFoodNumber(food.calories, "calories")} kcal, ${formatFoodNumber(food.protein, "protein")}g protein per ${food.servingUnit}`;
    button.addEventListener("click", () => addFoodItemToMeal(card, dateKey, card.activeFoodMealId, food.id));
    foodChips.append(button);
  });
  panel.append(mealTabs, foodChips);
  return panel;
}

function renderFoodMeals(card, dateKey, entry) {
  const list = document.createElement("div");
  list.className = "food-meals";
  entry.meals.forEach((meal) => list.append(renderFoodMeal(card, dateKey, meal)));
  return list;
}

function renderFoodMeal(card, dateKey, meal) {
  const section = document.createElement("section");
  section.className = "food-meal";
  section.classList.toggle("is-active", meal.id === card.activeFoodMealId);
  const totals = getFoodMealTotals(card, meal);
  const header = document.createElement("div");
  header.className = "food-meal-header";
  const name = document.createElement("input");
  name.type = "text";
  name.value = meal.name;
  name.maxLength = 32;
  name.setAttribute("aria-label", "Meal name");
  name.addEventListener("input", () => {
    meal.name = normalizeLabel(name.value) || "Meal";
    saveFoodCard(card, dateKey);
  });
  name.addEventListener("change", () => renderCardsOnly({ force: true }));
  const summary = document.createElement("span");
  summary.textContent = `${formatFoodNumber(totals.calories, "calories")} kcal · P ${formatFoodNumber(totals.protein, "protein")}g · C ${formatFoodNumber(totals.carbs, "carbs")}g · F ${formatFoodNumber(totals.fat, "fat")}g`;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "food-meal-remove";
  remove.innerHTML = ICONS["trash-2"];
  remove.title = "Remove meal";
  remove.disabled = getFoodEntry(card, dateKey).meals.length <= 1;
  remove.addEventListener("click", () => removeFoodMeal(card, dateKey, meal.id));
  header.append(name, summary, remove);

  const items = document.createElement("div");
  items.className = "food-items";
  if (!meal.items.length) {
    const empty = document.createElement("p");
    empty.className = "food-empty";
    empty.textContent = "Click a food above to add it here.";
    items.append(empty);
  } else {
    meal.items.forEach((item) => items.append(renderFoodItem(card, dateKey, meal, item)));
  }
  section.append(header, items);
  return section;
}

function renderFoodItem(card, dateKey, meal, item) {
  const food = getFoodForLoggedItem(card, item);
  const totals = calculateFoodItem(card, item);
  const row = document.createElement("div");
  row.className = "food-item-row";
  const name = document.createElement("strong");
  name.textContent = food?.name || "Unknown food";
  const amount = document.createElement("input");
  amount.type = "number";
  amount.inputMode = "decimal";
  amount.min = "0";
  amount.step = item.unit === "g" ? "1" : "0.25";
  amount.value = String(item.amount || "");
  amount.setAttribute("aria-label", `${food?.name || "Food"} amount`);
  amount.addEventListener("input", () => {
    item.amount = Math.max(0, normalizeOptionalNumber(amount.value) || 0);
    saveFoodCard(card, dateKey);
  });
  amount.addEventListener("change", () => renderCardsOnly({ force: true }));
  const unit = document.createElement("select");
  unit.setAttribute("aria-label", `${food?.name || "Food"} unit`);
  unit.innerHTML = `
    <option value="g">g</option>
    <option value="serving">${escapeHtml(food?.servingUnit || "unit")}</option>
  `;
  unit.value = item.unit;
  unit.addEventListener("change", () => {
    item.unit = unit.value === "g" ? "g" : "serving";
    saveFoodCard(card, dateKey, { rerender: true });
  });
  const macros = document.createElement("span");
  macros.className = "food-item-macros";
  macros.textContent = `${formatFoodNumber(totals.calories, "calories")} kcal · P ${formatFoodNumber(totals.protein, "protein")} · C ${formatFoodNumber(totals.carbs, "carbs")} · F ${formatFoodNumber(totals.fat, "fat")} · Fi ${formatFoodNumber(totals.fiber, "fiber")}`;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.innerHTML = ICONS["trash-2"];
  remove.title = "Remove food";
  remove.addEventListener("click", () => {
    meal.items = meal.items.filter((nextItem) => nextItem.id !== item.id);
    saveFoodCard(card, dateKey, { rerender: true });
  });
  row.append(name, amount, unit, macros, remove);
  return row;
}

function renderFoodLibraryEditor(card) {
  const details = document.createElement("details");
  details.className = "food-library-panel";
  details.open = Boolean(card.foodLibraryOpen);
  details.addEventListener("toggle", () => {
    card.foodLibraryOpen = details.open;
    saveState({ quiet: true });
  });
  const summary = document.createElement("summary");
  summary.innerHTML = `<strong>Food library</strong><span>${card.foodLibrary.length} foods</span>`;
  const list = document.createElement("div");
  list.className = "food-library-list";
  card.foodLibrary.forEach((food) => list.append(renderFoodLibraryRow(card, food)));
  const add = document.createElement("button");
  add.type = "button";
  add.className = "food-library-add";
  add.innerHTML = `${ICONS.plus}<span>Add custom food</span>`;
  add.addEventListener("click", () => {
    card.foodLibrary.push(normalizeFoodDefinition({
      id: createId(),
      name: "New food",
      servingUnit: "100g",
      servingGrams: 100,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      source: "Custom"
    }));
    saveState();
    renderCardsOnly({ force: true });
  });
  const note = document.createElement("p");
  note.className = "food-source-note";
  note.textContent = "Nutrition values are per serving. Serving label is what appears in the meal unit dropdown; grams per serving lets gram entries calculate correctly. Example: rice is 130 kcal per 100g, egg is 78 kcal per egg.";
  details.append(summary, list, add, note);
  return details;
}

function renderFoodLibraryRow(card, food) {
  const row = document.createElement("div");
  row.className = "food-library-row";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.innerHTML = ICONS["trash-2"];
  remove.title = "Remove food from library";
  remove.disabled = card.foodLibrary.length <= 1;
  remove.addEventListener("click", () => {
    card.foodLibrary = card.foodLibrary.filter((item) => item.id !== food.id);
    saveState();
    renderCardsOnly({ force: true });
  });

  const top = document.createElement("div");
  top.className = "food-library-top";
  top.append(
    createFoodTextField("Food name", food.name, (value) => updateFoodDefinition(card, food.id, { name: value || "Food" })),
    remove
  );

  const serving = document.createElement("div");
  serving.className = "food-library-serving-grid";
  serving.append(
    createFoodTextField("Serving label", food.servingUnit, (value) => updateFoodDefinition(card, food.id, { servingUnit: value || "unit" })),
    createFoodNumberField("g per serving", food.servingGrams, (value) => updateFoodDefinition(card, food.id, { servingGrams: value }), { step: "1" }),
    createFoodNumberField("kcal per serving", food.calories, (value) => updateFoodDefinition(card, food.id, { calories: value }), { step: "1" })
  );

  const macros = document.createElement("div");
  macros.className = "food-library-macro-grid";
  [
    ["Protein g", "protein"],
    ["Carbs g", "carbs"],
    ["Fat g", "fat"],
    ["Fiber g", "fiber"]
  ].forEach(([label, key]) => {
    macros.append(createFoodNumberField(label, food[key], (value) => updateFoodDefinition(card, food.id, { [key]: value }), { step: "0.1" }));
  });

  const source = document.createElement("small");
  source.textContent = food.source || "Custom";
  row.append(top, serving, macros, source);
  return row;
}

function createFoodTextField(label, value, onInput) {
  const field = document.createElement("label");
  field.className = "food-field";
  const span = document.createElement("span");
  span.textContent = label;
  span.title = label;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.title = label;
  input.addEventListener("input", () => onInput(normalizeLabel(input.value)));
  input.addEventListener("change", () => renderCardsOnly({ force: true }));
  field.append(span, input);
  return field;
}

function createFoodNumberField(label, value, onInput, options = {}) {
  const field = document.createElement("label");
  field.className = "food-field";
  const span = document.createElement("span");
  span.textContent = label;
  span.title = label;
  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = "decimal";
  input.min = "0";
  input.step = options.step || "0.1";
  input.value = value === "" || value === null || typeof value === "undefined" ? "" : String(value);
  input.title = label;
  input.addEventListener("input", () => onInput(normalizeOptionalNumber(input.value)));
  input.addEventListener("change", () => {
    if (typeof options.onCommit === "function") options.onCommit(input.value);
  });
  field.append(span, input);
  return field;
}

function updateFoodDefinition(card, foodId, updates) {
  const index = card.foodLibrary.findIndex((food) => food.id === foodId);
  if (index < 0) return;
  card.foodLibrary[index] = normalizeFoodDefinition({
    ...card.foodLibrary[index],
    ...updates,
    id: foodId
  });
  saveState({ quiet: true });
}

function addFoodItemToMeal(card, dateKey, mealId, foodId) {
  const entry = getFoodEntry(card, dateKey);
  const meal = entry.meals.find((item) => item.id === mealId) || entry.meals[0];
  const food = getFoodById(card, foodId);
  if (!meal || !food) return;
  meal.items.push({
    id: createId(),
    foodId,
    amount: food.servingUnit === "100g" ? 100 : 1,
    unit: food.servingUnit === "100g" ? "g" : "serving",
    ...createFoodItemSnapshot(food)
  });
  card.activeFoodMealId = meal.id;
  saveFoodCard(card, dateKey, { rerender: true });
}

function removeFoodMeal(card, dateKey, mealId) {
  const entry = getFoodEntry(card, dateKey);
  if (entry.meals.length <= 1) return;
  entry.meals = entry.meals.filter((meal) => meal.id !== mealId);
  card.activeFoodMealId = entry.meals[0]?.id || "";
  saveFoodCard(card, dateKey, { rerender: true });
}

function saveFoodCard(card, dateKey, options = {}) {
  const entry = getFoodEntry(card, dateKey);
  entry.updatedAt = Date.now();
  card.foodEntries[dateKey] = normalizeFoodEntry(entry);
  saveState({ quiet: true });
  if (options.rerender) renderCardsOnly({ force: true });
}

function getFoodStatusLabel(totals, target) {
  if (!totals.calories) return "Ready to log";
  if (target.calories && totals.calories > target.calories * 1.05) return "Over calorie target";
  if (target.protein && totals.protein < target.protein * 0.7) return "Protein left";
  return "On track";
}

function formatFoodDateTitle(dateKey) {
  const date = dateKeyToLocalDate(dateKey);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatFoodNumber(value, key) {
  const number = Number(value) || 0;
  const decimals = FOOD_NUTRIENT_META[key]?.decimals ?? 1;
  if (decimals === 0) return String(Math.round(number));
  return number.toFixed(decimals).replace(/\.?0+$/, "");
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
  if (card.type === "daily") {
    const plannerLinks = renderDailyPlannerLinks(card);
    if (plannerLinks) wrapper.append(plannerLinks);
    wrapper.append(renderDailyAddForm(card));
  }
  return wrapper;
}

function renderDailyPlannerLinks(card) {
  const dateKey = getCardPlanDate(card);
  const items = getPlannerItemsForDate(dateKey, getPlannerGroup(card));
  if (!items.length) return null;

  const wrapper = document.createElement("div");
  wrapper.className = "daily-planner-links";
  const head = document.createElement("div");
  head.className = "daily-planner-links-head";
  const title = document.createElement("strong");
  title.textContent = "From planner";
  const count = document.createElement("span");
  count.textContent = `${items.length}`;
  head.append(title, count);
  wrapper.append(head);

  items.slice(0, 3).forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "daily-planner-link";
    row.title = "Open planner date";
    row.addEventListener("click", () => setPlannerDate(item.card, item.dateKey));
    row.textContent = item.title;
    wrapper.append(row);
  });

  if (items.length > 3) {
    const more = document.createElement("p");
    more.textContent = `+${items.length - 3} more in planner`;
    wrapper.append(more);
  }

  return wrapper;
}

function renderDailyAddForm(card) {
  const form = document.createElement("form");
  form.className = "daily-add-row";
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 120;
  input.value = card.dailyDraftText || "";
  input.placeholder = getCardPlanDate(card) === getTodayKey() ? "Add something for today" : "Add item for this day";
  input.setAttribute("aria-label", "Add to-do item");
  input.addEventListener("input", () => {
    card.dailyDraftText = input.value;
    persistLocalDraftState();
  });
  const button = document.createElement("button");
  button.type = "submit";
  button.title = "Add item";
  button.setAttribute("aria-label", "Add item");
  button.innerHTML = ICONS.plus;
  form.append(input, button);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!addDailyItemToCard(card, input.value)) return;
    card.dailyDraftText = "";
    persistLocalDraftState();
  });
  return form;
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

function normalizePlannerCard(card) {
  if (!card || card.type !== "planner") return card;
  const today = getTodayKey();
  card.plannerGroup = getPlannerGroup(card);
  card.plannerEntries = card.plannerEntries && typeof card.plannerEntries === "object" ? card.plannerEntries : {};
  card.activePlannerDate = normalizeDateKey(card.activePlannerDate) || today;
  Object.keys(card.plannerEntries).forEach((dateKey) => {
    const normalizedDate = normalizeDateKey(dateKey);
    if (!normalizedDate) {
      delete card.plannerEntries[dateKey];
      return;
    }
    card.plannerEntries[normalizedDate] = normalizePlannerEntry(card.plannerEntries[dateKey]);
    if (normalizedDate !== dateKey) delete card.plannerEntries[dateKey];
  });
  if (!card.plannerEntries[card.activePlannerDate]) {
    card.plannerEntries[card.activePlannerDate] = normalizePlannerEntry();
  }
  return card;
}

function normalizePlannerEntry(entry = {}) {
  const note = cleanPlannerNote(entry.note || entry.text || "");
  const savedChecks = entry.checkedItems && typeof entry.checkedItems === "object" ? entry.checkedItems : entry.doneItems || {};
  const savedCarryovers = entry.carryoverItems && typeof entry.carryoverItems === "object" ? entry.carryoverItems : {};
  const savedRecords = entry.itemRecords && typeof entry.itemRecords === "object" ? entry.itemRecords : {};
  const checkedItems = {};
  const carryoverItems = {};
  const itemRecords = {};
  getPlannerNoteLines(note).forEach((line) => {
    const key = getPlannerItemKey(line);
    const savedCheck = savedChecks[key] || savedChecks[line];
    if (savedCheck) checkedItems[key] = normalizePlannerDoneRecord(savedCheck);
    const carryover = savedCarryovers[key] || savedCarryovers[line];
    const fromDate = normalizeDateKey(carryover?.fromDate || carryover);
    if (fromDate) {
      carryoverItems[key] = {
        fromDate,
        carriedAt: Number.isFinite(Number(carryover?.carriedAt)) ? Number(carryover.carriedAt) : 0
      };
    }
    const record = savedRecords[key] || savedRecords[line];
    const createdAt = normalizeTimestamp(record?.createdAt || record || entry.updatedAt);
    itemRecords[key] = {
      createdAt: createdAt || 0
    };
  });
  return {
    note,
    checkedItems,
    carryoverItems,
    itemRecords,
    updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : 0
  };
}

function normalizePlannerDoneRecord(value) {
  if (!value) return null;
  if (value === true) {
    return { completedAt: 0 };
  }
  if (typeof value === "object") {
    return {
      completedAt: Number.isFinite(Number(value.completedAt)) ? Number(value.completedAt) : 0
    };
  }
  return { completedAt: 0 };
}

function getPlannerCompletedAt(entry, itemKey) {
  const doneRecord = normalizePlannerDoneRecord(entry?.checkedItems?.[itemKey]);
  return Number(doneRecord?.completedAt) || 0;
}

function getPlannerEntryCarryoverDate(entry, itemKey, fallbackDate) {
  const carryover = entry?.carryoverItems?.[itemKey];
  return normalizeDateKey(carryover?.fromDate || carryover) || normalizeDateKey(fallbackDate);
}

function getPlannerItemCreatedAt(entry, itemKey) {
  return normalizeTimestamp(entry?.itemRecords?.[itemKey]?.createdAt) || normalizeTimestamp(entry?.updatedAt);
}

function wasPlannerItemCreatedOnOrAfter(entry, itemKey, dateKey) {
  const createdAt = getPlannerItemCreatedAt(entry, itemKey);
  if (!createdAt) return false;
  return createdAt >= dateKeyToLocalDate(dateKey).getTime();
}

function isTimestampOnDate(timestamp, dateKey) {
  const time = normalizeTimestamp(timestamp);
  const normalizedDate = normalizeDateKey(dateKey);
  if (!time || !normalizedDate) return false;
  return getTodayKey(new Date(time)) === normalizedDate;
}

function getPlannerCompletionTimestamp(dateKey) {
  const normalizedDate = normalizeDateKey(dateKey) || getTodayKey();
  const now = new Date();
  const completionDate = dateKeyToLocalDate(normalizedDate);
  completionDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return completionDate.getTime();
}

function ensureCompletedTodayCopyForSourceTask(card, sourceDate, title, completedAt = Date.now()) {
  const todayKey = getTodayKey();
  const normalizedSourceDate = normalizeDateKey(sourceDate);
  if (!card || !normalizedSourceDate || normalizedSourceDate === todayKey) return false;
  if (dateKeyToLocalDate(normalizedSourceDate).getTime() >= dateKeyToLocalDate(todayKey).getTime()) return false;
  if (!isTimestampOnDate(completedAt, todayKey)) return false;

  const itemKey = getPlannerItemKey(title);
  if (!itemKey) return false;
  const sourceEntry = normalizePlannerEntry(card.plannerEntries?.[normalizedSourceDate] || {});
  const todayEntry = getPlannerEntry(card, todayKey);
  const lines = getPlannerNoteLines(todayEntry.note);
  if (!lines.some((line) => getPlannerItemKey(line) === itemKey)) {
    lines.push(title);
  }
  const checkedItems = { ...(todayEntry.checkedItems || {}) };
  const carryoverItems = { ...(todayEntry.carryoverItems || {}) };
  const itemRecords = { ...(todayEntry.itemRecords || {}) };
  checkedItems[itemKey] = { completedAt };
  carryoverItems[itemKey] = {
    fromDate: getPlannerEntryCarryoverDate(sourceEntry, itemKey, normalizedSourceDate),
    carriedAt: Date.now()
  };
  itemRecords[itemKey] = itemRecords[itemKey] || { createdAt: completedAt };
  card.plannerEntries[todayKey] = normalizePlannerEntry({
    ...todayEntry,
    note: buildPlannerNote(lines),
    checkedItems,
    carryoverItems,
    itemRecords,
    updatedAt: Date.now()
  });
  return true;
}

function removeCarryoverCopyForSourceTask(card, sourceDate, title) {
  const todayKey = getTodayKey();
  const normalizedSourceDate = normalizeDateKey(sourceDate);
  if (!card || !normalizedSourceDate || normalizedSourceDate === todayKey) return false;
  if (dateKeyToLocalDate(normalizedSourceDate).getTime() >= dateKeyToLocalDate(todayKey).getTime()) return false;

  const todayEntry = getPlannerEntry(card, todayKey);
  const itemKey = getPlannerItemKey(title);
  if (!itemKey) return false;
  const carryoverDate = getPlannerEntryCarryoverDate(todayEntry, itemKey, "");
  if (carryoverDate !== normalizedSourceDate) return false;

  const lines = getPlannerNoteLines(todayEntry.note).filter((line) => getPlannerItemKey(line) !== itemKey);
  const checkedItems = { ...(todayEntry.checkedItems || {}) };
  const carryoverItems = { ...(todayEntry.carryoverItems || {}) };
  const itemRecords = { ...(todayEntry.itemRecords || {}) };
  delete checkedItems[itemKey];
  delete carryoverItems[itemKey];
  delete itemRecords[itemKey];

  card.plannerEntries[todayKey] = normalizePlannerEntry({
    ...todayEntry,
    note: buildPlannerNote(lines),
    checkedItems,
    carryoverItems,
    itemRecords,
    updatedAt: Date.now()
  });
  return true;
}

function removeLinkedCarryoverCopiesAfterDate(card, sourceDate, title, afterDate) {
  const itemKey = getPlannerItemKey(title);
  const normalizedSourceDate = normalizeDateKey(sourceDate);
  const normalizedAfterDate = normalizeDateKey(afterDate);
  if (!card || !itemKey || !normalizedSourceDate || !normalizedAfterDate) return false;
  const afterTime = dateKeyToLocalDate(normalizedAfterDate).getTime();
  let changed = false;

  Object.entries(card.plannerEntries || {}).forEach(([dateKey, entry]) => {
    const plannerDate = normalizeDateKey(dateKey);
    if (!plannerDate || dateKeyToLocalDate(plannerDate).getTime() <= afterTime) return;
    const normalizedEntry = normalizePlannerEntry(entry);
    if (getPlannerEntryCarryoverDate(normalizedEntry, itemKey, "") !== normalizedSourceDate) return;
    const lines = getPlannerNoteLines(normalizedEntry.note);
    const nextLines = lines.filter((line) => getPlannerItemKey(line) !== itemKey);
    if (nextLines.length === lines.length) return;

    const checkedItems = { ...(normalizedEntry.checkedItems || {}) };
    const carryoverItems = { ...(normalizedEntry.carryoverItems || {}) };
    const itemRecords = { ...(normalizedEntry.itemRecords || {}) };
    delete checkedItems[itemKey];
    delete carryoverItems[itemKey];
    delete itemRecords[itemKey];

    card.plannerEntries[plannerDate] = normalizePlannerEntry({
      ...normalizedEntry,
      note: buildPlannerNote(nextLines),
      checkedItems,
      carryoverItems,
      itemRecords,
      updatedAt: Date.now()
    });
    changed = true;
  });

  return changed;
}

function getPlannerCardsForMaintenance() {
  const cards = [...state.cards, ...getArchivedCards()];
  (state.boards || []).forEach((board) => {
    if (board.id === state.activeBoardId) return;
    cards.push(...(Array.isArray(board.cards) ? board.cards : []));
    cards.push(...(Array.isArray(board.archivedCards) ? board.archivedCards : []));
  });
  return cards.filter((card) => card?.type === "planner");
}

function plannerEntryHasCarryoverFromSource(card, itemKey, sourceDate) {
  return Object.values(card.plannerEntries || {}).some((entry) => getPlannerEntryCarryoverDate(normalizePlannerEntry(entry), itemKey, "") === sourceDate);
}

function getPlannerStaleRenameCandidate(card, sourceDate, newKey) {
  const sourceEntry = normalizePlannerEntry(card.plannerEntries?.[sourceDate] || {});
  const candidates = new Map();
  const rememberCandidate = (line, entry = sourceEntry) => {
    const itemKey = getPlannerItemKey(line);
    if (!itemKey || itemKey === newKey) return;
    if (entry.checkedItems?.[itemKey]) return;
    if (!plannerEntryHasCarryoverFromSource(card, itemKey, sourceDate)) return;
    candidates.set(itemKey, { title: line, key: itemKey });
  };

  getPlannerNoteLines(sourceEntry.note).forEach((line) => rememberCandidate(line, sourceEntry));
  Object.values(card.plannerEntries || {}).forEach((entry) => {
    const normalizedEntry = normalizePlannerEntry(entry);
    getPlannerNoteLines(normalizedEntry.note).forEach((line) => {
      const itemKey = getPlannerItemKey(line);
      if (getPlannerEntryCarryoverDate(normalizedEntry, itemKey, "") === sourceDate) {
        rememberCandidate(line, normalizedEntry);
      }
    });
  });

  const uniqueCandidates = [...candidates.values()];
  return uniqueCandidates.length === 1 ? uniqueCandidates[0] : null;
}

function rewritePlannerLinkedEntries(card, { sourceDate, completedDate, oldTitle, newTitle, completedAt }) {
  const oldKey = getPlannerItemKey(oldTitle);
  const newKey = getPlannerItemKey(newTitle);
  const sourceTime = dateKeyToLocalDate(sourceDate).getTime();
  const completedTime = dateKeyToLocalDate(completedDate).getTime();
  let changed = false;

  Object.entries(card.plannerEntries || {}).forEach(([dateKey, entry]) => {
    const plannerDate = normalizeDateKey(dateKey);
    if (!plannerDate) return;
    const plannerTime = dateKeyToLocalDate(plannerDate).getTime();
    if (plannerTime < sourceTime) return;

    const normalizedEntry = normalizePlannerEntry(entry);
    const lines = getPlannerNoteLines(normalizedEntry.note);
    const isSourceEntry = plannerDate === sourceDate;
    const isOldCarryover = getPlannerEntryCarryoverDate(normalizedEntry, oldKey, "") === sourceDate;
    const isNewCarryover = getPlannerEntryCarryoverDate(normalizedEntry, newKey, "") === sourceDate;
    const hasOldLine = lines.some((line) => getPlannerItemKey(line) === oldKey);
    const hasNewLine = lines.some((line) => getPlannerItemKey(line) === newKey);
    if (!isSourceEntry && !isOldCarryover && !isNewCarryover && !hasOldLine) return;

    const checkedItems = { ...(normalizedEntry.checkedItems || {}) };
    const carryoverItems = { ...(normalizedEntry.carryoverItems || {}) };
    const itemRecords = { ...(normalizedEntry.itemRecords || {}) };
    let entryChanged = false;
    let insertedNewLine = hasNewLine;
    const nextLines = [];

    lines.forEach((line) => {
      const itemKey = getPlannerItemKey(line);
      if (itemKey === oldKey) {
        if (plannerTime > completedTime) {
          entryChanged = true;
          return;
        }
        if (!insertedNewLine) {
          nextLines.push(newTitle);
          insertedNewLine = true;
        }
        entryChanged = true;
        return;
      }
      if (itemKey === newKey && plannerTime > completedTime && (isNewCarryover || isOldCarryover)) {
        entryChanged = true;
        return;
      }
      nextLines.push(line);
    });

    if (plannerTime <= completedTime && (isSourceEntry || isOldCarryover || isNewCarryover || hasOldLine || hasNewLine)) {
      if (checkedItems[oldKey] && !checkedItems[newKey]) checkedItems[newKey] = checkedItems[oldKey];
      checkedItems[newKey] = { completedAt };
      if (carryoverItems[oldKey] || isOldCarryover) {
        carryoverItems[newKey] = {
          ...(carryoverItems[newKey] || carryoverItems[oldKey] || {}),
          fromDate: sourceDate,
          carriedAt: carryoverItems[newKey]?.carriedAt || carryoverItems[oldKey]?.carriedAt || Date.now()
        };
      }
      if (isSourceEntry) delete carryoverItems[newKey];
      if (itemRecords[oldKey]) itemRecords[newKey] = mergePlannerItemRecord(itemRecords[newKey], itemRecords[oldKey]);
      itemRecords[newKey] = itemRecords[newKey] || { createdAt: completedAt };
      entryChanged = true;
    }

    delete checkedItems[oldKey];
    delete carryoverItems[oldKey];
    delete itemRecords[oldKey];

    if (plannerTime > completedTime && (isOldCarryover || isNewCarryover)) {
      delete checkedItems[newKey];
      delete carryoverItems[newKey];
      delete itemRecords[newKey];
      entryChanged = true;
    }

    if (!entryChanged) return;
    card.plannerEntries[plannerDate] = normalizePlannerEntry({
      ...normalizedEntry,
      note: buildPlannerNote(nextLines),
      checkedItems,
      carryoverItems,
      itemRecords,
      updatedAt: Date.now()
    });
    changed = true;
  });

  return changed;
}

function repairPlannerRenamedCompletedCarryovers() {
  let changed = false;
  getPlannerCardsForMaintenance().forEach((card) => {
    normalizePlannerCard(card);
    Object.entries(card.plannerEntries || {}).forEach(([dateKey, entry]) => {
      const completedDate = normalizeDateKey(dateKey);
      if (!completedDate) return;
      const normalizedEntry = normalizePlannerEntry(entry);
      getPlannerNoteLines(normalizedEntry.note).forEach((line) => {
        const newKey = getPlannerItemKey(line);
        const sourceDate = getPlannerEntryCarryoverDate(normalizedEntry, newKey, "");
        const completedAt = getPlannerCompletedAt(normalizedEntry, newKey);
        if (!sourceDate || !completedAt || sourceDate === completedDate) return;
        if (dateKeyToLocalDate(sourceDate).getTime() > dateKeyToLocalDate(completedDate).getTime()) return;
        const staleCandidate = getPlannerStaleRenameCandidate(card, sourceDate, newKey);
        if (staleCandidate && rewritePlannerLinkedEntries(card, { sourceDate, completedDate, oldTitle: staleCandidate.title, newTitle: line, completedAt })) {
          changed = true;
          return;
        }
        if (removeLinkedCarryoverCopiesAfterDate(card, sourceDate, line, completedDate)) {
          changed = true;
        }
      });
    });
  });
  if (changed) saveState({ quiet: true });
}

function carryPlannerIncompleteTasksToToday() {
  const todayKey = getTodayKey();
  const todayTime = dateKeyToLocalDate(todayKey).getTime();
  const plannerCards = getPlannerCardsForMaintenance();
  let changed = false;

  plannerCards.forEach((card) => {
    normalizePlannerCard(card);
    const todayEntry = getPlannerEntry(card, todayKey);
    const todayLines = getPlannerNoteLines(todayEntry.note);
    const checkedItems = { ...(todayEntry.checkedItems || {}) };
    const carryoverItems = { ...(todayEntry.carryoverItems || {}) };
    const itemRecords = { ...(todayEntry.itemRecords || {}) };
    let cardChanged = false;
    const nextLines = todayLines.filter((line) => {
      const itemKey = getPlannerItemKey(line);
      const sourceDate = getPlannerEntryCarryoverDate(todayEntry, itemKey, "");
      if (!sourceDate) return true;
      const sourceEntry = normalizePlannerEntry(card.plannerEntries?.[sourceDate] || {});
      const sourceLines = getPlannerNoteLines(sourceEntry.note);
      const sourceExists = sourceLines.some((sourceLine) => getPlannerItemKey(sourceLine) === itemKey);
      const sourceCompletedAt = getPlannerCompletedAt(sourceEntry, itemKey);
      const sourceCompletedToday = sourceExists && isTimestampOnDate(sourceCompletedAt, todayKey);
      if (sourceCompletedToday) {
        if (!checkedItems[itemKey] || Number(checkedItems[itemKey].completedAt || 0) !== sourceCompletedAt) cardChanged = true;
        checkedItems[itemKey] = { completedAt: sourceCompletedAt };
        carryoverItems[itemKey] = carryoverItems[itemKey] || {
          fromDate: getPlannerEntryCarryoverDate(sourceEntry, itemKey, sourceDate),
          carriedAt: Date.now()
        };
        itemRecords[itemKey] = itemRecords[itemKey] || { createdAt: sourceCompletedAt };
        return true;
      }
      const sourceStillOpen = sourceExists && !sourceEntry.checkedItems[itemKey];
      if (sourceStillOpen) return true;
      delete checkedItems[itemKey];
      delete carryoverItems[itemKey];
      delete itemRecords[itemKey];
      cardChanged = true;
      return false;
    });
    const todayKeys = new Set(nextLines.map(getPlannerItemKey));

    Object.entries(card.plannerEntries || {})
      .sort(([leftDate], [rightDate]) => {
        const leftKey = normalizeDateKey(leftDate);
        const rightKey = normalizeDateKey(rightDate);
        const leftTime = leftKey ? dateKeyToLocalDate(leftKey).getTime() : 0;
        const rightTime = rightKey ? dateKeyToLocalDate(rightKey).getTime() : 0;
        return leftTime - rightTime;
      })
      .forEach(([dateKey, entry]) => {
        const sourceDate = normalizeDateKey(dateKey);
        if (!sourceDate || sourceDate === todayKey) return;
        if (dateKeyToLocalDate(sourceDate).getTime() >= todayTime) return;
        const sourceEntry = normalizePlannerEntry(entry);
        getPlannerNoteLines(sourceEntry.note).forEach((line) => {
          const itemKey = getPlannerItemKey(line);
          if (!itemKey || todayKeys.has(itemKey)) return;
          const sourceCompletedAt = getPlannerCompletedAt(sourceEntry, itemKey);
          if (isTimestampOnDate(sourceCompletedAt, todayKey)) {
            nextLines.push(line);
            todayKeys.add(itemKey);
            checkedItems[itemKey] = { completedAt: sourceCompletedAt };
            carryoverItems[itemKey] = {
              fromDate: getPlannerEntryCarryoverDate(sourceEntry, itemKey, sourceDate),
              carriedAt: Date.now()
            };
            itemRecords[itemKey] = itemRecords[itemKey] || { createdAt: sourceCompletedAt };
            cardChanged = true;
            return;
          }
          if (sourceEntry.checkedItems[itemKey]) return;
          nextLines.push(line);
          todayKeys.add(itemKey);
          carryoverItems[itemKey] = {
            fromDate: getPlannerEntryCarryoverDate(sourceEntry, itemKey, sourceDate),
            carriedAt: Date.now()
          };
          cardChanged = true;
        });
      });

    if (!cardChanged) return;
    card.plannerEntries[todayKey] = normalizePlannerEntry({
      ...todayEntry,
      note: buildPlannerNote(nextLines),
      checkedItems,
      carryoverItems,
      itemRecords,
      updatedAt: Date.now()
    });
    changed = true;
  });

  if (changed) {
    saveState({ quiet: true });
  }
}

function getPlannerItemKey(value) {
  return normalizeLabel(value).toLowerCase();
}

function formatPlannerNoteForEditing(value) {
  const note = cleanPlannerNote(value);
  if (!note) return "";
  return note
    .split("\n")
    .map((line) => {
      const text = stripPlannerBullet(line);
      return text ? `- ${text}` : "";
    })
    .join("\n");
}

function cleanPlannerNote(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(stripPlannerBullet)
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
}

function getPlannerNoteLines(value) {
  return cleanPlannerNote(value)
    .split("\n")
    .map(stripPlannerBullet)
    .filter(Boolean);
}

function countPlannerNoteLines(value) {
  return getPlannerNoteLines(value).length;
}

function stripPlannerBullet(value) {
  return String(value || "")
    .replace(/^\s*[-*]\s*/, "")
    .trim();
}

function preparePlannerBulletTextarea(textarea) {
  if (!textarea) return;
  if (!textarea.value.trim()) {
    textarea.value = "- ";
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
    return;
  }
  const formatted = formatPlannerNoteForEditing(textarea.value);
  if (formatted && formatted !== textarea.value) {
    const cursor = Math.min(formatted.length, textarea.selectionStart || formatted.length);
    textarea.value = formatted;
    textarea.selectionStart = cursor;
    textarea.selectionEnd = cursor;
  }
}

function handlePlannerBulletKeydown(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const textarea = event.currentTarget;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const insert = before.endsWith("\n") || before.length === 0 ? "- " : "\n- ";
  textarea.value = `${before}${insert}${after}`;
  const nextPosition = before.length + insert.length;
  textarea.selectionStart = nextPosition;
  textarea.selectionEnd = nextPosition;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function autoGrowTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function getActivePlannerDate(card) {
  if (!card || card.type !== "planner") return getTodayKey();
  normalizePlannerCard(card);
  return normalizeDateKey(card.activePlannerDate) || getTodayKey();
}

function getPlannerEntry(card, dateKey = getActivePlannerDate(card)) {
  normalizePlannerCard(card);
  const normalizedDate = normalizeDateKey(dateKey) || getTodayKey();
  if (!card.plannerEntries[normalizedDate]) {
    card.plannerEntries[normalizedDate] = normalizePlannerEntry();
  }
  return card.plannerEntries[normalizedDate];
}

function updatePlannerEntry(card, dateKey, updates, options = {}) {
  const normalizedDate = normalizeDateKey(dateKey) || getTodayKey();
  const current = getPlannerEntry(card, normalizedDate);
  card.plannerEntries[normalizedDate] = normalizePlannerEntry({
    ...current,
    ...updates,
    updatedAt: Date.now()
  });
  saveState();
  if (options.rerender) {
    renderCardsOnly(options.forceRender ? { force: true } : {});
  }
}

function getPlannerLineIndex(lines, item) {
  if (Number.isInteger(item?.lineIndex) && getPlannerItemKey(lines[item.lineIndex]) === getPlannerItemKey(item.title)) {
    return item.lineIndex;
  }
  return lines.findIndex((line) => getPlannerItemKey(line) === getPlannerItemKey(item?.title));
}

function togglePlannerTaskDone(item) {
  if (!item?.card || !item.dateKey) return;
  const entry = getPlannerEntry(item.card, item.dateKey);
  const checkedItems = { ...(entry.checkedItems || {}) };
  const key = getPlannerItemKey(item.title);
  const nextDone = !checkedItems[key];
  const completedAt = nextDone ? getPlannerCompletionTimestamp(item.dateKey) : 0;
  if (checkedItems[key]) {
    delete checkedItems[key];
  } else {
    checkedItems[key] = { completedAt };
  }
  if (nextDone && !item.isCarryover) {
    const copiedToToday = ensureCompletedTodayCopyForSourceTask(item.card, item.dateKey, item.title, completedAt);
    if (!copiedToToday) {
      removeCarryoverCopyForSourceTask(item.card, item.dateKey, item.title);
    }
  }
  if (!nextDone && !item.isCarryover) {
    removeCarryoverCopyForSourceTask(item.card, item.dateKey, item.title);
  }
  syncCarryoverSourceTask(item, nextDone, completedAt);
  if (nextDone) {
    const sourceDate = item.isCarryover ? normalizeDateKey(item.carryoverFrom) : normalizeDateKey(item.dateKey);
    removeLinkedCarryoverCopiesAfterDate(item.card, sourceDate, item.title, item.dateKey);
  }
  updatePlannerEntry(item.card, item.dateKey, { checkedItems }, { rerender: true });
}

function deletePlannerTask(item) {
  if (!item?.card || !item.dateKey) return;
  const entry = getPlannerEntry(item.card, item.dateKey);
  const lines = getPlannerNoteLines(entry.note);
  const lineIndex = getPlannerLineIndex(lines, item);
  if (lineIndex < 0) return;
  const [removed] = lines.splice(lineIndex, 1);
  const checkedItems = { ...(entry.checkedItems || {}) };
  delete checkedItems[getPlannerItemKey(removed)];
  removeCarryoverCopyForSourceTask(item.card, item.dateKey, removed);
  syncCarryoverSourceTask(item, true, Date.now());
  updatePlannerEntry(
    item.card,
    item.dateKey,
    {
      note: lines.map((line) => `- ${line}`).join("\n"),
      checkedItems
    },
    { rerender: true }
  );
}

function syncCarryoverSourceTask(item, done, completedAt = Date.now()) {
  const sourceDate = normalizeDateKey(item?.carryoverFrom);
  if (!item?.card || !item?.isCarryover || !sourceDate || sourceDate === item.dateKey) return;
  const itemKey = getPlannerItemKey(item.title);
  const targetTime = dateKeyToLocalDate(item.dateKey).getTime();
  Object.entries(item.card.plannerEntries || {}).forEach(([dateKey, entry]) => {
    const plannerDate = normalizeDateKey(dateKey);
    if (!plannerDate || dateKeyToLocalDate(plannerDate).getTime() >= targetTime) return;
    const sourceEntry = normalizePlannerEntry(entry);
    const sourceLines = getPlannerNoteLines(sourceEntry.note);
    if (!sourceLines.some((line) => getPlannerItemKey(line) === itemKey)) return;
    const sourceChecks = { ...(sourceEntry.checkedItems || {}) };
    if (done) {
      sourceChecks[itemKey] = { completedAt };
    } else {
      delete sourceChecks[itemKey];
    }
    item.card.plannerEntries[plannerDate] = normalizePlannerEntry({
      ...sourceEntry,
      checkedItems: sourceChecks,
      updatedAt: Date.now()
    });
  });
}

function getDefaultPlannerViewAddDate(view, options = {}) {
  const mode = normalizePlannerViewMode(view);
  const viewOptions = normalizePlannerViewOptions(options);
  const timeline = getPlannerTimelineMeta();
  if (mode === "today") return timeline.todayKey;
  if (mode === "week") return viewOptions.excludeToday ? timeline.tomorrowKey : timeline.todayKey;
  if (mode === "month") {
    if (viewOptions.excludeWeek) return timeline.nextWeekKey;
    return viewOptions.excludeToday ? timeline.tomorrowKey : timeline.todayKey;
  }
  if (viewOptions.excludeMonth) return timeline.nextMonthKey;
  if (viewOptions.excludeWeek) return timeline.nextWeekKey;
  return viewOptions.excludeToday ? timeline.tomorrowKey : timeline.todayKey;
}

function getPlannerWriteSourceCard(planlistCard, dateKey) {
  const group = getPlannerGroup(planlistCard);
  let source = state.cards.find((card) => card.type === "planner" && getPlannerGroup(card) === group);
  if (source) return source;
  source = getArchivedCards().find((card) => card.type === "planner" && getPlannerGroup(card) === group);
  if (source) return source;
  source = makeCard({
    title: `${group} planner`,
    description: "Source planner for dated tasks added from Planner-view cards.",
    category: group,
    type: "planner",
    theme: planlistCard.theme || getThemeForCategory(group),
    background: planlistCard.background || "clean",
    timerMode: "none",
    activePlannerDate: normalizeDateKey(dateKey) || getTodayKey(),
    plannerEntries: {}
  });
  source.order = nextOrder();
  state.cards.push(source);
  return source;
}

function addPlannerTaskFromPlannerView(planlistCard, dateKey, value) {
  const text = stripPlannerBullet(value);
  if (!text) return false;
  const normalizedDate = normalizeDateKey(dateKey) || getTodayKey();
  const source = getPlannerWriteSourceCard(planlistCard, normalizedDate);
  return addPlannerTaskToDate(source, normalizedDate, text);
}

function addPlannerTaskToDate(card, dateKey, value) {
  const text = stripPlannerBullet(value);
  if (!text) return false;
  const normalizedDate = normalizeDateKey(dateKey) || getTodayKey();
  const current = getPlannerEntry(card, normalizedDate);
  const lines = getPlannerNoteLines(current.note);
  const itemRecords = { ...(current.itemRecords || {}) };
  lines.push(text);
  itemRecords[getPlannerItemKey(text)] = { createdAt: Date.now() };
  card.activePlannerDate = normalizedDate;
  updatePlannerEntry(
    card,
    normalizedDate,
    {
      note: buildPlannerNote(lines),
      itemRecords
    },
    { rerender: true, forceRender: true }
  );
  return true;
}

function addDailyItemToCard(card, value) {
  const text = normalizeLabel(String(value || ""));
  if (!text || !card || card.type !== "daily") return false;
  card.items = Array.isArray(card.items) ? card.items : [];
  card.items.push({
    id: createId(),
    text,
    done: false
  });
  saveState();
  renderCardsOnly();
  return true;
}

function setPlannerDate(card, dateKey) {
  card.activePlannerDate = normalizeDateKey(dateKey) || getTodayKey();
  getPlannerEntry(card, card.activePlannerDate);
  saveState();
  renderCardsOnly();
}

function getPlannerViewDate(card) {
  return normalizeDateKey(card?.plannerViewDate) || getTodayKey();
}

function setPlannerViewDate(card, dateKey) {
  if (!card || card.type !== "planlist") return;
  card.plannerViewDate = normalizeDateKey(dateKey) || getTodayKey();
  saveState();
  renderCardsOnly();
}

function shiftPlannerViewDate(card, dayDelta) {
  const currentDate = dateKeyToLocalDate(getPlannerViewDate(card));
  setPlannerViewDate(card, getTodayKey(addDays(currentDate, dayDelta)));
}

function getPlannerRelativeDateLabel(dateKey) {
  const today = dateKeyToLocalDate(getTodayKey());
  const date = dateKeyToLocalDate(dateKey);
  const dayDelta = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (dayDelta === 0) return "Today";
  if (dayDelta === 1) return "Tomorrow";
  if (dayDelta === -1) return "Yesterday";
  return "";
}

function getPlannerViewDayHeading(dateKey) {
  const relative = getPlannerRelativeDateLabel(dateKey);
  if (relative) return relative;
  return dateKeyToLocalDate(dateKey).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatPlannerDate(dateKey) {
  const date = dateKeyToLocalDate(dateKey);
  const relative = getPlannerRelativeDateLabel(dateKey);
  const label = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return relative ? `${relative} · ${label}` : label;
}

function getPlannerScheduleItems(plannerCard) {
  const items = [];
  normalizePlannerCard(plannerCard);
  const group = getPlannerGroup(plannerCard);

  Object.entries(plannerCard.plannerEntries || {}).forEach(([dateKey, entry]) => {
    const normalizedDate = normalizeDateKey(dateKey);
    const normalizedEntry = normalizePlannerEntry(entry);
    if (!normalizedDate || !normalizedEntry.note) return;
    getPlannerNoteLines(normalizedEntry.note).forEach((line, index) => {
      const itemKey = getPlannerItemKey(line);
      const carryoverFrom = getPlannerEntryCarryoverDate(normalizedEntry, itemKey, "");
      items.push({
        dateKey: normalizedDate,
        title: line,
        source: "Planner",
        group,
        done: Boolean(normalizedEntry.checkedItems[itemKey]),
        completedAt: getPlannerCompletedAt(normalizedEntry, itemKey),
        isCarryover: Boolean(carryoverFrom),
        carryoverFrom,
        priority: 0,
        lineIndex: index
      });
    });
  });

  return items.sort(sortPlannerScheduleItems);
}

function getPlannerItemsForDate(dateKey, group = "") {
  const normalizedDate = normalizeDateKey(dateKey);
  if (!normalizedDate) return [];
  const normalizedGroup = group ? getPlannerGroup({ category: group }) : "";
  return getPlannerSourceCards()
    .filter((card) => !normalizedGroup || getPlannerGroup(card) === normalizedGroup)
    .flatMap((card) =>
      getPlannerScheduleItems(card)
        .filter((item) => item.dateKey === normalizedDate)
        .map((item) => ({ ...item, card }))
    )
    .sort(sortPlannerScheduleItems);
}

function getPlannerSourceCards() {
  const sources = new Map();
  state.cards.forEach((card) => {
    if (card?.type === "planner") sources.set(card.id, card);
  });
  getArchivedCards().forEach((card) => {
    if (card?.type === "planner" && !sources.has(card.id)) sources.set(card.id, card);
  });
  return [...sources.values()];
}

function getPlannerSourceItems(group = "", options = {}) {
  const viewOptions = normalizePlannerViewOptions(options);
  const normalizedGroup = group ? getPlannerGroup({ category: group }) : "";
  return getPlannerSourceCards()
    .filter((card) => viewOptions.sourceMode !== "area" || !normalizedGroup || getPlannerGroup(card) === normalizedGroup)
    .flatMap((card) => getPlannerScheduleItems(card).map((item) => ({ ...item, card })))
    .sort(sortPlannerScheduleItems);
}

function getPlannerTimelineMeta() {
  const todayKey = getTodayKey();
  const today = dateKeyToLocalDate(todayKey);
  const todayTime = today.getTime();
  const weekEnd = addDays(today, 6 - getCurrentWeekIndex(today));
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return {
    todayKey,
    today,
    todayTime,
    tomorrowKey: getTodayKey(addDays(today, 1)),
    weekEnd,
    weekEndTime: weekEnd.getTime(),
    monthEnd,
    monthEndTime: monthEnd.getTime(),
    nextWeekKey: getTodayKey(addDays(weekEnd, 1)),
    nextMonthKey: getTodayKey(new Date(today.getFullYear(), today.getMonth() + 1, 1))
  };
}

function getPlannerItemTime(item) {
  return dateKeyToLocalDate(item.dateKey).getTime();
}

function getPlannerItemDisplayDateKey(item) {
  return normalizeDateKey(item?.carryoverFrom) || normalizeDateKey(item?.dateKey) || getTodayKey();
}

function getPlannerItemDisplayTime(item) {
  return dateKeyToLocalDate(getPlannerItemDisplayDateKey(item)).getTime();
}

function getPlannerSectionKey(item, timeline = getPlannerTimelineMeta()) {
  const time = getPlannerItemTime(item);
  if (time <= timeline.weekEndTime) return "week";
  if (time <= timeline.monthEndTime) return "month";
  return "future";
}

function getPlannerSectionLabel(key) {
  return {
    week: "This week",
    month: "Later this month",
    future: "Future"
  }[key] || "Future";
}

function getPlannerViewData(view, group, options = {}, dayKey = getTodayKey()) {
  const mode = normalizePlannerViewMode(view);
  const viewOptions = normalizePlannerViewOptions(options);
  const timeline = getPlannerTimelineMeta();
  const selectedDayKey = normalizeDateKey(dayKey) || timeline.todayKey;
  const allItems = getPlannerSourceItems(group, viewOptions);
  const futureItems = allItems.filter((item) => getPlannerItemTime(item) >= timeline.todayTime);
  const upcomingItems = futureItems.filter((item) => {
    const time = getPlannerItemTime(item);
    if (viewOptions.excludeMonth && time <= timeline.monthEndTime) return false;
    if (viewOptions.excludeWeek && time <= timeline.weekEndTime) return false;
    if (viewOptions.excludeToday && time === timeline.todayTime) return false;
    return true;
  });
  const upcomingSections = ["week", "month", "future"]
    .map((key) => ({
      key,
      label: getPlannerSectionLabel(key),
      items: upcomingItems.filter((item) => getPlannerSectionKey(item, timeline) === key)
    }))
    .filter((section) => section.items.length);
  const range = {
    today: {
      limit: Number.POSITIVE_INFINITY,
      empty: "Planner items for this day will appear here.",
      items: allItems.filter((item) => item.dateKey === selectedDayKey),
      dateLabel: formatPlannerDate(selectedDayKey),
      dayKey: selectedDayKey
    },
    week: {
      limit: 8,
      empty: "Planner items for the rest of this week will appear here.",
      items: futureItems.filter((item) => {
        const time = getPlannerItemTime(item);
        if (viewOptions.excludeToday && time === timeline.todayTime) return false;
        return time >= timeline.todayTime && time <= timeline.weekEndTime;
      })
    },
    month: {
      limit: 10,
      empty: "Planner items later this month will appear here.",
      items: futureItems.filter((item) => {
        const time = getPlannerItemTime(item);
        if (viewOptions.excludeWeek && time <= timeline.weekEndTime) return false;
        if (viewOptions.excludeToday && time === timeline.todayTime) return false;
        return time >= timeline.todayTime && time <= timeline.monthEndTime;
      })
    },
    upcoming: {
      limit: 12,
      empty: "Planner tasks will appear under This week, Later this month, or Future.",
      items: upcomingItems,
      sections: upcomingSections
    }
  };
  return {
    ...(range[mode] || range.today),
    sourceLabel: viewOptions.sourceMode === "area" ? `${getPlannerGroup({ category: group })} Planner source` : "Board Planner source"
  };
}

function getPlannerViewLabel(view) {
  return {
    today: "Today",
    week: "This week",
    month: "This month",
    upcoming: "Upcoming"
  }[normalizePlannerViewMode(view)];
}

function getPlannerViewCardTitle(view) {
  return {
    today: "Today planner",
    week: "This week planner",
    month: "This month planner",
    upcoming: "Upcoming planner"
  }[normalizePlannerViewMode(view)];
}

function getPlannerViewCardDescription(view, options = {}) {
  return getPlannerViewSummary(view, options);
}

function syncPlannerViewCardCopy(card) {
  if (!card || card.type !== "planlist") return card;
  const options = normalizePlannerViewOptions(card.plannerViewOptions);
  card.title = getPlannerViewCardTitle(card.plannerView);
  card.description = options.showGuide ? getPlannerViewCardDescription(card.plannerView, options) : "";
  return card;
}

function getPlannerViewSummary(view, options = {}) {
  const mode = normalizePlannerViewMode(view);
  const viewOptions = normalizePlannerViewOptions(options);
  if (mode === "today") return "Shows planner items dated today, with quick add for today's list.";
  if (mode === "week") return viewOptions.excludeToday ? "Shows the rest of this week without today's items." : "Shows today through the end of this week.";
  if (mode === "month") {
    if (viewOptions.excludeWeek) return "Shows later this month without today or this week's items.";
    if (viewOptions.excludeToday) return "Shows this month without today's items.";
    return "Shows today through the end of this month.";
  }
  if (viewOptions.excludeMonth) return "Shows future items after this month.";
  if (viewOptions.excludeWeek) return "Groups later this month and future items.";
  if (viewOptions.excludeToday) return "Groups the rest of this week, later this month and future items.";
  return "Groups this week, later this month and future items.";
}

function getUpcomingScheduleItems(plannerCard, limit = 6) {
  const today = dateKeyToLocalDate(getTodayKey()).getTime();
  const items = getPlannerScheduleItems(plannerCard);

  state.cards.forEach((card) => {
    if (!card || card.id === plannerCard.id) return;
    if (card.type === "daily" && getProgress(card).percent < 100) {
      items.push({
        dateKey: getCardPlanDate(card),
        title: card.title || "To-do",
        source: "To-do",
        priority: 1
      });
    }
    if (card.type === "event" && card.targetAt && getProgress(card).percent < 100) {
      const dateKey = getDateKeyFromIso(card.targetAt);
      if (!dateKey) return;
      items.push({
        dateKey,
        title: card.title || "Event",
        source: "Event",
        priority: 2
      });
    }
  });

  return items
    .filter((item) => dateKeyToLocalDate(item.dateKey).getTime() >= today)
    .sort(sortPlannerScheduleItems)
    .slice(0, limit);
}

function sortPlannerScheduleItems(a, b) {
  const dateSort = getPlannerItemDisplayTime(a) - getPlannerItemDisplayTime(b);
  const doneSort = Number(Boolean(a.done)) - Number(Boolean(b.done));
  const actualDateSort = getPlannerItemTime(a) - getPlannerItemTime(b);
  const lineSort = (a.lineIndex ?? 0) - (b.lineIndex ?? 0);
  return dateSort || doneSort || actualDateSort || a.priority - b.priority || lineSort || a.title.localeCompare(b.title);
}

function formatPlannerListDate(dateKey) {
  const relative = getPlannerRelativeDateLabel(dateKey);
  if (relative) return relative;
  return dateKeyToLocalDate(dateKey).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatPlannerOriginDate(dateKey) {
  const date = dateKeyToLocalDate(dateKey);
  if (!Number.isFinite(date.getTime())) return "past date";
  const today = new Date();
  const options = date.getFullYear() === today.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" };
  return date.toLocaleDateString(undefined, options);
}

function formatPlannerCompletedAt(timestamp) {
  const date = new Date(Number(timestamp) || 0);
  if (!Number.isFinite(date.getTime())) return "Done";
  return `Done ${formatPlannerOriginDate(getTodayKey(date))}`;
}

function formatPlannerCompletedTooltip(timestamp) {
  const date = new Date(Number(timestamp) || 0);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function normalizeDiaryCard(card) {
  if (!card || card.type !== "diary") return card;
  const today = getTodayKey();
  card.diaryEntries = card.diaryEntries && typeof card.diaryEntries === "object" ? card.diaryEntries : {};
  card.activeDate = normalizeDateKey(card.activeDate) || today;
  card.lastDiaryDate = normalizeDateKey(card.lastDiaryDate) || today;
  Object.keys(card.diaryEntries).forEach((dateKey) => {
    const normalizedDate = normalizeDateKey(dateKey);
    if (!normalizedDate) {
      delete card.diaryEntries[dateKey];
      return;
    }
    card.diaryEntries[normalizedDate] = normalizeDiaryEntry(card.diaryEntries[dateKey]);
    if (normalizedDate !== dateKey) delete card.diaryEntries[dateKey];
  });
  if (!card.diaryEntries[card.activeDate]) {
    card.diaryEntries[card.activeDate] = normalizeDiaryEntry();
  }
  return card;
}

function normalizeDiaryEntry(entry = {}) {
  const feeling = DIARY_FEELING_ALIASES[entry.feeling] || entry.feeling;
  return {
    feeling: getDiaryFeelings().includes(feeling) ? feeling : "Calm",
    sentence: String(entry.sentence || "").trim(),
    thoughts: String(entry.thoughts || ""),
    updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : 0
  };
}

function getDiaryFeelings() {
  return Object.keys(DIARY_MOOD_META);
}

function getActiveDiaryDate(card) {
  if (!card || card.type !== "diary") return getTodayKey();
  normalizeDiaryCard(card);
  return normalizeDateKey(card.activeDate) || getTodayKey();
}

function getDiaryEntry(card, dateKey = getActiveDiaryDate(card)) {
  normalizeDiaryCard(card);
  const normalizedDate = normalizeDateKey(dateKey) || getTodayKey();
  if (!card.diaryEntries[normalizedDate]) {
    card.diaryEntries[normalizedDate] = normalizeDiaryEntry();
  }
  return card.diaryEntries[normalizedDate];
}

function updateDiaryEntry(card, dateKey, updates, options = {}) {
  const normalizedDate = normalizeDateKey(dateKey) || getTodayKey();
  const current = getDiaryEntry(card, normalizedDate);
  const nextEntry = normalizeDiaryEntry({
    ...current,
    ...updates,
    updatedAt: Date.now()
  });
  card.diaryEntries[normalizedDate] = nextEntry;
  persistDiaryEntryImmediately(card, normalizedDate, nextEntry);
  if (options.rerender) renderCardsOnly();
}

function persistDiaryEntryImmediately(card, dateKey, entry) {
  try {
    touchState();
    syncActiveBoard();
    mergeStoredBoardsIntoState();
    const localSaved = writeLocalJson(STORAGE_KEY, getStateForStorage(), {
      message: "Diary save failed locally. Try removing large images."
    });
    if (localSaved) localStateSource = "stored";
    upsertDiaryBackup(card, dateKey, entry);
    if (elements.savedState) {
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      elements.savedState.textContent = localSaved ? `Diary saved ${time}` : "Diary saved to backup only";
      elements.savedState.classList.remove("is-saving");
    }
    queueCloudSave({ silent: true });
  } catch {
    if (elements.savedState) {
      elements.savedState.textContent = "Diary save failed";
    }
  }
}

function autosaveEditingDiaryFromForm() {
  if (!editingCardId || getSelectedFormType() !== "diary") return;
  const card = state.cards.find((item) => item.id === editingCardId);
  if (!card || card.type !== "diary") return;
  const dateKey = normalizeDateKey(elements.diaryDate.value) || getTodayKey();
  card.activeDate = dateKey;
  updateDiaryEntry(card, dateKey, {
    feeling: elements.diaryFeeling.value,
    sentence: elements.diarySentence.value,
    thoughts: elements.diaryThoughts.value
  });
}

function upsertDiaryBackup(card, dateKey, entry) {
  const backups = readDiaryBackups();
  const backupKey = `${state.activeBoardId || "board"}:${card.id}:${dateKey}`;
  backups[backupKey] = {
    boardId: state.activeBoardId || "",
    cardId: card.id,
    cardTitle: card.title || "Diary",
    dateKey,
    entry,
    savedAt: Date.now()
  };
  writeLocalJson(DIARY_BACKUP_KEY, backups, { silent: true });
}

function readDiaryBackups() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DIARY_BACKUP_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function moveDiaryDate(card, direction) {
  const activeDate = dateKeyToLocalDate(getActiveDiaryDate(card));
  card.activeDate = getTodayKey(addDays(activeDate, direction));
  getDiaryEntry(card, card.activeDate);
  saveState();
  renderCardsOnly();
}

function formatDiaryDate(dateKey) {
  const date = dateKeyToLocalDate(dateKey);
  const relative = getRelativeDateLabel(dateKey, 0);
  const label = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return relative ? `${relative} · ${label}` : label;
}

function getVideoEmbed(url) {
  const parsed = parseSupportedVideoUrl(url);
  if (!parsed) return null;
  if (parsed.provider === "youtube") {
    return {
      provider: "youtube",
      providerLabel: "YouTube",
      src: `https://www.youtube-nocookie.com/embed/${parsed.id}`,
      thumbnail: `https://img.youtube.com/vi/${parsed.id}/hqdefault.jpg`
    };
  }
  if (parsed.provider === "instagram") {
    return {
      provider: "instagram",
      providerLabel: "Instagram",
      src: `https://www.instagram.com/${parsed.kind}/${parsed.id}/embed`
    };
  }
  if (parsed.provider === "facebook") {
    return {
      provider: "facebook",
      providerLabel: "Facebook",
      src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(parsed.href)}&show_text=false&width=560`
    };
  }
  return null;
}

function canRenderInlineVideo() {
  return globalThis.location?.protocol !== "file:";
}

function parseSupportedVideoUrl(url) {
  const normalized = normalizeVideoUrl(url);
  if (!normalized) return null;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  if (isTrustedHost(host, TRUSTED_VIDEO_DOMAINS.youtube) && host === "youtu.be" && pathParts[0]) {
    const id = cleanVideoId(pathParts[0]);
    return id ? { provider: "youtube", id } : null;
  }
  if (isTrustedHost(host, TRUSTED_VIDEO_DOMAINS.youtube)) {
    const id = cleanVideoId(parsed.searchParams.get("v") || (["shorts", "embed"].includes(pathParts[0]) ? pathParts[1] : ""));
    if (id) return { provider: "youtube", id };
  }
  if (isTrustedHost(host, TRUSTED_VIDEO_DOMAINS.instagram)) {
    const kind = ["p", "reel", "tv"].includes(pathParts[0]) ? pathParts[0] : "";
    const id = cleanVideoId(pathParts[1]);
    if (kind && id) return { provider: "instagram", kind, id };
  }
  if (isTrustedHost(host, TRUSTED_VIDEO_DOMAINS.facebook)) {
    return { provider: "facebook", href: normalized };
  }
  return null;
}

function isTrustedHost(host, allowedDomains) {
  return allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function cleanVideoId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function renderStats(cards = state.cards) {
  const total = cards.length;
  const running = cards.filter((card) => card.runningSince && isManualTimer(card)).length;
  const donePercent = getAverageProgress(cards);

  elements.totalCards.textContent = total;
  elements.runningTimers.textContent = running;
  elements.completionRate.textContent = `${donePercent}%`;
}

function getSelectedFormType() {
  if (elements.cardType.value === "weekly") {
    return SCORECARD_TYPES.includes(elements.scorecardPeriod.value) ? elements.scorecardPeriod.value : "weekly";
  }
  return TYPE_META[elements.cardType.value] ? elements.cardType.value : "daily";
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
  ensureFormTypeOption(normalizedType);
  elements.cardType.value = normalizedType;
  elements.scorecardPeriod.value = "weekly";
}

function ensureFormTypeOption(type) {
  if (!TYPE_META[type] || elements.cardType.querySelector(`option[value="${type}"]`)) return;
  const option = document.createElement("option");
  option.value = type;
  option.textContent = TYPE_META[type].label;
  elements.cardType.append(option);
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
  renderPriorityButtons();
  renderTypeButtons(type);
  const isRoutine = type === "routine";
  const isScheduled = type === "scheduled";
  const isContent = isUntimedContentType(type);
  const isScorecard = elements.cardType.value === "weekly";
  if (type === "event" && ["none", "hours"].includes(selectedTimerMode)) {
    selectedTimerMode = "date";
    setDefaultTimerDate();
  }
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
  elements.plannerField.classList.toggle("is-visible", type === "planner");
  elements.plannerViewField.classList.toggle("is-visible", type === "planlist");
  elements.diaryField.classList.toggle("is-visible", type === "diary");
  elements.quoteField.classList.toggle("is-visible", type === "quote");
  elements.videoField.classList.toggle("is-visible", type === "video");
  elements.fitnessField.classList.toggle("is-visible", type === "fitness");
  elements.scheduleField.classList.toggle("is-visible", isScheduled);
  elements.scorecardPeriodField.classList.toggle("is-visible", isScorecard);
  elements.dailyPlanDateField.classList.toggle("is-visible", type === "daily");
  if (type === "daily" && !normalizeDateKey(elements.cardPlanDate.value)) {
    elements.cardPlanDate.value = getTodayKey();
  }
  if (type === "planner" && !normalizeDateKey(elements.plannerDate.value)) {
    elements.plannerDate.value = getTodayKey();
  }
  const plannerViewMode = normalizePlannerViewMode(elements.plannerViewMode.value);
  elements.plannerViewMode.value = plannerViewMode;
  renderPlannerViewModeButtons(plannerViewMode);
  elements.plannerExcludeTodayField.hidden = !["week", "month", "upcoming"].includes(plannerViewMode);
  elements.plannerExcludeWeekField.hidden = !["month", "upcoming"].includes(plannerViewMode);
  elements.plannerExcludeMonthField.hidden = plannerViewMode !== "upcoming";
  if (type === "diary" && !normalizeDateKey(elements.diaryDate.value)) {
    elements.diaryDate.value = getTodayKey();
  }
  if (type === "diary") {
    requestAnimationFrame(() => autoGrowTextarea(elements.diaryThoughts));
  }
  if (isContent) {
    selectedTimerMode = "none";
  }
  elements.countdownField.hidden = isRoutine || isContent;
  elements.timerDetailField.classList.toggle("is-visible", !isRoutine && !isContent && ["date", "days"].includes(selectedTimerMode));
  elements.cardTypeHelp.textContent = TYPE_HELP[type] || TYPE_HELP.daily;
  renderTypeInsight(type);
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
    const disabled = type === "event" && ["none", "hours"].includes(button.dataset.value);
    button.disabled = disabled;
    button.classList.toggle("is-active", selectedTimerMode === button.dataset.value);
  });
  document.querySelectorAll("[data-timer-panel]").forEach((panel) => {
    panel.classList.toggle("is-visible", !isRoutine && panel.dataset.timerPanel === selectedTimerMode);
  });
  renderFormPreview();
}

function renderTypeButtons(activeType = getSelectedFormType()) {
  if (!elements.cardTypeButtons) return;
  const normalizedActiveType = SCORECARD_TYPES.includes(activeType) ? "weekly" : activeType;
  elements.cardTypeButtons.innerHTML = TYPE_PICKER_GROUPS.map((group) => {
    const options = group.options.map((option) => {
      const meta = TYPE_META[option.type] || TYPE_META.single;
      const isActive = option.type === normalizedActiveType;
      return `
        <button type="button" class="type-button ${isActive ? "is-active" : ""}" data-type="${escapeAttribute(option.type)}" role="radio" aria-checked="${isActive ? "true" : "false"}">
          <span class="type-button-icon">${ICONS[meta.icon] || ICONS.check}</span>
          <span class="type-button-copy">
            <strong>${escapeHtml(option.label)}</strong>
            <small>${escapeHtml(option.hint)}</small>
          </span>
        </button>
      `;
    }).join("");
    return `
      <div class="type-group-label">
        <strong>${escapeHtml(group.label)}</strong>
        <small>${escapeHtml(group.description)}</small>
      </div>
      ${options}
    `;
  }).join("");
  hydrateIcons(elements.cardTypeButtons);
}

function renderPriorityButtons() {
  if (!elements.priorityButtons) return;
  const activePriority = getSelectedPriority(elements.cardPriority.value);
  elements.priorityButtons.innerHTML = ["normal", "high", "low"].map((priority) => {
    const meta = PRIORITY_META[priority];
    const isActive = priority === activePriority;
    return `
      <button type="button" class="${isActive ? "is-active" : ""}" data-priority="${priority}" data-label="${escapeAttribute(meta.label)}" title="${escapeAttribute(meta.label)}" aria-label="${escapeAttribute(meta.label)}" role="radio" aria-checked="${isActive ? "true" : "false"}" style="--priority-swatch:${meta.color}">
        <span class="priority-dot"></span>
        <span class="sr-only">${escapeHtml(meta.label)}</span>
      </button>
    `;
  }).join("");
}

function renderPlannerViewModeButtons(activeMode = normalizePlannerViewMode(elements.plannerViewMode.value)) {
  if (!elements.plannerViewModeButtons) return;
  const options = [
    ["today", "Today"],
    ["week", "Week"],
    ["month", "Month"],
    ["upcoming", "Upcoming"]
  ];
  elements.plannerViewModeButtons.innerHTML = options.map(([mode, label]) => {
    const isActive = mode === activeMode;
    return `
      <button type="button" class="${isActive ? "is-active" : ""}" data-planner-view="${mode}" role="radio" aria-checked="${isActive ? "true" : "false"}">
        ${escapeHtml(label)}
      </button>
    `;
  }).join("");
}

function renderTypeInsight(type) {
  if (!elements.typeInsight) return;
  const detail = TYPE_DETAILS[type] || TYPE_DETAILS.daily;
  elements.typeInsight.innerHTML = `
    <div>
      <span>Best for</span>
      <strong>${escapeHtml(detail.best)}</strong>
    </div>
    <div>
      <span>Time logic</span>
      <strong>${escapeHtml(detail.timing)}</strong>
    </div>
  `;
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
  const composerOpen = !elements.cardComposerPanel.hidden;
  const shouldShowPreview = (composerOpen || (draftTouched && hasDraftInput())) && !draftPreviewDismissed;
  elements.boardPreviewPanel.hidden = !shouldShowPreview;
  if (!shouldShowPreview) {
    elements.cardPreview.innerHTML = "";
    return;
  }
  const card = buildCardFromForm({ preview: true });
  const typeMeta = TYPE_META[card.type] || TYPE_META.single;
  elements.previewMeta.textContent = `Board width · ${typeMeta.label}`;
  elements.cardPreview.innerHTML = "";
  elements.cardPreview.append(renderCard(card, { interactive: false }));
  hydrateIcons(elements.cardPreview);
  hydrateIcons(elements.boardPreviewPanel);
}

function handleDraftInputChange() {
  if (elements.cardComposerPanel.hidden && !editingCardId) return;
  draftTouched = true;
  draftPreviewDismissed = false;
  renderFormPreview();
}

function discardDraftCard() {
  closeCardComposer({ reset: true });
  renderCardsOnly();
}

function openSettingsModal() {
  closeOtherOverlays("settings");
  elements.settingsModalTitle.textContent = "Board settings";
  setSettingsPanelMode();
  elements.settingsModal.hidden = false;
  syncModalOpenState();
  renderShell();
  hydrateIcons(elements.settingsModal);
}

function closeSettingsModal() {
  elements.settingsModal.hidden = true;
  syncModalOpenState();
  renderShell();
}

function openIdeasModal() {
  closeOtherOverlays("ideas");
  renderIdeasModal();
  elements.ideasModal.hidden = false;
  syncModalOpenState();
}

function closeIdeasModal() {
  elements.ideasModal.hidden = true;
  syncModalOpenState();
}

function renderIdeasModal() {
  elements.ideasGrid.innerHTML = lifeOsIdeas
    .map((idea) => {
      const action = idea.templateId
        ? `<button type="button" class="idea-link" data-open-template="${escapeAttribute(idea.templateId)}">Preview board</button>`
        : '<span class="idea-link is-muted">Platform layer</span>';
      return `
        <article class="idea-card">
          <div>
            <span class="idea-status">${escapeHtml(idea.status)}</span>
            <h3>${escapeHtml(idea.title)}</h3>
            <p>${escapeHtml(idea.text)}</p>
          </div>
          ${action}
        </article>
      `;
    })
    .join("");
}

function openTemplateModal(templateId = selectedTemplateId) {
  closeOtherOverlays("template");
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
      <div><strong>${categories.length}</strong><span>Areas</span></div>
      <div><strong>${timedCards}</strong><span>Timers</span></div>
      <div><strong>${runningDaily}</strong><span>Daily resets</span></div>
    </div>
    <div class="overview-band">
      <div>
        <p class="eyebrow">Area mix</p>
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
  closeOtherOverlays("history");
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
  closeOtherOverlays("records");
  renderRecordsModal();
  elements.recordsModal.hidden = false;
  syncModalOpenState();
}

function closeRecordsModal() {
  elements.recordsModal.hidden = true;
  syncModalOpenState();
}

function openReportsModal() {
  closeOtherOverlays("reports");
  renderReportsModal();
  elements.reportsModal.hidden = false;
  syncModalOpenState();
}

function closeReportsModal() {
  elements.reportsModal.hidden = true;
  syncModalOpenState();
}

function renderReportsModal() {
  if (!elements.reportPrintArea) return;
  elements.reportsModal.querySelectorAll("button[data-report-type]").forEach((button) => {
    const isActive = button.dataset.reportType === activeReportType;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  elements.reportPrintArea.innerHTML = "";
  const range = getReportRangeMeta();
  const report = activeReportType === "diary"
    ? renderDiaryReport(range)
    : activeReportType === "food"
      ? renderFoodReport(range)
      : renderFitnessReport(range);
  elements.reportPrintArea.append(report);
  hydrateIcons(elements.reportsModal);
}

function getReportRangeMeta() {
  const value = elements.reportRange?.value || "30";
  const todayKey = getTodayKey();
  const today = dateKeyToLocalDate(todayKey);
  if (value === "all") return { value, startKey: "", endKey: todayKey, label: "All records", dayCount: 365 };
  if (value === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { value, startKey: getTodayKey(start), endKey: todayKey, label: "This month", dayCount: Math.max(1, Math.round((today - start) / 86400000) + 1) };
  }
  const days = clampInt(value, 7, 365, 30);
  return { value, startKey: getTodayKey(addDays(today, -(days - 1))), endKey: todayKey, label: `Last ${days} days`, dayCount: days };
}

function isDateInReportRange(dateKey, range) {
  const normalizedDate = normalizeDateKey(dateKey);
  if (!normalizedDate) return false;
  if (range.startKey && normalizedDate < range.startKey) return false;
  return normalizedDate <= range.endKey;
}

function getCurrentBoardReportCards() {
  return [...state.cards, ...getArchivedCards()];
}

function renderFitnessReport(range) {
  const sessions = collectFitnessSessions(range);
  const totals = getFitnessReportTotals(sessions);
  const documentNode = createReportDocument("Fitness progress report", `${state.board.name} · ${range.label}`);
  const intro = document.createElement("p");
  intro.className = "report-lede";
  intro.textContent = "Built from Fitness log cards on this board. Benchmarks use adult aerobic and muscle-strengthening activity guidance as a practical reference, not medical advice.";
  documentNode.append(intro);

  const summary = document.createElement("div");
  summary.className = "report-metric-grid";
  summary.append(
    createReportMetric("Sessions", sessions.length, "logged workout days"),
    createReportMetric("Running", `${formatReportNumber(totals.runningKm)} km`, `${formatReportNumber(totals.runningMinutes)} min`),
    createReportMetric("Strength", `${totals.strengthSets} sets`, `${totals.strengthDays} training days`),
    createReportMetric("Coverage", `${totals.partLabels.length}`, totals.partLabels.join(", ") || "no parts yet")
  );
  documentNode.append(summary);

  const targetWeeks = Math.max(1, range.dayCount / 7);
  const targetMinutes = Math.round(150 * targetWeeks);
  const targetStrengthDays = Math.max(2, Math.round(2 * targetWeeks));
  documentNode.append(createReportSection("Health reference", [
    `Aerobic minutes: ${Math.round(totals.runningMinutes)} / ${targetMinutes} min reference`,
    `Strength days: ${totals.strengthDays} / ${targetStrengthDays} day reference`,
    `Best use: compare trend and consistency, then adjust training load gradually.`
  ]));

  documentNode.append(createFitnessSplitSection(totals.partCounts));
  documentNode.append(createFitnessMetricsTrendSection(sessions));
  documentNode.append(createFitnessRecentSessionsSection(sessions));
  return documentNode;
}

function collectFitnessSessions(range) {
  const sessions = [];
  getCurrentBoardReportCards()
    .filter((card) => card.type === "fitness")
    .forEach((card) => {
      normalizeFitnessCard(card);
      Object.entries(card.fitnessEntries || {}).forEach(([dateKey, entry]) => {
        if (!isDateInReportRange(dateKey, range)) return;
        const normalizedEntry = normalizeFitnessEntry(entry);
        const activeParts = getActiveFitnessParts(normalizedEntry);
        const hasMetrics = FITNESS_METRIC_FIELDS.some((field) => normalizedEntry.metrics[field.key] !== "");
        if (!activeParts.length && !hasMetrics && !normalizedEntry.notes) return;
        sessions.push({ card, dateKey, entry: normalizedEntry, activeParts });
      });
    });
  return sessions.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function getFitnessReportTotals(sessions) {
  const partCounts = {};
  const partLabels = new Set();
  let runningKm = 0;
  let runningMinutes = 0;
  let strengthSets = 0;
  const strengthDates = new Set();
  sessions.forEach((session) => {
    session.activeParts.forEach((meta) => {
      partCounts[meta.label] = (partCounts[meta.label] || 0) + 1;
      partLabels.add(meta.label);
      const part = session.entry.parts[meta.key];
      if (meta.type === "cardio") {
        runningKm += Number(part.distanceKm) || 0;
        runningMinutes += Number(part.durationMinutes) || 0;
      }
      if (meta.type === "strength") {
        const sets = (part.exercises || []).reduce((sum, exercise) => sum + (Number(exercise.sets) || 0), 0);
        strengthSets += sets;
        if (sets > 0 || part.exercises?.length) strengthDates.add(session.dateKey);
      }
    });
  });
  return { runningKm, runningMinutes, strengthSets, strengthDays: strengthDates.size, partCounts, partLabels: [...partLabels] };
}

function createFitnessSplitSection(partCounts) {
  const section = document.createElement("section");
  section.className = "report-section";
  const heading = document.createElement("h3");
  heading.textContent = "Workout split";
  const grid = document.createElement("div");
  grid.className = "report-chip-grid";
  const entries = Object.entries(partCounts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.textContent = "No workout parts logged in this period.";
    section.append(heading, empty);
    return section;
  }
  entries.forEach(([label, count]) => {
    const chip = document.createElement("span");
    chip.textContent = `${label} · ${count}`;
    grid.append(chip);
  });
  section.append(heading, grid);
  return section;
}

function createFitnessMetricsTrendSection(sessions) {
  const metricSessions = sessions
    .slice()
    .reverse()
    .filter((session) => FITNESS_METRIC_FIELDS.some((field) => session.entry.metrics[field.key] !== ""));
  const section = document.createElement("section");
  section.className = "report-section";
  const heading = document.createElement("h3");
  heading.textContent = "Body metrics trend";
  if (!metricSessions.length) {
    const empty = document.createElement("p");
    empty.textContent = "No body metrics recorded in this period.";
    section.append(heading, empty);
    return section;
  }
  const first = metricSessions[0];
  const latest = metricSessions[metricSessions.length - 1];
  const table = document.createElement("div");
  table.className = "report-table";
  ["weightKg", "bmi", "bodyFatPercent", "waistCm"].forEach((key) => {
    const field = FITNESS_METRIC_FIELDS.find((item) => item.key === key);
    const row = document.createElement("div");
    row.innerHTML = `<strong>${escapeHtml(field.label)}</strong><span>${formatMetricValue(first.entry.metrics[key], field.suffix, field.decimals)}</span><span>${formatMetricValue(latest.entry.metrics[key], field.suffix, field.decimals)}</span>`;
    table.append(row);
  });
  section.append(heading, createReportSubhead(`${formatRecordDate(first.dateKey)} to ${formatRecordDate(latest.dateKey)}`), table);
  return section;
}

function createFitnessRecentSessionsSection(sessions) {
  const section = document.createElement("section");
  section.className = "report-section";
  const heading = document.createElement("h3");
  heading.textContent = "Recent sessions";
  const list = document.createElement("div");
  list.className = "report-session-list";
  sessions.slice(0, 8).forEach((session) => {
    const item = document.createElement("article");
    const title = document.createElement("strong");
    title.textContent = `${formatRecordDate(session.dateKey)} · ${session.activeParts.map((part) => part.label).join(", ") || "Metrics"}`;
    const details = document.createElement("p");
    details.textContent = getFitnessSessionLine(session);
    item.append(title, details);
    list.append(item);
  });
  if (!sessions.length) {
    const empty = document.createElement("p");
    empty.textContent = "No fitness sessions recorded in this period.";
    list.append(empty);
  }
  section.append(heading, list);
  return section;
}

function getFitnessSessionLine(session) {
  const lines = [];
  const running = session.entry.parts.running;
  if (running?.active) lines.push(`Running ${formatReportNumber(running.distanceKm)} km, ${formatReportNumber(running.durationMinutes)} min`);
  session.activeParts.forEach((meta) => {
    if (meta.type !== "strength") return;
    const part = session.entry.parts[meta.key];
    const sets = (part.exercises || []).reduce((sum, exercise) => sum + (Number(exercise.sets) || 0), 0);
    lines.push(`${meta.label} ${sets} sets`);
  });
  if (session.entry.notes) lines.push(session.entry.notes);
  return lines.join(" · ") || "Metrics recorded";
}

function renderFoodReport(range) {
  const days = collectFoodReportDays(range);
  const totals = getFoodReportTotals(days);
  const documentNode = createReportDocument("Nutrition report", `${state.board.name} · ${range.label}`);
  const intro = document.createElement("p");
  intro.className = "report-lede";
  intro.textContent = "Built from Food tracker cards on this board. Logged foods use the nutrition snapshot saved on that day, so future library edits do not rewrite old records.";
  documentNode.append(intro);

  const summary = document.createElement("div");
  summary.className = "report-metric-grid";
  const averageCalories = days.length ? totals.consumed.calories / days.length : 0;
  const averageProtein = days.length ? totals.consumed.protein / days.length : 0;
  const averageFiber = days.length ? totals.consumed.fiber / days.length : 0;
  const calorieTarget = days.length ? totals.targets.calories / days.length : DEFAULT_FOOD_TARGETS.calories;
  summary.append(
    createReportMetric("Logged days", days.length, "nutrition records"),
    createReportMetric("Avg kcal", `${formatFoodNumber(averageCalories, "calories")}`, `/ ${formatFoodNumber(calorieTarget, "calories")} daily target`),
    createReportMetric("Protein avg", `${formatFoodNumber(averageProtein, "protein")}g`, `${formatFoodNumber(totals.targets.protein / Math.max(1, days.length), "protein")}g target`),
    createReportMetric("Fiber avg", `${formatFoodNumber(averageFiber, "fiber")}g`, `${formatFoodNumber(totals.targets.fiber / Math.max(1, days.length), "fiber")}g target`)
  );
  documentNode.append(summary);
  documentNode.append(createFoodTargetProgressSection(days, totals));
  documentNode.append(createFoodMealPatternSection(days));
  documentNode.append(createFoodRecentDaysSection(days));
  return documentNode;
}

function collectFoodReportDays(range) {
  const daysByDate = new Map();
  getCurrentBoardReportCards()
    .filter((card) => card.type === "food")
    .forEach((card) => {
      normalizeFoodCard(card);
      Object.entries(card.foodEntries || {}).forEach(([dateKey, entry]) => {
        const normalizedDate = normalizeDateKey(dateKey);
        if (!isDateInReportRange(normalizedDate, range)) return;
        const normalizedEntry = normalizeFoodEntry(entry);
        const hasFood = normalizedEntry.meals.some((meal) => meal.items?.length);
        if (!hasFood) return;
        const entryTotals = getFoodEntryTotals(card, normalizedEntry);
        const dateRecord = daysByDate.get(normalizedDate) || {
          dateKey: normalizedDate,
          entries: [],
          meals: [],
          consumed: createEmptyFoodTotals(),
          target: normalizeFoodTarget(card.foodTargets?.[getFoodMonthKey(normalizedDate)] || card.foodTargets?.default || DEFAULT_FOOD_TARGETS)
        };
        dateRecord.consumed = addFoodTotals(dateRecord.consumed, entryTotals);
        normalizedEntry.meals.forEach((meal) => {
          if (!meal.items?.length) return;
          dateRecord.meals.push({
            cardTitle: card.title,
            name: meal.name,
            totals: getFoodMealTotals(card, meal),
            itemCount: meal.items.length
          });
        });
        dateRecord.entries.push({ card, entry: normalizedEntry, totals: entryTotals });
        daysByDate.set(normalizedDate, dateRecord);
      });
    });
  return [...daysByDate.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function getFoodReportTotals(days) {
  return days.reduce(
    (totals, day) => {
      totals.consumed = addFoodTotals(totals.consumed, day.consumed);
      totals.targets = addFoodTotals(totals.targets, day.target);
      return totals;
    },
    { consumed: createEmptyFoodTotals(), targets: createEmptyFoodTotals() }
  );
}

function createFoodTargetProgressSection(days, totals) {
  const section = document.createElement("section");
  section.className = "report-section";
  const heading = document.createElement("h3");
  heading.textContent = "Target progress";
  if (!days.length) {
    const empty = document.createElement("p");
    empty.textContent = "No nutrition records in this period.";
    section.append(heading, empty);
    return section;
  }
  const table = document.createElement("div");
  table.className = "report-table food-report-table";
  FOOD_NUTRIENT_KEYS.forEach((key) => {
    const consumed = totals.consumed[key] || 0;
    const target = totals.targets[key] || 0;
    const percent = target ? Math.round((consumed / target) * 100) : 0;
    const unit = key === "calories" ? "kcal" : "g";
    const row = document.createElement("div");
    row.innerHTML = `
      <strong>${escapeHtml(FOOD_NUTRIENT_META[key].label)}</strong>
      <span>${formatFoodNumber(consumed, key)} ${unit}</span>
      <span>${target ? `${percent}% of ${formatFoodNumber(target, key)} ${unit}` : "No target"}</span>
    `;
    table.append(row);
  });
  section.append(heading, createReportSubhead(`${days.length} logged day${days.length === 1 ? "" : "s"} in this period`), table);
  return section;
}

function createFoodMealPatternSection(days) {
  const section = document.createElement("section");
  section.className = "report-section";
  const heading = document.createElement("h3");
  heading.textContent = "Meal pattern";
  const mealMap = new Map();
  days.forEach((day) => {
    day.meals.forEach((meal) => {
      const key = normalizeLabel(meal.name || "Meal").toLowerCase();
      const current = mealMap.get(key) || { name: meal.name || "Meal", count: 0, totals: createEmptyFoodTotals() };
      current.count += 1;
      current.totals = addFoodTotals(current.totals, meal.totals);
      mealMap.set(key, current);
    });
  });
  const meals = [...mealMap.values()].sort((a, b) => b.totals.calories - a.totals.calories);
  if (!meals.length) {
    const empty = document.createElement("p");
    empty.textContent = "No meals logged in this period.";
    section.append(heading, empty);
    return section;
  }
  const grid = document.createElement("div");
  grid.className = "report-chip-grid food-report-meals";
  meals.forEach((meal) => {
    const chip = document.createElement("span");
    chip.textContent = `${meal.name} · ${meal.count}x · ${formatFoodNumber(meal.totals.calories, "calories")} kcal · P ${formatFoodNumber(meal.totals.protein, "protein")}g`;
    grid.append(chip);
  });
  section.append(heading, grid);
  return section;
}

function createFoodRecentDaysSection(days) {
  const section = document.createElement("section");
  section.className = "report-section";
  const heading = document.createElement("h3");
  heading.textContent = "Recent nutrition days";
  const list = document.createElement("div");
  list.className = "report-session-list food-report-list";
  days.slice(0, 10).forEach((day) => {
    const item = document.createElement("article");
    const title = document.createElement("strong");
    title.textContent = `${formatRecordDate(day.dateKey)} · ${getFoodStatusLabel(day.consumed, day.target)}`;
    const details = document.createElement("p");
    details.textContent = formatFoodReportMacroLine(day.consumed);
    const meals = document.createElement("p");
    meals.textContent = day.meals
      .slice(0, 4)
      .map((meal) => `${meal.name}: ${formatFoodNumber(meal.totals.calories, "calories")} kcal`)
      .join(" · ");
    item.append(title, details);
    if (meals.textContent) item.append(meals);
    list.append(item);
  });
  if (!days.length) {
    const empty = document.createElement("p");
    empty.textContent = "No nutrition records in this period.";
    list.append(empty);
  }
  section.append(heading, list);
  return section;
}

function formatFoodReportMacroLine(totals) {
  return [
    `${formatFoodNumber(totals.calories, "calories")} kcal`,
    `Protein ${formatFoodNumber(totals.protein, "protein")}g`,
    `Carbs ${formatFoodNumber(totals.carbs, "carbs")}g`,
    `Fat ${formatFoodNumber(totals.fat, "fat")}g`,
    `Fiber ${formatFoodNumber(totals.fiber, "fiber")}g`
  ].join(" · ");
}

function renderDiaryReport(range) {
  const entries = collectDiaryReportEntries(range);
  const documentNode = createReportDocument("Daily diary report", `${state.board.name} · ${range.label}`);
  const feelings = entries.reduce((counts, item) => {
    counts[item.entry.feeling] = (counts[item.entry.feeling] || 0) + 1;
    return counts;
  }, {});
  const topFeeling = Object.entries(feelings).sort((a, b) => b[1] - a[1])[0]?.[0] || "No entries";
  const summary = document.createElement("div");
  summary.className = "report-metric-grid";
  summary.append(
    createReportMetric("Entries", entries.length, "diary pages"),
    createReportMetric("Most common", topFeeling, "feeling"),
    createReportMetric("First entry", entries.at(-1) ? formatRecordDate(entries.at(-1).dateKey) : "-", "in period"),
    createReportMetric("Latest", entries[0] ? formatRecordDate(entries[0].dateKey) : "-", "saved page")
  );
  documentNode.append(summary, createDiaryFeelingSection(feelings), createDiaryEntrySection(entries));
  return documentNode;
}

function collectDiaryReportEntries(range) {
  const entries = [];
  getCurrentBoardReportCards()
    .filter((card) => card.type === "diary")
    .forEach((card) => {
      normalizeDiaryCard(card);
      Object.entries(card.diaryEntries || {}).forEach(([dateKey, entry]) => {
        if (!isDateInReportRange(dateKey, range)) return;
        const normalizedEntry = normalizeDiaryEntry(entry);
        if (!normalizedEntry.sentence && !normalizedEntry.thoughts) return;
        entries.push({ card, dateKey, entry: normalizedEntry });
      });
    });
  return entries.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function createDiaryFeelingSection(feelings) {
  const section = document.createElement("section");
  section.className = "report-section";
  const heading = document.createElement("h3");
  heading.textContent = "Feeling pattern";
  const grid = document.createElement("div");
  grid.className = "report-chip-grid diary-feeling-report";
  Object.entries(feelings).sort((a, b) => b[1] - a[1]).forEach(([feeling, count]) => {
    const mood = DIARY_MOOD_META[feeling] || { icon: "", label: feeling };
    const chip = document.createElement("span");
    chip.textContent = `${mood.icon} ${mood.label} · ${count}`;
    grid.append(chip);
  });
  if (!grid.children.length) {
    const empty = document.createElement("p");
    empty.textContent = "No diary feelings recorded in this period.";
    section.append(heading, empty);
    return section;
  }
  section.append(heading, grid);
  return section;
}

function createDiaryEntrySection(entries) {
  const section = document.createElement("section");
  section.className = "report-section diary-report-pages";
  const heading = document.createElement("h3");
  heading.textContent = "Diary pages";
  const list = document.createElement("div");
  list.className = "diary-report-list";
  entries.forEach((item) => {
    const mood = DIARY_MOOD_META[item.entry.feeling] || { icon: "", label: item.entry.feeling };
    const page = document.createElement("article");
    const header = document.createElement("div");
    header.className = "diary-report-header";
    const date = document.createElement("strong");
    date.textContent = formatRecordDate(item.dateKey);
    const feeling = document.createElement("span");
    feeling.textContent = `${mood.icon} ${mood.label}`;
    header.append(date, feeling);
    const sentence = document.createElement("p");
    sentence.className = "diary-report-sentence";
    sentence.textContent = item.entry.sentence || "Untitled day";
    const thoughts = document.createElement("p");
    thoughts.textContent = item.entry.thoughts || "";
    page.append(header, sentence);
    if (thoughts.textContent) page.append(thoughts);
    list.append(page);
  });
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.textContent = "No diary entries recorded in this period.";
    list.append(empty);
  }
  section.append(heading, list);
  return section;
}

function createReportDocument(title, meta) {
  const article = document.createElement("article");
  article.className = `report-document report-${activeReportType}`;
  const header = document.createElement("header");
  header.className = "report-document-header";
  const h2 = document.createElement("h2");
  h2.textContent = title;
  const p = document.createElement("p");
  p.textContent = `${meta} · Generated ${formatRecordDateTime(Date.now())}`;
  header.append(h2, p);
  article.append(header);
  return article;
}

function createReportMetric(label, value, detail) {
  const card = document.createElement("div");
  card.className = "report-metric";
  const strong = document.createElement("strong");
  strong.textContent = value;
  const span = document.createElement("span");
  span.textContent = label;
  const small = document.createElement("small");
  small.textContent = detail;
  card.append(strong, span, small);
  return card;
}

function createReportSection(title, lines) {
  const section = document.createElement("section");
  section.className = "report-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  lines.forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  });
  section.append(heading, list);
  return section;
}

function createReportSubhead(text) {
  const p = document.createElement("p");
  p.className = "report-subhead";
  p.textContent = text;
  return p;
}

function formatReportNumber(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatMetricValue(value, suffix, decimals = null) {
  if (value === "" || value === null || typeof value === "undefined") return "-";
  const number = Number(value);
  const formatted = Number.isFinite(number) && typeof decimals === "number"
    ? decimals === 0
      ? String(Math.round(number))
      : number.toFixed(decimals).replace(/\.?0+$/, "")
    : String(value);
  return `${formatted}${suffix ? ` ${suffix}` : ""}`;
}

function printCurrentReport() {
  renderReportsModal();
  document.body.classList.add("print-report");
  window.print();
  window.setTimeout(() => document.body.classList.remove("print-report"), 500);
}

function syncModalOpenState() {
  const hasOpenModal =
    !elements.settingsModal.hidden ||
    !elements.templateModal.hidden ||
    !elements.ideasModal.hidden ||
    !elements.historyModal.hidden ||
    !elements.recordsModal.hidden ||
    !elements.reportsModal.hidden ||
    !elements.moveCardModal.hidden;
  document.body.classList.toggle("modal-open", hasOpenModal);
  syncRailActiveState();
}

function syncRailActiveState() {
  const activeSurface = getActiveRailSurface();
  const railButtons = {
    add: elements.railAddButton,
    templates: elements.railTemplatesButton,
    archive: elements.railArchiveButton,
    reports: elements.railReportsButton,
    settings: elements.railSettingsButton
  };

  Object.entries(railButtons).forEach(([surface, button]) => {
    const isActive = activeSurface === surface;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  const settingsOpen = activeSurface === "settings";
  elements.sidebarToggle.classList.toggle("is-active", settingsOpen);
  elements.sidebarToggle.setAttribute("aria-pressed", settingsOpen ? "true" : "false");
  elements.appShell.dataset.activeSurface = activeSurface;
}

function getActiveRailSurface() {
  if (!elements.cardComposerPanel.hidden) return "add";
  if (!elements.templateModal.hidden || !elements.ideasModal.hidden) return "templates";
  if (!elements.recordsModal.hidden || !elements.historyModal.hidden) return "archive";
  if (!elements.reportsModal.hidden) return "reports";
  if (!elements.settingsModal.hidden) return "settings";
  return "";
}

function renderRecordsModal() {
  const records = getArchivedCards().slice().sort((a, b) => Number(b.archivedAt || 0) - Number(a.archivedAt || 0));
  const readyCards = getReadyToArchiveCards();
  populateArchiveFilterControls(records);
  const filteredRecords = getFilteredArchivedCards(records);
  const completed = records.filter((card) => getProgress(card).percent >= 100).length;
  elements.recordsModalTitle.textContent = "Archived cards";
  elements.recordsModalSummary.textContent =
    readyCards.length || records.length
      ? `${readyCards.length} ready to archive · ${filteredRecords.length}/${records.length} archived shown · ${completed} completed in archive`
      : "Archive completed, paused or discontinued cards so the active board stays focused.";
  elements.recordsModalList.innerHTML = "";
  if (readyCards.length) {
    elements.recordsModalList.append(renderReadyArchiveSection(readyCards));
  }
  if (filteredRecords.length) {
    elements.recordsModalList.append(renderArchivedSection(filteredRecords, records.length));
  }
  if (!readyCards.length && !filteredRecords.length) {
    const empty = document.createElement("div");
    empty.className = "records-empty";
    empty.textContent = records.length ? "No archived cards match these filters." : "No archived cards yet.";
    elements.recordsModalList.append(empty);
  }
  hydrateIcons(elements.recordsModalList);
}

function populateArchiveFilterControls(records) {
  const filters = getArchiveFilters();
  elements.recordsSearch.value = filters.search;
  elements.recordsDateFilter.value = filters.date;
  elements.recordsSort.value = filters.sort;
  state.ui.archiveType = setArchiveSelectOptions(
    elements.recordsTypeFilter,
    "All types",
    records.map((card) => card.type).filter(Boolean),
    filters.type,
    (type) => (TYPE_META[type] || TYPE_META.single).label
  );
  state.ui.archiveArea = setArchiveSelectOptions(
    elements.recordsAreaFilter,
    "All areas",
    records.map((card) => card.category || "General"),
    filters.area
  );
  state.ui.archiveReason = setArchiveSelectOptions(
    elements.recordsReasonFilter,
    "All reasons",
    records.map((card) => card.archiveReason || "archived"),
    filters.reason,
    formatArchiveReason
  );
}

function setArchiveSelectOptions(select, allLabel, values, selectedValue, labelFormatter = (value) => value) {
  const uniqueValues = [...new Set(values.map((value) => normalizeLabel(String(value || ""))).filter(Boolean))].sort((a, b) =>
    labelFormatter(a).localeCompare(labelFormatter(b))
  );
  const options = [{ value: "all", label: allLabel }, ...uniqueValues.map((value) => ({ value, label: labelFormatter(value) }))];
  select.innerHTML = "";
  options.forEach((option) => {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    select.append(node);
  });
  select.value = options.some((option) => option.value === selectedValue) ? selectedValue : "all";
  return select.value;
}

function getArchiveFilters() {
  const ui = state.ui || {};
  return {
    search: normalizeLabel(ui.archiveSearch || ""),
    date: ["all", "7", "30", "year"].includes(ui.archiveDate) ? ui.archiveDate : "all",
    sort: ["newest", "oldest", "title", "progress"].includes(ui.archiveSort) ? ui.archiveSort : "newest",
    type: normalizeLabel(ui.archiveType || "all") || "all",
    area: normalizeLabel(ui.archiveArea || "all") || "all",
    reason: normalizeLabel(ui.archiveReason || "all") || "all"
  };
}

function getFilteredArchivedCards(records) {
  const filters = getArchiveFilters();
  return records
    .filter((card) => {
      if (filters.type !== "all" && card.type !== filters.type) return false;
      if (filters.area !== "all" && (card.category || "General") !== filters.area) return false;
      if (filters.reason !== "all" && (card.archiveReason || "archived") !== filters.reason) return false;
      if (!matchesArchiveDateFilter(card, filters.date)) return false;
      if (filters.search && !getArchiveSearchText(card).includes(filters.search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => sortArchivedCards(a, b, filters.sort));
}

function matchesArchiveDateFilter(card, filter) {
  if (filter === "all") return true;
  const archivedAt = Number(card.archivedAt || 0);
  if (!Number.isFinite(archivedAt) || archivedAt <= 0) return false;
  const now = Date.now();
  if (filter === "7") return archivedAt >= now - 7 * 86400000;
  if (filter === "30") return archivedAt >= now - 30 * 86400000;
  if (filter === "year") return new Date(archivedAt).getFullYear() === new Date().getFullYear();
  return true;
}

function sortArchivedCards(a, b, sort) {
  if (sort === "oldest") return Number(a.archivedAt || 0) - Number(b.archivedAt || 0);
  if (sort === "title") return (a.title || "").localeCompare(b.title || "") || Number(b.archivedAt || 0) - Number(a.archivedAt || 0);
  if (sort === "progress") return getProgress(b).percent - getProgress(a).percent || Number(b.archivedAt || 0) - Number(a.archivedAt || 0);
  return Number(b.archivedAt || 0) - Number(a.archivedAt || 0);
}

function getArchiveSearchText(card) {
  const typeMeta = TYPE_META[card.type] || TYPE_META.single;
  return [
    card.title,
    card.description,
    card.category,
    typeMeta.label,
    card.archiveReason,
    formatArchiveReason(card.archiveReason || "archived"),
    getCardRecordContext(card),
    formatRecordDate(card.archivedAt)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function formatArchiveReason(value) {
  return normalizeLabel(String(value || "archived"))
    .split(" ")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : ""))
    .join(" ");
}

function getReadyToArchiveCards() {
  return state.cards
    .filter(isReadyToArchiveCard)
    .slice()
    .sort((a, b) => getPlanningSortValue(a) - getPlanningSortValue(b) || a.order - b.order);
}

function isReadyToArchiveCard(card) {
  return !isProgresslessCard(card) && getProgress(card).percent >= 100;
}

function renderReadyArchiveSection(cards) {
  const section = createRecordsSection("Ready to archive", `${cards.length} completed on board`);
  const gallery = document.createElement("div");
  gallery.className = "archive-card-gallery";
  cards.forEach((card) => gallery.append(renderReadyArchiveCard(card)));
  section.append(gallery);
  return section;
}

function renderArchivedSection(records, totalRecords) {
  const section = createRecordsSection("Archived cards", `${records.length}/${totalRecords} shown`);
  const gallery = document.createElement("div");
  gallery.className = "archive-card-gallery";
  records.forEach((card) => gallery.append(renderArchivedCard(card)));
  section.append(gallery);
  return section;
}

function createRecordsSection(title, meta) {
  const section = document.createElement("section");
  section.className = "records-section";
  const head = document.createElement("div");
  head.className = "records-section-head";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = meta;
  head.append(strong, span);
  section.append(head);
  return section;
}

function renderReadyArchiveCard(card) {
  return renderArchiveCardFrame(card, {
    status: "Still on board",
    actionLabel: "Archive",
    actionClass: "record-archive",
    actionAttribute: "data-archive-ready-card"
  });
}

function renderArchivedCard(card) {
  return renderArchiveCardFrame(card, {
    status: `${formatArchiveReason(card.archiveReason || "archived")} · ${formatRecordDate(card.archivedAt)}`,
    actionLabel: "Restore",
    actionClass: "record-restore",
    actionAttribute: "data-restore-card"
  });
}

function renderArchiveCardFrame(card, options) {
  const progress = getProgress(card);
  const typeMeta = TYPE_META[card.type] || TYPE_META.single;
  const context = getCardRecordContext(card);
  const frame = document.createElement("article");
  frame.className = `archive-card-frame ${options.actionAttribute === "data-archive-ready-card" ? "is-ready" : "is-archived"}`;
  frame.append(renderArchivePreviewCard(card, progress, typeMeta));
  const footer = document.createElement("div");
  footer.className = "archive-card-footer";
  const meta = document.createElement("div");
  meta.className = "archive-card-meta";
  const title = document.createElement("strong");
  title.textContent = options.status;
  const detail = document.createElement("span");
  detail.textContent = `${typeMeta.label} · ${card.category || "General"}${context ? ` · ${context}` : ""} · ${progress.percent}%`;
  meta.append(title, detail);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `secondary-action ${options.actionClass}`;
  button.textContent = options.actionLabel;
  button.setAttribute(options.actionAttribute, card.id);
  const actions = document.createElement("div");
  actions.className = "archive-card-actions";
  actions.append(button);
  if (options.actionAttribute === "data-restore-card") {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "secondary-action record-delete";
    deleteButton.textContent = "Delete";
    deleteButton.title = "Delete forever";
    deleteButton.setAttribute("aria-label", `Delete forever: ${card.title || "archived card"}`);
    deleteButton.setAttribute("data-delete-archived-card", card.id);
    actions.append(deleteButton);
  }
  footer.append(meta, actions);
  frame.append(footer);
  return frame;
}

function renderArchivePreviewCard(card, progress, typeMeta) {
  const theme = THEMES[card.theme] || THEMES.leaf;
  const priorityMeta = PRIORITY_META[getSelectedPriority(card.priority)];
  const preview = document.createElement("div");
  preview.className = `archive-card-preview theme-${card.theme || "leaf"} type-${card.type || "single"}`;
  preview.style.setProperty("--card-bg", theme.bg);
  preview.style.setProperty("--card-ink", theme.ink);
  preview.style.setProperty("--card-muted", theme.muted);
  preview.style.setProperty("--card-accent", theme.accent);
  preview.style.setProperty("--card-soft", theme.soft);
  preview.style.setProperty("--card-fill", getCardFill(card, theme));
  preview.style.setProperty("--card-shadow-color", hexToRgba(theme.accent, 0.2));
  preview.style.setProperty("--priority-color", priorityMeta.color);

  const top = document.createElement("div");
  top.className = "archive-preview-top";
  const type = document.createElement("span");
  type.className = "archive-preview-chip";
  type.innerHTML = `${ICONS[typeMeta.icon] || ""}<span>${typeMeta.label}</span>`;
  const area = document.createElement("span");
  area.className = "archive-preview-chip";
  area.textContent = card.category || "General";
  const percent = document.createElement("span");
  percent.className = "archive-preview-chip";
  percent.textContent = isProgresslessCard(card) ? progress.label : `${progress.percent}%`;
  top.append(type, area, percent);

  const title = document.createElement("strong");
  title.className = "archive-preview-title";
  title.textContent = getCardDisplayTitle(card);

  const description = document.createElement("p");
  description.className = "archive-preview-description";
  description.textContent = getArchivePreviewDescription(card);

  const track = document.createElement("div");
  track.className = "archive-preview-track";
  const fill = document.createElement("span");
  fill.style.width = `${progress.percent}%`;
  track.append(fill);

  preview.append(top, title, description, track);
  return preview;
}

function getArchivePreviewDescription(card) {
  if (card?.type === "quote") return card.description || card.title || "Motivation";
  return getCardDisplayDescription(card) || getCardRecordContext(card) || "Archived card";
}

function getCardRecordContext(card) {
  const parts = [];
  if (card.type === "daily") {
    parts.push(getPlannedDateTitle(card).replace("Planned for ", ""));
  }
  if (card.type === "planner") {
    parts.push(formatPlannerDate(getActivePlannerDate(card)));
  }
  if (card.type === "diary") {
    parts.push(formatDiaryDate(getActiveDiaryDate(card)));
  }
  const priority = getSelectedPriority(card.priority);
  if (priority !== "normal") {
    parts.push(PRIORITY_META[priority].label);
  }
  return parts.join(" · ");
}

function archiveCard(id, options = {}) {
  const index = state.cards.findIndex((card) => card.id === id);
  if (index < 0) return;
  const [card] = state.cards.splice(index, 1);
  const reason = normalizeLabel(options.reason || getArchiveReason(card));
  const archivedCard = normalizeArchivedCard({
    ...card,
    runningSince: null,
    archivedAt: Date.now(),
    archiveReason: reason
  });
  state.archivedCards = [archivedCard, ...getArchivedCards()];
  if (editingCardId === id) {
    resetFormState();
  }
  saveState();
  render();
  if (!elements.recordsModal.hidden) {
    renderRecordsModal();
  }
  if (options.showUndo !== false) {
    showUndoToast({
      message: options.message || `"${card.title}" moved to Archive.`,
      onUndo: () => restoreArchivedCard(archivedCard.id, { fromUndo: true })
    });
  }
}

function moveActiveCardToBoard(cardId, targetBoardId) {
  syncActiveBoard();
  const sourceBoardId = state.activeBoardId;
  const sourceBoard = state.boards.find((board) => board.id === sourceBoardId);
  const targetBoard = state.boards.find((board) => board.id === targetBoardId);
  if (!sourceBoard || !targetBoard || sourceBoardId === targetBoardId) return;

  const cardIndex = state.cards.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) return;
  const [card] = state.cards.splice(cardIndex, 1);
  const now = Date.now();
  const movedCard = normalizeCard({
    ...card,
    runningSince: null,
    layoutColumn: 0,
    order: getNextBoardOrder(targetBoard),
    movedFromBoardId: sourceBoardId,
    movedFromBoardName: sourceBoard.name,
    movedToBoardId: targetBoardId,
    movedToBoardName: targetBoard.name,
    movedAt: now,
    updatedAt: now
  });

  sourceBoard.cards = state.cards.map(normalizeCard);
  sourceBoard.updatedAt = now;
  targetBoard.cards = [...(Array.isArray(targetBoard.cards) ? targetBoard.cards : []), movedCard].map(normalizeCard);
  targetBoard.updatedAt = now;

  if (editingCardId === cardId) {
    resetFormState();
  }
  closeMoveCardModal();
  saveState();
  render();
  showUndoToast({
    message: `"${card.title}" moved to ${targetBoard.name}.`,
    onUndo: () => moveCardBackToBoard(movedCard.id, targetBoardId, sourceBoardId)
  });
}

function moveCardBackToBoard(cardId, sourceBoardId, targetBoardId) {
  syncActiveBoard();
  const sourceBoard = state.boards.find((board) => board.id === sourceBoardId);
  const targetBoard = state.boards.find((board) => board.id === targetBoardId);
  if (!sourceBoard || !targetBoard) return;
  const sourceCards = sourceBoardId === state.activeBoardId ? state.cards : Array.isArray(sourceBoard.cards) ? sourceBoard.cards : [];
  const cardIndex = sourceCards.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) return;
  const [card] = sourceCards.splice(cardIndex, 1);
  const now = Date.now();
  const restoredCard = normalizeCard({
    ...card,
    runningSince: null,
    layoutColumn: 0,
    order: getNextBoardOrder(targetBoard),
    movedAt: now,
    movedFromBoardId: sourceBoardId,
    movedFromBoardName: sourceBoard.name,
    movedToBoardId: targetBoardId,
    movedToBoardName: targetBoard.name,
    updatedAt: now
  });
  sourceBoard.cards = sourceCards.map(normalizeCard);
  sourceBoard.updatedAt = now;
  targetBoard.cards = [...(Array.isArray(targetBoard.cards) ? targetBoard.cards : []), restoredCard].map(normalizeCard);
  targetBoard.updatedAt = now;
  if (targetBoardId === state.activeBoardId) {
    state.cards = targetBoard.cards.map(normalizeCard);
  }
  saveState();
  render();
  clearUndoToast();
}

function getNextBoardOrder(board) {
  const cards = Array.isArray(board?.cards) ? board.cards : [];
  return cards.length ? Math.max(...cards.map((card) => Number(card.order) || 0)) + 1 : 1;
}

function restoreArchivedCard(id, options = {}) {
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
  if (!elements.recordsModal.hidden) {
    renderRecordsModal();
  }
  if (options.fromUndo) {
    clearUndoToast();
  }
}

function permanentlyDeleteArchivedCard(id) {
  const records = getArchivedCards();
  const index = records.findIndex((card) => card.id === id);
  if (index < 0) return;
  const card = records[index];
  const title = card.title || "this archived card";
  const firstConfirm = window.confirm(`Delete "${title}" forever? This cannot be undone.`);
  if (!firstConfirm) return;
  const secondConfirm = window.confirm(`Final confirmation: permanently delete "${title}" from Archive?`);
  if (!secondConfirm) return;
  records.splice(index, 1);
  state.archivedCards = records;
  saveState();
  renderBoardMeta();
  if (!elements.recordsModal.hidden) {
    renderRecordsModal();
  }
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

function showUndoToast({ message, onUndo }) {
  pendingUndoAction = typeof onUndo === "function" ? onUndo : null;
  elements.undoToastText.textContent = message;
  elements.undoToast.hidden = false;
  window.clearTimeout(undoToastTimer);
  undoToastTimer = window.setTimeout(clearUndoToast, 12000);
}

function runPendingUndo() {
  if (!pendingUndoAction) return;
  const action = pendingUndoAction;
  pendingUndoAction = null;
  window.clearTimeout(undoToastTimer);
  action();
}

function clearUndoToast() {
  pendingUndoAction = null;
  window.clearTimeout(undoToastTimer);
  elements.undoToast.hidden = true;
}

function formatRecordDate(value) {
  const date = new Date(Number(value) || value || Date.now());
  if (!Number.isFinite(date.getTime())) return "today";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatRecordDateTime(value) {
  const date = new Date(Number(value) || value || Date.now());
  if (!Number.isFinite(date.getTime())) return "today";
  const dateText = date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const timeText = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${dateText}, ${timeText}`;
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

function formatTodayLine() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
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
      elements.checklistItems.value.trim() ||
      elements.plannerNote.value.trim() ||
      elements.diarySentence.value.trim() ||
      elements.diaryThoughts.value.trim() ||
      elements.quoteAuthor.value.trim() ||
      elements.videoUrl.value.trim() ||
      elements.imageUrl.value.trim() ||
      attachedImageData ||
      elements.includeImage.checked ||
      elements.cardType.value !== "daily" ||
      elements.cardBackground.value !== "clean" ||
      elements.cardPriority.value !== "normal" ||
      normalizeDateKey(elements.plannerDate.value) !== getTodayKey() ||
      normalizePlannerViewMode(elements.plannerViewMode.value) !== "today" ||
      elements.plannerViewExcludeToday.checked ||
      elements.plannerViewExcludeWeek.checked ||
      elements.plannerViewExcludeMonth.checked ||
      elements.plannerViewShowGuide.checked ||
      normalizeDateKey(elements.diaryDate.value) !== getTodayKey() ||
      elements.diaryFeeling.value !== "Calm" ||
      normalizeDateKey(elements.cardPlanDate.value) !== getTodayKey() ||
      elements.cardCategory.value !== "General" ||
      elements.cardCategoryCustom.value.trim()
  );
}

function normalizeLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeVideoUrl(value) {
  const label = String(value || "").trim();
  if (!label) return "";
  try {
    const url = new URL(label);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeRemoteAssetUrl(value) {
  const label = String(value || "").trim();
  if (!label) return "";
  try {
    const url = new URL(label);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeCategory(value) {
  const label = normalizeLabel(String(value || ""));
  if (!label) return "General";
  return CATEGORY_ALIASES[label.toLowerCase()] || label;
}

function getPlannerGroup(card) {
  return normalizeCategory(card?.plannerGroup || card?.category || card?.metadata?.category || "General");
}

function normalizePlannerViewMode(value) {
  return ["today", "week", "month", "upcoming"].includes(value) ? value : "today";
}

function normalizePlannerViewOptions(options = {}) {
  return {
    excludeToday: Boolean(options.excludeToday),
    excludeWeek: Boolean(options.excludeWeek),
    excludeMonth: Boolean(options.excludeMonth),
    showGuide: Boolean(options.showGuide),
    sourceMode: options.sourceMode === "area" ? "area" : "board"
  };
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
  if (dateKey === getTodayKey()) return "";
  const date = dateKeyToLocalDate(dateKey);
  const relative = getRelativeDateLabel(dateKey, getProgress(card).percent);
  const dateLabel = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return relative ? `${relative} · ${dateLabel}` : dateLabel;
}

function getPlannedDateTitle(card) {
  if (!card || !["daily", "planner", "diary", "food"].includes(card.type)) return "";
  const dateKey =
    card.type === "planner"
      ? getActivePlannerDate(card)
      : card.type === "diary"
        ? getActiveDiaryDate(card)
        : card.type === "food"
          ? getActiveFoodDate(card)
          : getCardPlanDate(card);
  const date = dateKeyToLocalDate(dateKey);
  const prefix = card.type === "diary" ? "Diary page for" : card.type === "planner" ? "Planner date for" : card.type === "food" ? "Food log for" : "Planned for";
  return `${prefix} ${date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;
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

function getEmptyTimer() {
  return {
    mode: "none",
    targetAt: null,
    duration: 0
  };
}

function getFormTimer() {
  if (selectedTimerMode === "none") {
    return getEmptyTimer();
  }

  if (selectedTimerMode === "date") {
    const targetDate = new Date(elements.timerDate.value);
    const targetMs = targetDate.getTime();
    const isValidTarget = Number.isFinite(targetMs) && targetMs > Date.now();
    const fallbackTarget = new Date(Date.now() + 24 * 60 * 60 * 1000);
    fallbackTarget.setSeconds(0, 0);
    const finalTarget = isValidTarget ? targetDate : fallbackTarget;
    const duration = Math.ceil((finalTarget.getTime() - Date.now()) / 1000);
    return {
      mode: "date",
      targetAt: finalTarget.toISOString(),
      duration: Math.max(60, duration)
    };
  }

  if (selectedTimerMode === "days") {
    const days = clampInt(elements.timerDays.value, 1, 365, 1);
    const duration = days * 24 * 60 * 60;
    return {
      mode: "days",
      targetAt: new Date(Date.now() + duration * 1000).toISOString(),
      duration
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

  elements.timerShowSeconds.checked = false;
  const hours = Math.floor(card.duration / 3600);
  const minutes = Math.floor((card.duration % 3600) / 60);
  elements.timerHours.value = String(hours);
  elements.timerMinutes.value = String(minutes);
}

function toggleTimer(id) {
  const card = state.cards.find((item) => item.id === id);
  if (!card) return;
  normalizeTimer(card);
  if (!isManualTimer(card)) return;
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
  if (!isManualTimer(card)) return;
  card.remaining = card.duration;
  card.runningSince = null;
  saveState();
  renderCardsOnly();
}

function startAllTimers() {
  const now = Date.now();
  state.cards.forEach((card) => {
    normalizeTimer(card);
    if (!isManualTimer(card)) return;
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
    if (!isManualTimer(card)) return;
    card.remaining = getRemaining(card);
    card.runningSince = null;
  });
  saveState();
  renderCardsOnly();
}

function deleteCard(id) {
  const card = state.cards.find((item) => item.id === id);
  if (!card) return;
  archiveCard(id, {
    reason: "removed from board",
    message: `"${card.title}" removed from the board and kept in Archive.`
  });
}

function moveCardToPosition(sourceId, targetId, targetColumn) {
  if (!sourceId || sourceId === targetId) return;
  const columnCount = getRenderedBoardColumnCount();
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
  const columnCount = getRenderedBoardColumnCount();
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
  draggedCardId = null;
  elements.boardGrid.classList.remove("is-dragging-card");
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
  const columns = getCustomLayoutColumns(getRenderedBoardColumnCount());
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
  const weights = { planner: 0, planlist: 1, diary: 2, brief: 3, fitness: 4, food: 5, routine: 6, scheduled: 7, daily: 8, event: 9, quote: 10, video: 11, lab: 12, workout: 13, minutes: 14, checklist: 15, weekly: 16, monthly: 17, annual: 18, single: 19 };
  return Number.isFinite(weights[type]) ? weights[type] : 9;
}

function isProgresslessCard(card) {
  return card && CONTENT_CARD_TYPES.includes(card.type);
}

function isUntimedContentType(type) {
  return CONTENT_CARD_TYPES.includes(type);
}

function matchesFilter(card) {
  if (isProgresslessCard(card)) return state.activeFilter !== "done";
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
  const plannerEntry = card.type === "planner" ? getPlannerEntry(card, getActivePlannerDate(card)) : null;
  const diaryEntry = card.type === "diary" ? getDiaryEntry(card, getActiveDiaryDate(card)) : null;
  const fitnessEntry = card.type === "fitness" ? getFitnessEntry(card, getActiveFitnessDate(card)) : null;
  const foodEntry = card.type === "food" ? getFoodEntry(card, getActiveFoodDate(card)) : null;
  const foodText = foodEntry
    ? [
        ...foodEntry.meals.map((meal) => meal.name),
        ...foodEntry.meals.flatMap((meal) => meal.items.map((item) => getFoodById(card, item.foodId)?.name || ""))
      ].join(" ")
    : "";
  const parts = [
    card.title,
    card.description,
    card.category,
    card.quoteAuthor,
    card.videoUrl,
    plannerEntry?.note,
    card.type === "planlist" ? getPlannerViewLabel(card.plannerView) : "",
    card.type === "planlist" ? getPlannerGroup(card) : "",
    diaryEntry?.feeling,
    diaryEntry?.sentence,
    diaryEntry?.thoughts,
    fitnessEntry?.notes,
    fitnessEntry ? getActiveFitnessParts(fitnessEntry).map((part) => part.label).join(" ") : "",
    foodText,
    card.type === "food" ? "calories protein carbs fat fiber meals nutrition food target" : "",
    typeMeta.label,
    progress.label,
    getSelectedPriority(card.priority),
    ["daily", "planner", "diary", "food"].includes(card.type) ? getPlannedDateTitle(card) : ""
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
  const trackableCards = cards.filter((card) => !isProgresslessCard(card));
  return trackableCards.length
    ? Math.round(trackableCards.reduce((sum, card) => sum + getProgress(card).percent, 0) / trackableCards.length)
    : 0;
}

function getProgress(card) {
  if (card.type === "planner") {
    const entry = getPlannerEntry(card, getActivePlannerDate(card));
    return { percent: entry.note ? 100 : 0, label: entry.note ? "Planned" : "Planner" };
  }

  if (card.type === "planlist") {
    const data = getPlannerViewData(card.plannerView, getPlannerGroup(card), card.plannerViewOptions);
    const done = data.items.filter((item) => item.done).length;
    return { percent: data.items.length ? Math.round((done / data.items.length) * 100) : 0, label: data.items.length ? `${done}/${data.items.length} done` : "0 linked" };
  }

  if (card.type === "diary") {
    const entry = getDiaryEntry(card, getActiveDiaryDate(card));
    const hasEntry = Boolean(entry.sentence || entry.thoughts);
    return { percent: hasEntry ? 100 : 0, label: hasEntry ? "Saved" : "Diary" };
  }

  if (card.type === "quote") {
    return { percent: 0, label: "Words" };
  }

  if (card.type === "video") {
    return { percent: 0, label: "Media" };
  }

  if (card.type === "fitness") {
    const entry = getFitnessEntry(card, getActiveFitnessDate(card));
    const activeParts = getActiveFitnessParts(entry);
    return { percent: activeParts.length ? 100 : 0, label: activeParts.length ? `${activeParts.length} parts` : "Fitness" };
  }

  if (card.type === "food") {
    const entry = getFoodEntry(card, getActiveFoodDate(card));
    const totals = getFoodEntryTotals(card, entry);
    const target = getFoodTarget(card, getActiveFoodDate(card));
    const percent = target.calories ? Math.min(100, Math.round((totals.calories / target.calories) * 100)) : 0;
    const itemCount = entry.meals.reduce((sum, meal) => sum + meal.items.length, 0);
    return { percent, label: itemCount ? `${formatFoodNumber(totals.calories, "calories")} kcal` : "Food" };
  }

  if (card.type === "single") {
    const percent = card.done ? 100 : 0;
    return { percent, label: card.done ? "Complete" : "Not done" };
  }

  if (card.type === "event") {
    const remaining = getRemaining(card);
    const duration = Math.max(60, Number(card.duration) || remaining || 60);
    const elapsed = Math.max(0, duration - remaining);
    const percent = remaining <= 0 ? 100 : Math.min(99, Math.round((elapsed / duration) * 100));
    return { percent, label: remaining <= 0 ? "Event reached" : "Countdown" };
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

function isAutomaticCountdown(card) {
  return hasCountdown(card) && ["daily", "date", "days"].includes(card.timerMode);
}

function shouldTickCountdownEverySecond(card) {
  return isAutomaticCountdown(card) && Boolean(card.showTimerSeconds) && getRemaining(card) > 0;
}

function isManualTimer(card) {
  return hasCountdown(card) && card.timerMode === "hours";
}

function getRemaining(card) {
  normalizeTimer(card);
  if (!hasCountdown(card)) return 0;
  if (card.type === "routine" || card.timerMode === "daily") {
    return getSecondsUntilEndOfDay();
  }
  if ((card.timerMode === "date" || card.timerMode === "days") && card.targetAt) {
    const targetDate = new Date(card.targetAt);
    const targetMs = targetDate.getTime();
    if (Number.isFinite(targetMs)) {
      return Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
    }
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

  if (card.timerMode === "days" && !card.targetAt) {
    const remaining = Number.isFinite(Number(card.remaining)) ? Number(card.remaining) : card.duration;
    card.targetAt = new Date(Date.now() + Math.max(60, remaining) * 1000).toISOString();
  }

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

function resetDiaryCardsToToday() {
  const today = getTodayKey();
  let changed = false;
  state.cards.forEach((card) => {
    if (card.type !== "diary") return;
    normalizeDiaryCard(card);
    if (card.lastDiaryDate === today) return;
    if (card.activeDate === card.lastDiaryDate) {
      card.activeDate = today;
    }
    card.lastDiaryDate = today;
    getDiaryEntry(card, today);
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
  if (remaining <= 0) return card.type === "event" ? "Reached" : "Time up";
  if (card.timerMode === "daily") return "Auto day reset";
  if (card.timerMode === "date" && card.targetAt) {
    const date = new Date(card.targetAt);
    if (Number.isFinite(date.getTime())) {
      const dateLabel = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return card.showTimerSeconds ? `Live · ${dateLabel}` : `Auto · ${dateLabel}`;
    }
  }
  if (card.timerMode === "days") return card.showTimerSeconds ? "Live days left" : "Auto days left";
  return "Time left";
}

function formatRemaining(card, totalSeconds) {
  if (!hasCountdown(card)) return "Open";
  if (totalSeconds <= 0 && !isManualTimer(card)) {
    return card.type === "event" ? "Reached" : "Closed";
  }
  if ((card.timerMode === "date" || card.timerMode === "days") && totalSeconds >= 24 * 60 * 60) {
    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    if (card.showTimerSeconds) {
      return `${days}d ${formatTime(totalSeconds % (24 * 60 * 60))}`;
    }
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

async function fileToSafeImageDataUrl(file) {
  if (!file) return "";
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    throw new Error("Image is too large. Use an image under 1.5 MB so the board can save reliably.");
  }
  return fileToDataUrl(file);
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
  return String(value || "").replace(/[&<>"']/g, (character) => {
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

function createBoardRecord({ id = createId(), name, visibility = "private", layout = "smart", savedLayout = [], cards = [], archivedCards = [], createdAt = Date.now(), updatedAt = createdAt }) {
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
    createdAt,
    updatedAt: normalizeTimestamp(updatedAt) || normalizeTimestamp(createdAt) || Date.now()
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
          createdAt: board.createdAt || Date.now(),
          updatedAt: board.updatedAt || board.savedAt || board.createdAt || Date.now()
        })
      )
    : [];

  if (!nextState.boards.length) {
    const activeId = nextState.activeBoardId || "personal-board";
    nextState.boards.push(
      createBoardRecord({
        id: activeId,
        name: nextState.board?.name || "My Life OS",
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
    archivedCards: getArchivedCards().map(normalizeArchivedCard),
    updatedAt: getStateUpdatedAt(state) || Date.now()
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
        title: "Life planner",
        description: "Enter dated plans once, then let the linked views show the right range.",
        category: "Personal",
        type: "planner",
        theme: "leaf",
        background: "clean",
        activePlannerDate: getTodayKey(),
        plannerEntries: {
          [getTodayKey()]: normalizePlannerEntry({
            note: "Confirm today's errand before lunch.\nSend one personal follow-up.",
            updatedAt: Date.now()
          }),
          [getTodayKey(addDays(new Date(), 2))]: normalizePlannerEntry({
            note: "Prepare notes for the weekend plan.",
            updatedAt: Date.now()
          }),
          [getTodayKey(addDays(new Date(), 12))]: normalizePlannerEntry({
            note: "Review next month budget and travel ideas.",
            updatedAt: Date.now()
          }),
          [getTodayKey(addDays(new Date(), 55))]: normalizePlannerEntry({
            note: "Check passport, flights and annual leave.",
            updatedAt: Date.now()
          })
        }
      }),
      makeCard({
        title: "Today planner view",
        description: "Personal planner items dated today.",
        category: "Personal",
        type: "planlist",
        plannerView: "today",
        theme: "leaf",
        background: "clean"
      }),
      makeCard({
        title: "Week planner view",
        description: "Rest of this week, excluding today's planner items.",
        category: "Personal",
        type: "planlist",
        plannerView: "week",
        plannerViewOptions: { excludeToday: true },
        theme: "tide",
        background: "sky"
      }),
      makeCard({
        title: "Month planner view",
        description: "Later this month, excluding today and this week.",
        category: "Personal",
        type: "planlist",
        plannerView: "month",
        plannerViewOptions: { excludeToday: true, excludeWeek: true },
        theme: "plum",
        background: "paper"
      }),
      makeCard({
        title: "Upcoming planner view",
        description: "Personal plans beyond this month.",
        category: "Personal",
        type: "planlist",
        plannerView: "upcoming",
        theme: "honey",
        background: "paper"
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
        title: "Daily food tracker",
        description: "Log meals by grams or unit, then compare calories, protein, carbs, fats and fiber against this month's targets.",
        category: "Health",
        type: "food",
        theme: "leaf",
        background: "mint"
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
        title: "Daily diary",
        description: "Capture the day without turning it into another task list.",
        category: "Personal",
        type: "diary",
        theme: "plum",
        background: "paper",
        feeling: "Calm",
        sentence: "Today I will notice what actually moved.",
        thoughts: "Use the arrows to review older pages when planning the week."
      }),
      makeCard({
        title: "Operating reminder",
        description: "What gets captured can be improved. What gets reviewed can be trusted.",
        category: "Personal",
        type: "quote",
        theme: "honey",
        background: "paper",
        quoteAuthor: "Board principle"
      }),
      makeCard({
        title: "Joy list",
        description: "Protect small things that keep life enjoyable while the board handles the serious work.",
        category: "Personal",
        type: "brief",
        theme: "honey",
        background: "paper",
        sections: [
          ["Today", "One simple thing you can enjoy after the main priority."],
          ["This week", "A meal, person, hobby or place you want to make space for."],
          ["Recovery", "A reset that helps tomorrow feel lighter."]
        ]
      }),
      makeCard({
        title: "Learning video queue",
        description: "Keep the video beside the life area it supports instead of losing it in a browser tab.",
        category: "Learning",
        type: "video",
        theme: "tide",
        background: "sky",
        videoUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw"
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

  if (templateId === "workday-command") {
    return [
      makeCard({
        title: "Morning command brief",
        description: "Set the day before messages and meetings take over.",
        category: "Work",
        priority: "high",
        type: "brief",
        theme: "graphite",
        background: "paper",
        timerMode: "date",
        targetAt: getStartOfTomorrow().toISOString(),
        duration: getSecondsUntilEndOfDay(),
        sections: [
          ["Win", "Name the one work outcome that makes today successful."],
          ["Health", "Pick one energy action: walk, water, training or sleep protection."],
          ["People", "Choose one person to update, thank or unblock."],
          ["Boundary", "Protect the first focus block before inbox checking."]
        ]
      }),
      makeCard({
        title: "First focus block",
        description: "A protected sprint for the highest-leverage task.",
        category: "Work",
        priority: "high",
        type: "single",
        theme: "tide",
        background: "sky",
        timerMode: "hours",
        duration: 90 * 60
      }),
      makeCard({
        title: "Deep work bank",
        description: "Build a weekly reserve of concentrated work minutes.",
        category: "Work",
        type: "minutes",
        theme: "tide",
        background: "clean",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        targetValue: 600,
        currentValue: 0,
        unit: "min"
      }),
      makeCard({
        title: "Meeting follow-up queue",
        description: "Capture commitments before they become mental load.",
        category: "Work",
        type: "daily",
        plannedDate: getTodayKey(),
        theme: "graphite",
        background: "clean",
        timerMode: "date",
        targetAt: getStartOfTomorrow().toISOString(),
        duration: getSecondsUntilEndOfDay(),
        items: ["Send notes", "Assign owners", "Book next step", "Archive reference"]
      }),
      makeCard({
        title: "Communication window",
        description: "Batch messages so the day is not broken into fragments.",
        category: "Work",
        type: "scheduled",
        theme: "plum",
        background: "paper",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        scheduleDays: [0, 1, 2, 3, 4],
        checks: [false, false, false, false, false, false, false]
      }),
      makeCard({
        title: "Energy check",
        description: "Keep the basics visible during a demanding workday.",
        category: "Health",
        type: "routine",
        theme: "leaf",
        background: "mint",
        items: ["Drink water", "Stand or walk", "Eat protein", "Stop caffeine on time"]
      }),
      makeCard({
        title: "Shutdown review",
        description: "Close the day and hand tomorrow a cleaner start.",
        category: "Personal",
        type: "diary",
        theme: "plum",
        background: "paper",
        feeling: "Calm",
        sentence: "Today I closed the most important loop.",
        thoughts: "Log wins, missed promises, and the first task for tomorrow."
      })
    ];
  }

  if (templateId === "business-operator") {
    return [
      makeCard({
        title: "Owner command brief",
        description: "A concise operating view for revenue, delivery, cash and people.",
        category: "Work",
        priority: "high",
        type: "brief",
        theme: "graphite",
        background: "paper",
        timerMode: "date",
        targetAt: getStartOfTomorrow().toISOString(),
        duration: getSecondsUntilEndOfDay(),
        sections: [
          ["Revenue", "One action that can create or advance revenue today."],
          ["Delivery", "The promise that needs the most protection."],
          ["Cash", "One payment, invoice or expense to clarify."],
          ["People", "One decision or update that removes friction."]
        ]
      }),
      makeCard({
        title: "Pipeline pulse",
        description: "Keep sales conversations moving with clear next steps.",
        category: "Work",
        type: "checklist",
        theme: "coral",
        background: "blush",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        items: ["List warm leads", "Send follow-ups", "Move one proposal", "Book decision call", "Update next actions"]
      }),
      makeCard({
        title: "Cash commitments",
        description: "Review invoices, subscriptions, tax items and upcoming payments.",
        category: "Finance",
        type: "weekly",
        theme: "honey",
        background: "paper",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        checks: [false, false, false, false, false, false, false]
      }),
      makeCard({
        title: "Decision log",
        description: "Track open decisions so they do not stay in your head.",
        category: "Work",
        type: "brief",
        theme: "leaf",
        background: "mint",
        sections: [
          ["Decide", "What decision needs an answer."],
          ["Options", "The realistic paths on the table."],
          ["Owner", "Who can supply missing context."],
          ["Deadline", "When the decision should be locked."]
        ]
      }),
      makeCard({
        title: "Delivery promises",
        description: "Client, team or product commitments that need visible progress.",
        category: "Work",
        type: "checklist",
        theme: "tide",
        background: "sky",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        items: ["Confirm scope", "Check blockers", "Send progress update", "Review quality", "Plan next delivery"]
      }),
      makeCard({
        title: "People touchpoints",
        description: "Business moves faster when important people are not forgotten.",
        category: "Personal",
        type: "weekly",
        theme: "plum",
        background: "clean",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        checks: [false, false, false, false, false, false, false]
      }),
      makeCard({
        title: "Weekly owner review",
        description: "Review numbers, bottlenecks and the few moves that matter next week.",
        category: "Work",
        type: "checklist",
        theme: "graphite",
        background: "clean",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        items: ["Review revenue", "Review cash", "Review delivery", "Review people", "Choose next week's Big 3"]
      })
    ];
  }

  if (templateId === "student-life") {
    return [
      makeCard({
        title: "Today class plan",
        description: "A dated list for lectures, assignments and admin.",
        category: "Learning",
        priority: "high",
        type: "daily",
        plannedDate: getTodayKey(),
        theme: "tide",
        background: "sky",
        timerMode: "date",
        targetAt: getStartOfTomorrow().toISOString(),
        duration: getSecondsUntilEndOfDay(),
        items: ["Attend class", "Capture key notes", "Submit urgent work", "Pack tomorrow's materials"]
      }),
      makeCard({
        title: "Study block bank",
        description: "Accumulate focused study minutes without overplanning.",
        category: "Learning",
        type: "minutes",
        theme: "leaf",
        background: "mint",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        targetValue: 360,
        currentValue: 0,
        unit: "min"
      }),
      makeCard({
        title: "Assignment tracker",
        description: "Move each assignment from brief to submission.",
        category: "Learning",
        type: "checklist",
        theme: "honey",
        background: "paper",
        timerMode: "date",
        targetAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        duration: 10 * 24 * 60 * 60,
        items: ["Read brief", "Research sources", "Draft answer", "Edit", "Submit"]
      }),
      makeCard({
        title: "Exam countdown",
        description: "Keep the final date visible while the daily plan changes.",
        category: "Learning",
        type: "single",
        theme: "coral",
        background: "blush",
        timerMode: "date",
        targetAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        duration: 21 * 24 * 60 * 60
      }),
      makeCard({
        title: "Wellbeing basics",
        description: "Study works better when sleep, food and movement stay visible.",
        category: "Health",
        type: "routine",
        theme: "leaf",
        background: "mint",
        items: ["Sleep plan", "Drink water", "Move body", "Eat proper meal", "Short room reset"]
      }),
      makeCard({
        title: "Campus life",
        description: "Keep social and personal moments beside academic pressure.",
        category: "Personal",
        type: "weekly",
        theme: "plum",
        background: "clean",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        checks: [false, false, false, false, false, false, false]
      }),
      makeCard({
        title: "Reflection diary",
        description: "A quick dated page for learning, mood and lessons.",
        category: "Personal",
        type: "diary",
        theme: "plum",
        background: "paper",
        feeling: "Focused",
        sentence: "I studied with a clearer plan today.",
        thoughts: "Write what worked, what felt hard, and what to adjust tomorrow."
      })
    ];
  }

  if (templateId === "personal-reset") {
    return [
      makeCard({
        title: "Daily reset",
        description: "A soft daily loop for keeping life from piling up.",
        category: "Personal",
        priority: "high",
        type: "routine",
        theme: "leaf",
        background: "mint",
        items: ["Make bed", "Clear dishes", "Tidy one surface", "Plan tomorrow", "Sleep wind-down"]
      }),
      makeCard({
        title: "Home queue",
        description: "Small home tasks that free up mental space.",
        category: "Personal",
        type: "checklist",
        theme: "graphite",
        background: "clean",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        items: ["Laundry", "Groceries", "Bills", "Declutter one spot", "Prepare meals"]
      }),
      makeCard({
        title: "Energy basics",
        description: "Track the few inputs that shape most days.",
        category: "Health",
        type: "routine",
        theme: "tide",
        background: "sky",
        items: ["7+ hours sleep", "2L water", "Walk", "Protein each meal", "Sunlight"]
      }),
      makeCard({
        title: "Relationship deposits",
        description: "Keep important people visible, not only urgent work.",
        category: "Personal",
        type: "weekly",
        theme: "plum",
        background: "paper",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        checks: [false, false, false, false, false, false, false]
      }),
      makeCard({
        title: "Joy list",
        description: "Small things to look forward to this week.",
        category: "Personal",
        type: "brief",
        theme: "honey",
        background: "paper",
        sections: [
          ["Today", "A meal, walk, show, call or hobby block."],
          ["This week", "One plan that makes the week feel more human."],
          ["Recovery", "A reset that helps tomorrow feel easier."]
        ]
      }),
      makeCard({
        title: "Daily diary",
        description: "Record mood, one sentence and thoughts for the day.",
        category: "Personal",
        type: "diary",
        theme: "plum",
        background: "paper",
        feeling: "Calm",
        sentence: "I made space to notice the day.",
        thoughts: "Use this for memories, worries, lessons, gratitude and reminders."
      }),
      makeCard({
        title: "Weekly life review",
        description: "Review health, home, money, relationships and work pressure.",
        category: "Personal",
        type: "checklist",
        theme: "leaf",
        background: "clean",
        timerMode: "days",
        duration: 7 * 24 * 60 * 60,
        items: ["Review calendar", "Review spending", "Review home queue", "Review energy", "Choose next week focus"]
      })
    ];
  }

  if (templateId === "creative-life") {
    return [
      makeCard({
        title: "Idea inbox",
        description: "Capture creative sparks before they disappear.",
        category: "Personal",
        type: "brief",
        theme: "honey",
        background: "paper",
        sections: [
          ["Idea", "What caught your attention."],
          ["Why", "The emotion, audience or problem behind it."],
          ["Next", "A tiny test you can create."],
          ["Reference", "Link, image or video to attach later."]
        ]
      }),
      makeCard({
        title: "Inspiration video",
        description: "Save a video reference beside the creative project it supports.",
        category: "Learning",
        type: "video",
        theme: "tide",
        background: "sky",
        videoUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw"
      }),
      makeCard({
        title: "Creator habit",
        description: "Repeat the small creative actions that build momentum.",
        category: "Personal",
        type: "routine",
        theme: "coral",
        background: "blush",
        items: ["Capture one idea", "Make one draft", "Save one reference", "Share or review one piece"]
      }),
      makeCard({
        title: "Publishing cadence",
        description: "Track the days you publish, practice or ship.",
        category: "Personal",
        type: "monthly",
        theme: "plum",
        background: "paper",
        timerMode: "days",
        duration: 30 * 24 * 60 * 60,
        checks: Array.from({ length: daysInCurrentMonth() }, () => false)
      }),
      makeCard({
        title: "Motivation wall",
        description: "The work becomes real when you keep showing up.",
        category: "Personal",
        type: "quote",
        theme: "honey",
        background: "paper",
        quoteAuthor: "Creative principle"
      }),
      makeCard({
        title: "Project polish list",
        description: "Move one creative project toward a finished version.",
        category: "Work",
        type: "checklist",
        theme: "graphite",
        background: "clean",
        timerMode: "days",
        duration: 14 * 24 * 60 * 60,
        items: ["Clarify concept", "Draft", "Edit", "Package", "Publish"]
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
        title: "Workout session log",
        description: "Record the workout parts, exercises, running and body metrics for each training day.",
        category: "Health",
        type: "fitness",
        theme: "leaf",
        background: "mint",
        timerMode: "none"
      }),
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
  const timerMode = isUntimedContentType(options.type)
    ? "none"
    : autoTimer
      ? "daily"
      : ["none", "date", "days", "hours"].includes(options.timerMode)
        ? options.timerMode
        : "none";
  const duration = timerMode === "none" ? 0 : autoTimer ? autoTimer.duration : Number(options.duration) || 25 * 60;
  const targetAt =
    autoTimer
      ? autoTimer.targetAt
      : options.targetAt || (timerMode === "days" ? new Date(Date.now() + duration * 1000).toISOString() : null);
  const category = normalizeCategory(options.category || "General");
  const card = {
    id,
    title: options.title,
    description: options.description || "",
    category,
    reward: "",
    priority: getSelectedPriority(options.priority),
    metadata: { category },
    type: options.type || "single",
    size: "standard",
    theme: options.theme || "leaf",
    background: options.background || "clean",
    includeImage: Boolean(options.includeImage),
    imageUrl: normalizeRemoteAssetUrl(options.imageUrl || ""),
    imageData: "",
    timerMode,
    targetAt,
    duration,
    remaining: duration,
    showTimerSeconds: Boolean(options.showTimerSeconds),
    runningSince: null,
    lastResetDate: options.type === "routine" ? getTodayKey() : null,
    history: options.type === "routine" ? [] : undefined,
    order: 0,
    createdAt: Date.now()
  };

  if (card.type === "diary") {
    const activeDate = normalizeDateKey(options.activeDate) || getTodayKey();
    card.activeDate = activeDate;
    card.lastDiaryDate = getTodayKey();
    card.diaryEntries = options.diaryEntries && typeof options.diaryEntries === "object" ? options.diaryEntries : {};
    if (!card.diaryEntries[activeDate]) {
      card.diaryEntries[activeDate] = normalizeDiaryEntry({
        feeling: options.feeling || "Calm",
        sentence: options.sentence || "",
        thoughts: options.thoughts || "",
        updatedAt: options.sentence || options.thoughts ? Date.now() : 0
      });
    }
    normalizeDiaryCard(card);
  }

  if (card.type === "planner") {
    const activeDate = normalizeDateKey(options.activePlannerDate || options.plannedDate) || getTodayKey();
    card.plannerGroup = getPlannerGroup(card);
    card.activePlannerDate = activeDate;
    card.plannerEntries = options.plannerEntries && typeof options.plannerEntries === "object" ? options.plannerEntries : {};
    if (!card.plannerEntries[activeDate]) {
      card.plannerEntries[activeDate] = normalizePlannerEntry({
        note: options.note || "",
        updatedAt: options.note ? Date.now() : 0
      });
    }
    normalizePlannerCard(card);
  }

  if (card.type === "planlist") {
    card.plannerGroup = getPlannerGroup(card);
    card.plannerView = normalizePlannerViewMode(options.plannerView);
    card.plannerViewDate = normalizeDateKey(options.plannerViewDate) || getTodayKey();
    card.plannerViewOptions = normalizePlannerViewOptions(options.plannerViewOptions);
    syncPlannerViewCardCopy(card);
  }

  if (card.type === "quote") {
    card.quoteAuthor = normalizeLabel(options.quoteAuthor || "");
  }

  if (card.type === "video") {
    card.videoUrl = normalizeVideoUrl(options.videoUrl || "");
  }

  if (card.type === "fitness") {
    const activeDate = normalizeDateKey(options.activeFitnessDate) || getTodayKey();
    card.activeFitnessDate = activeDate;
    card.fitnessEntries = options.fitnessEntries && typeof options.fitnessEntries === "object" ? options.fitnessEntries : {};
    if (!card.fitnessEntries[activeDate]) {
      card.fitnessEntries[activeDate] = normalizeFitnessEntry(options.fitnessEntry || {});
    }
    normalizeFitnessCard(card);
  }

  if (card.type === "food") {
    const activeDate = normalizeDateKey(options.activeFoodDate) || getTodayKey();
    card.activeFoodDate = activeDate;
    card.activeFoodMealId = options.activeFoodMealId || "";
    card.foodLibrary = normalizeFoodLibrary(options.foodLibrary);
    card.foodTargets = options.foodTargets && typeof options.foodTargets === "object" ? options.foodTargets : {};
    card.foodEntries = options.foodEntries && typeof options.foodEntries === "object" ? options.foodEntries : {};
    if (!card.foodEntries[activeDate]) {
      card.foodEntries[activeDate] = normalizeFoodEntry(options.foodEntry || {});
    }
    normalizeFoodCard(card);
  }

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
  if (!stored) {
    localStateSource = "default";
    return resetBoardViewState(restoreDiaryBackups(ensureCourseBoard(ensureSampleCards(ensureBoards(cloneDefaultState())))));
  }
  try {
    localStateSource = "stored";
    return resetBoardViewState(restoreDiaryBackups(rehydrateState(JSON.parse(stored))));
  } catch {
    localStateSource = "default";
    return resetBoardViewState(restoreDiaryBackups(ensureCourseBoard(ensureSampleCards(ensureBoards(cloneDefaultState())))));
  }
}

function resetBoardViewState(nextState) {
  nextState.activeFilter = "all";
  nextState.activeCategory = "all";
  nextState.activeCategories = [];
  nextState.focusFilter = "all";
  nextState.searchQuery = "";
  nextState.ui = {
    ...defaultState.ui,
    ...(nextState.ui || {}),
    categoriesOpen: false
  };
  return nextState;
}

function getStateForStorage() {
  return resetBoardViewState(JSON.parse(JSON.stringify(state)));
}

function rehydrateState(parsed) {
  const backup = parsed && parsed.state && typeof parsed.state === "object" ? parsed.state : parsed || {};
  const cards = Array.isArray(backup.cards) ? backup.cards.map(normalizeCard) : [];
  const archivedCards = Array.isArray(backup.archivedCards) ? backup.archivedCards.map(normalizeArchivedCard) : [];
  const backupUpdatedAt = getStateUpdatedAt(backup);
  const nextState = ensureCourseBoard(
    ensureSampleCards(
      ensureBoards({
        ...cloneDefaultState(),
        ...backup,
        updatedAt: backupUpdatedAt || Date.now(),
        updatedBy: backup.updatedBy || getClientId(),
        hasUserChanges: typeof backup.hasUserChanges === "boolean" ? backup.hasUserChanges : true,
        sampleVersion: Number(backup.sampleVersion) || 0,
        courseBoardVersion: Number(backup.courseBoardVersion) || 0,
        aiCourseBoardVersion: Number(backup.aiCourseBoardVersion) || 0,
        lifeOsBoardVersion: Number(backup.lifeOsBoardVersion) || 0,
        board: {
          ...defaultState.board,
          ...(backup.board || {})
        },
        ui: {
          ...defaultState.ui,
          ...(backup.ui || {})
        },
        cards,
        archivedCards
      })
    )
  );
  nextState.updatedAt = backupUpdatedAt || nextState.updatedAt || Date.now();
  nextState.updatedBy = nextState.updatedBy || getClientId();
  return nextState;
}

function restoreDiaryBackups(nextState) {
  const backups = Object.values(readDiaryBackups());
  if (!backups.length) return nextState;
  let changed = false;

  const applyBackupToCard = (card, backup, boardId) => {
    const backupBoardId = normalizeLabel(String(backup.boardId || ""));
    const targetBoardId = normalizeLabel(String(boardId || ""));
    if (backupBoardId && targetBoardId && backupBoardId !== targetBoardId) return;
    if (!card || card.type !== "diary" || card.id !== backup.cardId) return;
    normalizeDiaryCard(card);
    const dateKey = normalizeDateKey(backup.dateKey);
    if (!dateKey) return;
    const backupEntry = normalizeDiaryEntry(backup.entry || {});
    const currentEntry = normalizeDiaryEntry(card.diaryEntries[dateKey] || {});
    if (Number(backupEntry.updatedAt || 0) <= Number(currentEntry.updatedAt || 0)) return;
    card.diaryEntries[dateKey] = backupEntry;
    changed = true;
  };

  backups.forEach((backup) => {
    if (!backup || !backup.cardId) return;
    (nextState.cards || []).forEach((card) => applyBackupToCard(card, backup, nextState.activeBoardId));
    (nextState.boards || []).forEach((board) => {
      (board.cards || []).forEach((card) => applyBackupToCard(card, backup, board.id));
    });
  });

  if (changed && Array.isArray(nextState.boards)) {
    const activeBoard = nextState.boards.find((board) => board.id === nextState.activeBoardId);
    if (activeBoard) {
      nextState.cards = activeBoard.cards.map(normalizeCard);
    }
  }
  return nextState;
}

function ensureSampleCards(nextState) {
  if ((Number(nextState.sampleVersion) || 0) >= SAMPLE_VERSION) return nextState;
  nextState.sampleVersion = SAMPLE_VERSION;
  return nextState;
}

function ensureCourseBoard(nextState) {
  if (!Array.isArray(nextState.boards)) return nextState;
  const lifeOsId = "life-work-operating-board";
  const removedActiveBoard = nextState.activeBoardId === "ai-starter-course";
  nextState.boards = nextState.boards.filter((board) => board.id !== "ai-starter-course");
  const hasLifeOs = nextState.boards.some((board) => board.id === lifeOsId);
  const needsLifeOs = (Number(nextState.lifeOsBoardVersion) || 0) < LIFE_OS_BOARD_VERSION;

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
  } else if (needsLifeOs) {
    const lifeOsBoard = nextState.boards.find((board) => board.id === lifeOsId);
    addMissingTemplateCards(lifeOsBoard, "life-os");
  }

  const activeBoardExists = nextState.boards.some((board) => board.id === nextState.activeBoardId);
  if (removedActiveBoard || !activeBoardExists) {
    applyBoardToState(nextState, nextState.boards.some((board) => board.id === lifeOsId) ? lifeOsId : nextState.boards[0]?.id);
    nextState.activeFilter = "all";
    nextState.activeCategory = "all";
    nextState.activeCategories = [];
  } else if (nextState.activeBoardId === lifeOsId && (needsLifeOs || !hasLifeOs)) {
    applyBoardToState(nextState, lifeOsId);
  }

  nextState.courseBoardVersion = COURSE_BOARD_VERSION;
  nextState.aiCourseBoardVersion = AI_COURSE_BOARD_VERSION;
  nextState.lifeOsBoardVersion = LIFE_OS_BOARD_VERSION;
  return nextState;
}

function addMissingTemplateCards(board, templateId) {
  if (!board) return;
  if (!Array.isArray(board.cards)) board.cards = [];
  const existingTitles = new Set((board.cards || []).map((card) => normalizeLabel(card.title || "").toLowerCase()));
  let order = board.cards?.length ? Math.max(...board.cards.map((card) => Number(card.order) || 0)) + 1 : 1;
  buildTemplateCards(templateId).forEach((card) => {
    const key = normalizeLabel(card.title || "").toLowerCase();
    if (!key || existingTitles.has(key)) return;
    board.cards.push(
      normalizeCard({
        ...card,
        order,
        createdAt: Date.now() - order * 1000
      })
    );
    existingTitles.add(key);
    order += 1;
  });
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
  if (isUntimedContentType(next.type)) next.timerMode = "none";
  next.showTimerSeconds = Boolean(next.showTimerSeconds);
  if (next.type === "event" && ["none", "hours", "daily"].includes(next.timerMode)) {
    next.timerMode = "date";
    next.targetAt = next.targetAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    next.duration = Number(next.duration) || 7 * 24 * 60 * 60;
  }
  normalizeTimer(next);
  next.size = "standard";
  if (Number.isFinite(Number(next.layoutColumn))) {
    next.layoutColumn = Math.max(0, Math.round(Number(next.layoutColumn)));
  } else {
    delete next.layoutColumn;
  }
  next.background = BACKGROUNDS[next.background] ? next.background : "clean";
  next.imageUrl = normalizeRemoteAssetUrl(next.imageUrl || "");
  next.imageData = next.imageData || "";
  next.category = normalizeCategory(next.category || "General");
  next.reward = "";
  next.priority = getSelectedPriority(next.priority);
  next.metadata = next.metadata && typeof next.metadata === "object" ? { ...next.metadata } : {};
  next.metadata.category = next.category;
  if (next.type === "planner") {
    normalizePlannerCard(next);
  }
  if (next.type === "planlist") {
    next.plannerGroup = getPlannerGroup(next);
    next.plannerView = normalizePlannerViewMode(next.plannerView);
    next.plannerViewDate = normalizeDateKey(next.plannerViewDate) || getTodayKey();
    next.plannerViewOptions = normalizePlannerViewOptions(next.plannerViewOptions);
    syncPlannerViewCardCopy(next);
  }
  if (next.type === "diary") {
    normalizeDiaryCard(next);
  }
  if (next.type === "quote") {
    next.quoteAuthor = normalizeLabel(next.quoteAuthor || "");
  }
  if (next.type === "video") {
    next.videoUrl = normalizeVideoUrl(next.videoUrl || "");
  }
  if (next.type === "fitness") {
    normalizeFitnessCard(next);
  }
  if (next.type === "food") {
    normalizeFoodCard(next);
  }
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

function getClientId() {
  try {
    const stored = localStorage.getItem(LOCAL_CLIENT_KEY);
    if (stored) return stored;
    const clientId = createId();
    localStorage.setItem(LOCAL_CLIENT_KEY, clientId);
    return clientId;
  } catch {
    return "this-browser";
  }
}

function normalizeTimestamp(value) {
  if (!value) return 0;
  const date = new Date(Number(value) || value);
  const time = date.getTime();
  return Number.isFinite(time) && time > 0 ? time : 0;
}

function getCardUpdatedAt(card) {
  const times = [normalizeTimestamp(card?.updatedAt), normalizeTimestamp(card?.createdAt), normalizeTimestamp(card?.archivedAt)];
  Object.values(card?.diaryEntries || {}).forEach((entry) => {
    times.push(normalizeTimestamp(entry?.updatedAt));
  });
  Object.values(card?.plannerEntries || {}).forEach((entry) => {
    times.push(normalizeTimestamp(entry?.updatedAt));
  });
  return Math.max(0, ...times);
}

function deriveStateUpdatedAt(nextState) {
  const times = [
    normalizeTimestamp(nextState?.updatedAt),
    normalizeTimestamp(nextState?.createdAt),
    normalizeTimestamp(nextState?.savedAt)
  ];
  (nextState?.cards || []).forEach((card) => times.push(getCardUpdatedAt(card)));
  (nextState?.archivedCards || []).forEach((card) => times.push(getCardUpdatedAt(card)));
  (nextState?.boards || []).forEach((board) => {
    times.push(normalizeTimestamp(board?.updatedAt), normalizeTimestamp(board?.createdAt));
    (board?.cards || []).forEach((card) => times.push(getCardUpdatedAt(card)));
    (board?.archivedCards || []).forEach((card) => times.push(getCardUpdatedAt(card)));
  });
  return Math.max(0, ...times);
}

function getStateUpdatedAt(nextState = state) {
  return normalizeTimestamp(nextState?.updatedAt) || deriveStateUpdatedAt(nextState);
}

function getBoardUpdatedAt(board) {
  const times = [normalizeTimestamp(board?.updatedAt), normalizeTimestamp(board?.createdAt)];
  (board?.cards || []).forEach((card) => times.push(getCardUpdatedAt(card)));
  (board?.archivedCards || []).forEach((card) => times.push(getCardUpdatedAt(card)));
  return Math.max(0, ...times);
}

function readStoredStateSnapshot() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? rehydrateState(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function mergeStoredBoardsIntoState() {
  const storedState = readStoredStateSnapshot();
  if (!storedState?.boards?.length) return false;
  if (!Array.isArray(state.boards) || !state.boards.length) return false;

  const storedBoards = new Map(storedState.boards.map((board) => [board.id, board]));
  const mergedBoards = [];
  const seen = new Set();

  state.boards.forEach((localBoard) => {
    const storedBoard = storedBoards.get(localBoard.id);
    const keepLocal = localBoard.id === state.activeBoardId || !storedBoard || getBoardUpdatedAt(localBoard) >= getBoardUpdatedAt(storedBoard);
    mergedBoards.push(createBoardRecord(keepLocal ? localBoard : storedBoard));
    seen.add(localBoard.id);
  });

  storedState.boards.forEach((storedBoard) => {
    if (seen.has(storedBoard.id)) return;
    mergedBoards.push(createBoardRecord(storedBoard));
  });

  state.boards = mergedBoards;
  return true;
}

function isUserEditingCriticalDraft() {
  return Boolean(
    editingCardId ||
      editingPlannerTaskKey ||
      plannerTaskEditDraft ||
      (!elements.cardComposerPanel?.hidden && draftTouched)
  );
}

function applyExternalStorageState(rawValue) {
  if (applyingExternalStorageUpdate || !rawValue || isUserEditingCriticalDraft()) return;
  try {
    applyingExternalStorageUpdate = true;
    const incomingState = rehydrateState(JSON.parse(rawValue));
    const activeBoardId = state.activeBoardId;
    const activeFilter = state.activeFilter || "all";
    const activeCategories = Array.isArray(state.activeCategories) ? [...state.activeCategories] : [];
    const focusFilter = state.focusFilter || "all";
    const searchQuery = state.searchQuery || "";

    if (incomingState.boards?.some((board) => board.id === activeBoardId)) {
      incomingState.activeBoardId = activeBoardId;
      applyBoardToState(incomingState, activeBoardId);
    }

    state = resetBoardViewState(incomingState);
    state.activeFilter = activeFilter;
    state.activeCategories = activeCategories;
    state.focusFilter = focusFilter;
    state.searchQuery = searchQuery;
    resetFormState();
    render();
    localStateSource = "stored";
    if (elements.savedState) {
      elements.savedState.textContent = "Synced here";
      elements.savedState.classList.remove("is-saving");
    }
  } catch {
    // Ignore malformed storage events so another tab cannot break this tab.
  } finally {
    applyingExternalStorageUpdate = false;
  }
}

function isLocalDevPage() {
  return ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
}

function getLocalDevFileUrl(fileName) {
  return new URL(fileName, window.location.href).toString();
}

function hashText(value) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

async function getLocalDevSourceSignature() {
  const signatures = await Promise.all(
    LOCAL_DEV_RELOAD_FILES.map(async (fileName) => {
      const response = await fetch(`${getLocalDevFileUrl(fileName)}?lifeOsDev=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return `${fileName}:missing`;
      const text = await response.text();
      return `${fileName}:${text.length}:${hashText(text)}`;
    })
  );
  return signatures.join("|");
}

function canReloadLocalDevPage() {
  return !isUserEditingCriticalDraft();
}

function markLocalDevReloadPending() {
  localDevReloadPending = true;
  if (elements.savedState) {
    elements.savedState.textContent = "Update ready";
    elements.savedState.classList.remove("is-saving");
  }
}

async function checkLocalDevSourceChanges() {
  if (!isLocalDevPage()) return;
  try {
    const nextSignature = await getLocalDevSourceSignature();
    if (!localDevSourceSignature) {
      localDevSourceSignature = nextSignature;
      return;
    }
    if (nextSignature === localDevSourceSignature) return;
    localDevSourceSignature = nextSignature;
    if (canReloadLocalDevPage()) {
      window.location.reload();
      return;
    }
    markLocalDevReloadPending();
  } catch {
    // Local dev reload is best-effort and should never block the app.
  }
}

function flushPendingLocalDevReload() {
  if (!localDevReloadPending || !canReloadLocalDevPage()) return;
  window.location.reload();
}

function startLocalDevAutoReload() {
  if (!isLocalDevPage()) return;
  checkLocalDevSourceChanges();
  window.setInterval(checkLocalDevSourceChanges, LOCAL_DEV_RELOAD_POLL_MS);
  window.addEventListener("focus", () => {
    flushPendingLocalDevReload();
    checkLocalDevSourceChanges();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      flushPendingLocalDevReload();
      checkLocalDevSourceChanges();
    }
  });
}

function touchState() {
  state.updatedAt = Date.now();
  state.updatedBy = getClientId();
  state.hasUserChanges = true;
}

function exportBoardBackup() {
  syncActiveBoard();
  const backup = {
    app: "Life OS",
    exportedAt: new Date().toISOString(),
    state: getStateForStorage()
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `life-os-backup-${getTodayKey()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  elements.savedState.textContent = "Backup ready";
}

function loadCloudSession() {
  try {
    const stored = localStorage.getItem(CLOUD_SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveCloudSession(session) {
  const previousCloudStamp =
    cloudSession?.user?.id && session?.user?.id && cloudSession.user.id === session.user.id
      ? cloudSession.cloud_updated_at
      : "";
  cloudSession = session;
  if (session) {
    if (previousCloudStamp && !session.cloud_updated_at) {
      cloudSession.cloud_updated_at = previousCloudStamp;
    }
    writeLocalJson(CLOUD_SESSION_KEY, session, { silent: true });
    if (elements.cloudPassword) elements.cloudPassword.value = "";
  } else {
    localStorage.removeItem(CLOUD_SESSION_KEY);
  }
  cloudSaveEnabled = Boolean(session?.access_token);
  renderCloudStatus();
}

function persistCloudSession() {
  if (!cloudSession) return;
  localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(cloudSession));
}

function setKnownCloudUpdatedAt(updatedAt) {
  if (!cloudSession || !updatedAt) return;
  cloudSession.cloud_updated_at = updatedAt;
  persistCloudSession();
}

function getKnownCloudUpdatedAt() {
  return cloudSession?.cloud_updated_at || "";
}

function saveCloudRecoveryPoint(reason) {
  try {
    const existing = JSON.parse(localStorage.getItem(CLOUD_RECOVERY_KEY) || "[]");
    const recovery = {
      reason,
      savedAt: new Date().toISOString(),
      state: JSON.parse(JSON.stringify(state))
    };
    writeLocalJson(CLOUD_RECOVERY_KEY, [recovery, ...existing].slice(0, 5), { silent: true });
  } catch {
    // Recovery is best effort only. The main save flow should continue.
  }
}

function writeLocalJson(key, value, options = {}) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    if (!options.silent && elements.savedState) {
      elements.savedState.textContent = options.message || "Save failed locally";
      elements.savedState.classList.remove("is-saving");
    }
    return false;
  }
}

function renderCloudStatus(message) {
  if (!elements.cloudStatus) return;
  if (message) cloudStatusMessage = message;
  const isSignedIn = Boolean(cloudSession?.access_token);
  elements.cloudStatus.textContent = isSignedIn ? "Cloud" : "Local";
  elements.cloudEmail.value = cloudSession?.user?.email || elements.cloudEmail.value || "";
  elements.cloudPullButton.disabled = !isSignedIn;
  elements.cloudPushButton.disabled = !isSignedIn;
  elements.cloudSignOutButton.hidden = !isSignedIn;
  elements.cloudPassword.closest(".field").hidden = isSignedIn;
  elements.cloudSignInButton.disabled = isSignedIn;
  elements.cloudSignUpButton.disabled = isSignedIn;
  elements.cloudResendButton.hidden = isSignedIn;
  elements.cloudResendButton.disabled = isSignedIn;
  const localSavedAt = getStateUpdatedAt(state);
  const cloudSavedAt = getKnownCloudUpdatedAt();
  const savedDetail = cloudSavedAt
    ? `Last local edit: ${formatRecordDateTime(localSavedAt)}. Supabase copy: ${formatRecordDateTime(cloudSavedAt)}.`
    : `Last local edit: ${formatRecordDateTime(localSavedAt)}.`;
  elements.cloudNote.textContent =
    cloudStatusMessage ||
    (isSignedIn
      ? `Signed in as ${cloudSession.user?.email || "your account"}. Auto-save checks timestamps before replacing cloud data. ${savedDetail}`
      : "Local browser storage is active.");
}

function getCloudCredentials() {
  const email = elements.cloudEmail.value.trim();
  const password = elements.cloudPassword.value;
  if (!email || !password) {
    throw new Error("Enter email and password first.");
  }
  return { email, password };
}

function getCloudEmail() {
  const email = elements.cloudEmail.value.trim();
  if (!email) throw new Error("Enter email first.");
  return email;
}

function getCloudRedirectUrl() {
  if (SUPABASE_CONFIG.redirectUrl) return SUPABASE_CONFIG.redirectUrl;
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    const path = window.location.pathname.replace(/index\.html$/i, "");
    return `${window.location.origin}${path || "/"}`;
  }
  return "https://austinwong94.github.io/life-os/";
}

function withCloudRedirect(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}redirect_to=${encodeURIComponent(getCloudRedirectUrl())}`;
}

function getCloudHeaders(session) {
  return {
    apikey: SUPABASE_CONFIG.anonKey,
    Authorization: `Bearer ${session?.access_token || SUPABASE_CONFIG.anonKey}`,
    Accept: "application/json"
  };
}

async function handleCloudAuthRedirect() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const error = hash.get("error_description") || query.get("error_description");
  if (error) {
    renderCloudStatus(normalizeCloudError(error));
    clearCloudAuthUrl();
    openSettingsModal();
    return;
  }

  const accessToken = hash.get("access_token");
  if (!accessToken) return;

  try {
    renderCloudStatus("Confirming cloud login...");
    const user = await fetchCloudUser(accessToken);
    const expiresIn = Number(hash.get("expires_in") || 3600);
    saveCloudSession({
      access_token: accessToken,
      refresh_token: hash.get("refresh_token") || "",
      expires_at: Date.now() + Math.max(60, expiresIn - 30) * 1000,
      user
    });
    clearCloudAuthUrl();
    openSettingsModal();
    await syncCloudAfterSignIn();
  } catch (error) {
    renderCloudStatus(normalizeCloudError(error.message || "Email confirmed, but cloud sign-in could not finish."));
    openSettingsModal();
  }
}

function clearCloudAuthUrl() {
  if (!window.history?.replaceState) return;
  const cleanUrl = window.location.href.split("#")[0].split("?")[0];
  window.history.replaceState({}, document.title, cleanUrl);
}

async function fetchCloudUser(accessToken) {
  const response = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/user`, {
    headers: getCloudHeaders({ access_token: accessToken })
  });
  if (!response.ok) {
    throw new Error(await getCloudResponseError(response, "Cloud user check failed."));
  }
  const user = await response.json();
  if (!user?.id) throw new Error("Cloud user check failed.");
  return user;
}

function normalizeCloudError(message) {
  if (/invalid login credentials/i.test(message)) {
    return "Invalid login. Use Create login first, or confirm this email in Supabase Auth.";
  }
  if (/PGRST205|Could not find the table/i.test(message)) {
    return CLOUD_TABLE_MISSING_MESSAGE;
  }
  if (/42501|permission denied/i.test(message)) {
    return "Supabase table exists. Create or sign in to your Life OS login, then save cloud.";
  }
  if (/JWT|token|expired/i.test(message)) {
    return "Cloud session expired. Sign out, sign in again, then save cloud.";
  }
  return message;
}

async function getCloudResponseError(response, fallback) {
  const result = await response.json().catch(() => ({}));
  const message = result.error_description || result.msg || result.message || result.hint || fallback;
  return normalizeCloudError(`${result.code ? `${result.code}: ` : ""}${message}`);
}

async function checkCloudSetup() {
  try {
    renderCloudStatus("Checking Supabase setup...");
    const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/user_states?select=owner_id&limit=1`, {
      headers: getCloudHeaders()
    });
    if (!response.ok) {
      const message = await getCloudResponseError(response, "Supabase setup check failed.");
      if (/table exists|permission denied/i.test(message)) {
        renderCloudStatus("Supabase table exists. Create or sign in to your Life OS login, then save cloud.");
        return;
      }
      throw new Error(message);
    }
    renderCloudStatus("Supabase setup is reachable. Sign in, then save cloud.");
  } catch (error) {
    renderCloudStatus(normalizeCloudError(error.message || "Supabase setup check failed."));
  }
}

async function signUpForCloud() {
  try {
    const { email, password } = getCloudCredentials();
    renderCloudStatus("Creating cloud login...");
    const result = await cloudAuthRequest(withCloudRedirect("/auth/v1/signup"), {
      email,
      password
    });
    const session = normalizeCloudSession(result);
    if (session) {
      saveCloudSession(session);
      await pushCloudState({ manual: true });
      return;
    }
    renderCloudStatus("Check your email to confirm the login, then sign in here.");
  } catch (error) {
    renderCloudStatus(normalizeCloudError(error.message || "Cloud login could not be created."));
  }
}

async function resendCloudConfirmation() {
  try {
    const email = getCloudEmail();
    renderCloudStatus("Resending confirmation email...");
    await cloudAuthRequest(withCloudRedirect("/auth/v1/resend"), {
      type: "signup",
      email,
      options: {
        email_redirect_to: getCloudRedirectUrl()
      }
    });
    renderCloudStatus("Confirmation email resent. Check inbox and spam, then sign in here.");
  } catch (error) {
    renderCloudStatus(normalizeCloudError(error.message || "Could not resend confirmation email."));
  }
}

async function signInToCloud() {
  try {
    const { email, password } = getCloudCredentials();
    renderCloudStatus("Signing in...");
    const result = await cloudAuthRequest("/auth/v1/token?grant_type=password", {
      email,
      password
    });
    const session = normalizeCloudSession(result);
    if (!session) throw new Error("Sign in failed.");
    saveCloudSession(session);
    await syncCloudAfterSignIn();
  } catch (error) {
    renderCloudStatus(normalizeCloudError(error.message || "Could not sign in."));
  }
}

async function syncCloudAfterSignIn() {
  const session = await ensureCloudSession();
  syncActiveBoard();
  const cloudRow = await fetchCloudStateRow(session);
  if (!cloudRow) {
    renderCloudStatus("No Supabase copy yet. Saving this browser to cloud...");
    await pushCloudState({ manual: true, replaceCloud: true });
    return;
  }
  if (!state.hasUserChanges || localStateSource === "default") {
    await pullCloudState({ confirmReplace: false });
    return;
  }
  if (doesCloudStateMatchLocal(cloudRow.state)) {
    setKnownCloudUpdatedAt(cloudRow.updated_at);
    renderCloudStatus(`Cloud is current. Supabase copy: ${formatRecordDateTime(cloudRow.updated_at)}.`);
    return;
  }
  if (isRemoteNewerThanKnown(cloudRow.updated_at)) {
    renderCloudStatus("This browser and Supabase both have saved data. Use Load cloud to use Supabase here, or Save cloud if this browser is the copy to keep.");
    return;
  }
  if (isLocalNewerThanCloud(cloudRow)) {
    renderCloudStatus("This browser has newer changes. Saving this browser to Supabase...");
    await pushCloudState({ manual: true, replaceCloud: true });
    return;
  }
  if (isCloudNewerThanLocal(cloudRow)) {
    await pullCloudState({ confirmReplace: false });
    return;
  }
  renderCloudStatus("Cloud and this browser both have changes. Use Load cloud to review Supabase, or Save cloud to keep this browser.");
}

function signOutCloud() {
  saveCloudSession(null);
  renderCloudStatus("Signed out. Local browser storage is active.");
}

async function cloudAuthRequest(path, body) {
  const response = await fetch(`${SUPABASE_CONFIG.url}${path}`, {
    method: "POST",
    headers: {
      ...getCloudHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await getCloudResponseError(response, "Supabase auth failed."));
  }
  return response.json().catch(() => ({}));
}

function normalizeCloudSession(result) {
  const accessToken = result.access_token || result.session?.access_token;
  const refreshToken = result.refresh_token || result.session?.refresh_token;
  const user = result.user || result.session?.user;
  if (!accessToken || !user?.id) return null;
  const expiresIn = Number(result.expires_in || result.session?.expires_in || 3600);
  return {
    access_token: accessToken,
    refresh_token: refreshToken || "",
    expires_at: Date.now() + Math.max(60, expiresIn - 30) * 1000,
    user
  };
}

async function ensureCloudSession() {
  if (!cloudSession?.access_token) throw new Error("Sign in to cloud sync first.");
  if (!cloudSession.refresh_token || Date.now() < Number(cloudSession.expires_at || 0)) {
    return cloudSession;
  }
  const result = await cloudAuthRequest("/auth/v1/token?grant_type=refresh_token", {
    refresh_token: cloudSession.refresh_token
  });
  const session = normalizeCloudSession(result);
  if (!session) throw new Error("Cloud session expired. Sign in again.");
  saveCloudSession(session);
  return session;
}

async function fetchCloudStateRow(session) {
  const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/user_states?owner_id=eq.${session.user.id}&select=state,updated_at&limit=1`, {
    headers: getCloudHeaders(session)
  });
  if (!response.ok) {
    throw new Error(await getCloudResponseError(response, "Cloud check failed."));
  }
  const rows = await response.json();
  return rows[0] || null;
}

function getCloudRowStateUpdatedAt(cloudRow) {
  const payloadUpdatedAt = normalizeTimestamp(cloudRow?.state?.updatedAt);
  if (payloadUpdatedAt) return payloadUpdatedAt;
  return Math.max(getStateUpdatedAt(cloudRow?.state || {}), normalizeTimestamp(cloudRow?.updated_at));
}

function isCloudNewerThanLocal(cloudRow) {
  return getCloudRowStateUpdatedAt(cloudRow) - getStateUpdatedAt(state) > CLOUD_CONFLICT_TOLERANCE_MS;
}

function isLocalNewerThanCloud(cloudRow) {
  return getStateUpdatedAt(state) - getCloudRowStateUpdatedAt(cloudRow) > CLOUD_CONFLICT_TOLERANCE_MS;
}

function isRemoteNewerThanKnown(remoteUpdatedAt) {
  const knownUpdatedAt = getKnownCloudUpdatedAt();
  if (!remoteUpdatedAt) return false;
  if (!knownUpdatedAt) return true;
  const remoteTime = new Date(remoteUpdatedAt).getTime();
  const knownTime = new Date(knownUpdatedAt).getTime();
  if (!Number.isFinite(remoteTime) || !Number.isFinite(knownTime)) return true;
  return remoteTime - knownTime > CLOUD_CONFLICT_TOLERANCE_MS;
}

function doesCloudStateMatchLocal(cloudState) {
  try {
    return JSON.stringify(resetBoardViewState(JSON.parse(JSON.stringify(cloudState)))) === JSON.stringify(getStateForStorage());
  } catch {
    return false;
  }
}

async function getCloudSavePlan(session, options = {}) {
  const cloudRow = await fetchCloudStateRow(session);
  if (!cloudRow) {
    return { allowed: true, expectedUpdatedAt: "" };
  }
  if (doesCloudStateMatchLocal(cloudRow.state)) {
    setKnownCloudUpdatedAt(cloudRow.updated_at);
    return { allowed: true, noop: true, expectedUpdatedAt: cloudRow.updated_at };
  }
  const cloudChangedAfterThisBrowserLoaded = isRemoteNewerThanKnown(cloudRow.updated_at);
  if (cloudChangedAfterThisBrowserLoaded && !options.replaceCloud) {
    const message = `Cloud has newer changes from another browser (${formatRecordDate(cloudRow.updated_at)}). Load cloud first, or press Save cloud again and confirm replace.`;
    if (!options.manual) {
      renderCloudStatus(message);
      return { allowed: false, conflict: true };
    }
    const confirmed = window.confirm("Cloud has newer changes from another browser. Save this browser anyway and replace the cloud copy?");
    if (!confirmed) {
      renderCloudStatus("Cloud save cancelled. Load cloud to review the newer copy first.");
      return { allowed: false, conflict: true };
    }
    saveCloudRecoveryPoint("before-cloud-overwrite");
    return { allowed: true, expectedUpdatedAt: "", force: true };
  }
  if (options.replaceCloud || isLocalNewerThanCloud(cloudRow)) {
    if (options.replaceCloud) saveCloudRecoveryPoint("before-cloud-overwrite");
    return { allowed: true, expectedUpdatedAt: cloudRow.updated_at };
  }
  if (!isCloudNewerThanLocal(cloudRow)) {
    return { allowed: true, expectedUpdatedAt: cloudRow.updated_at };
  }
  const message = `Cloud has newer changes from another browser (${formatRecordDate(cloudRow.updated_at)}). Load cloud first, or press Save cloud again and confirm replace.`;
  if (!options.manual) {
    renderCloudStatus(message);
    return { allowed: false, conflict: true };
  }
  const confirmed = window.confirm("Cloud has newer changes from another browser. Save this browser anyway and replace the cloud copy?");
  if (!confirmed) {
    renderCloudStatus("Cloud save cancelled. Load cloud to review the newer copy first.");
    return { allowed: false, conflict: true };
  }
  saveCloudRecoveryPoint("before-cloud-overwrite");
  return { allowed: true, expectedUpdatedAt: "", force: true };
}

async function writeCloudState(session, payload, savePlan) {
  const expectedUpdatedAt = savePlan.expectedUpdatedAt;
  const isConditionalUpdate = expectedUpdatedAt && !savePlan.force;
  const url = isConditionalUpdate
    ? `${SUPABASE_CONFIG.url}/rest/v1/user_states?owner_id=eq.${session.user.id}&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}&select=updated_at`
    : `${SUPABASE_CONFIG.url}/rest/v1/user_states?on_conflict=owner_id&select=updated_at`;
  const response = await fetch(url, {
    method: isConditionalUpdate ? "PATCH" : "POST",
    headers: {
      ...getCloudHeaders(session),
      "Content-Type": "application/json",
      Prefer: isConditionalUpdate ? "return=representation" : "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(isConditionalUpdate ? { state: payload.state } : payload)
  });
  if (!response.ok) {
    throw new Error(await getCloudResponseError(response, "Cloud save failed."));
  }
  const savedRows = await response.json().catch(() => []);
  if (isConditionalUpdate && !savedRows.length) {
    throw new Error("Cloud has newer changes from another browser. Load cloud before saving again.");
  }
  return savedRows[0]?.updated_at || new Date().toISOString();
}

async function pushCloudState(options = {}) {
  if (!cloudSaveEnabled && !options.manual) return;
  try {
    const session = await ensureCloudSession();
    syncActiveBoard();
    const savePlan = await getCloudSavePlan(session, options);
    if (!savePlan.allowed) return;
    if (savePlan.noop) {
      if (elements.savedState) {
        elements.savedState.textContent = "Saved here + cloud";
        elements.savedState.classList.remove("is-saving");
      }
      if (!options.silent) {
        renderCloudStatus(`Supabase is already current ${formatRecordDateTime(savePlan.expectedUpdatedAt)}.`);
      }
      return;
    }
    const payload = {
      owner_id: session.user.id,
      state: getStateForStorage()
    };
    const cloudUpdatedAt = await writeCloudState(session, payload, savePlan);
    setKnownCloudUpdatedAt(cloudUpdatedAt);
    if (elements.savedState) {
      elements.savedState.textContent = "Saved here + cloud";
      elements.savedState.classList.remove("is-saving");
    }
    const savedMessage = `Saved to Supabase ${formatRecordDateTime(cloudUpdatedAt)}.`;
    if (!options.silent) {
      renderCloudStatus(savedMessage);
    } else {
      cloudStatusMessage = savedMessage;
      renderCloudStatus();
    }
  } catch (error) {
    renderCloudStatus(normalizeCloudError(error.message || "Cloud save failed."));
  }
}

async function pullCloudState(options = {}) {
  try {
    const session = await ensureCloudSession();
    const cloudRow = await fetchCloudStateRow(session);
    if (!cloudRow) {
      if (options.silentIfEmpty) {
        await pushCloudState({ manual: true });
      } else {
        renderCloudStatus("No cloud board yet. Use Save cloud first.");
      }
      return;
    }
    if (options.confirmReplace) {
      const loadMessage = isLocalNewerThanCloud(cloudRow)
        ? "Supabase looks older than this browser. Load it and replace the newer local board view?"
        : "Load Supabase data into this browser? This replaces the local board view.";
      const confirmed = window.confirm(loadMessage);
      if (!confirmed) return;
    }
    saveCloudRecoveryPoint("before-cloud-load");
    state = rehydrateState(cloudRow.state);
    setKnownCloudUpdatedAt(cloudRow.updated_at);
    resetFormState();
    render();
    saveState({ skipCloud: true, touch: false });
    localStateSource = "stored";
    renderCloudStatus(`Loaded from Supabase ${formatRecordDate(cloudRow.updated_at)}.`);
  } catch (error) {
    renderCloudStatus(normalizeCloudError(error.message || "Cloud load failed."));
  }
}

function queueCloudSave(options = {}) {
  if (!cloudSaveEnabled || !cloudSession?.access_token) return;
  window.clearTimeout(cloudSaveTimer);
  if (elements.savedState && !elements.savedState.textContent.startsWith("Diary saved")) {
    elements.savedState.textContent = "Saved here, syncing";
  }
  if (options.immediate) {
    pushCloudState({ silent: options.silent });
    return;
  }
  cloudSaveTimer = window.setTimeout(() => {
    pushCloudState({ silent: options.silent });
  }, CLOUD_SAVE_DEBOUNCE_MS);
}

async function importBoardBackup(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    state = rehydrateState(parsed);
    resetFormState();
    render();
    saveState();
    window.alert("Backup imported into this browser.");
  } catch {
    window.alert("This backup file could not be imported.");
  } finally {
    elements.importDataFile.value = "";
  }
}

function saveState(options = {}) {
  if (applyingExternalStorageUpdate) return;
  const touched = options.touch !== false;
  if (touched) {
    touchState();
  }
  syncActiveBoard();
  mergeStoredBoardsIntoState();
  const localSaved = writeLocalJson(STORAGE_KEY, getStateForStorage(), {
    silent: options.quiet,
    message: "Local save failed. Remove large images or export a backup."
  });
  if (localSaved) localStateSource = "stored";
  if (!options.quiet) {
    elements.savedState.textContent = localSaved
      ? cloudSaveEnabled
        ? "Saved here, syncing"
        : "Saved here"
      : "Local save failed";
    elements.savedState.classList.remove("is-saving");
  }
  if (!options.skipCloud && touched) {
    queueCloudSave({ silent: options.quiet });
  }
}

function persistLocalDraftState() {
  try {
    if (applyingExternalStorageUpdate) return;
    syncActiveBoard();
    mergeStoredBoardsIntoState();
    if (writeLocalJson(STORAGE_KEY, getStateForStorage(), { silent: true })) {
      localStateSource = "stored";
    }
  } catch {
    // Draft persistence is best-effort so typing never gets interrupted by storage errors.
  }
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
