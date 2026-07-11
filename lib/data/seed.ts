/**
 * Realistic, typed seed data. `createSeed()` anchors all test windows to the
 * moment the store first initialises, so the demo always has one active-now,
 * one active-future, and several closed tests regardless of when it is run.
 *
 * TODO(backend): this entire module is replaced by Supabase tables + RLS.
 */
import type {
  Announcement,
  Answer,
  ClassItem,
  Cohort,
  Note,
  NoteAssignment,
  Question,
  QuestionBankItem,
  Rubric,
  Student,
  SubjectItem,
  Submission,
  Test,
} from "@/types";
import { autoGradeMcq } from "@/lib/grading";

export interface Database {
  cohorts: Cohort[];
  students: Student[];
  tests: Test[];
  submissions: Submission[];
  announcements: Announcement[];
  bank: QuestionBankItem[];
  classes: ClassItem[];
  subjects: SubjectItem[];
  notes: Note[];
  noteAssignments: NoteAssignment[];
  rubrics: Rubric[];
  /** Demo-only. Real admin auth is Supabase Auth; the live store omits this. */
  adminPassword?: string;
}

const MIN = 60_000;
const HR = 3_600_000;
const DAY = 86_400_000;

/** A tiny inline "scanned answer" placeholder for photo submissions. */
const PHOTO_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='220'><rect width='320' height='220' fill='#fcfaf4'/><rect x='8' y='8' width='304' height='204' fill='none' stroke='#ded7c7'/><text x='20' y='48' font-family='monospace' font-size='15' fill='#57534a'>x = (-b ± √(b²-4ac)) / 2a</text><text x='20' y='80' font-family='monospace' font-size='15' fill='#57534a'>= (-5 ± √(25-24)) / 2</text><text x='20' y='112' font-family='monospace' font-size='15' fill='#57534a'>= (-5 ± 1) / 2</text><text x='20' y='144' font-family='monospace' font-size='15' fill='#57534a'>x = -2  or  x = -3</text></svg>`,
  );

/** Stable pseudo-random in [0,100) from a string — keeps seed deterministic. */
function hash100(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100;
}

let counter = 0;
const id = (p: string) => `${p}_${(counter++).toString(36)}`;

function mcq(
  prompt: string,
  topic: string,
  marks: number,
  options: string[],
  correctIndex: number,
  order: number,
): Question {
  return { id: id("q"), type: "mcq", prompt, topic, marks, options, correctIndex, order };
}
function textQ(prompt: string, topic: string, marks: number, order: number, maxLength = 600): Question {
  return { id: id("q"), type: "text", prompt, topic, marks, maxLength, showCounter: true, order };
}
function photoQ(prompt: string, topic: string, marks: number, order: number): Question {
  return { id: id("q"), type: "photo", prompt, topic, marks, order };
}

export function createSeed(now: number = Date.now()): Database {
  counter = 0;
  const iso = (offset: number) => new Date(now + offset).toISOString();

  // ---- Cohorts -----------------------------------------------------------
  const cohorts: Cohort[] = [
    { id: "co_autumn", name: "Autumn 2026", color: 1, classIds: [], subjectIds: [], createdAt: iso(-90 * DAY) },
    { id: "co_spring", name: "Spring 2026", color: 2, classIds: [], subjectIds: [], createdAt: iso(-60 * DAY) },
    { id: "co_evening", name: "Evening Track", color: 3, classIds: [], subjectIds: [], createdAt: iso(-45 * DAY) },
    { id: "co_found", name: "Foundation", color: 4, classIds: [], subjectIds: [], createdAt: iso(-30 * DAY) },
  ];

  // ---- Students ----------------------------------------------------------
  const students: Student[] = [
    { id: "st_amelia", username: "amelia", email: "amelia@meridian.edu", cohortId: "co_autumn", classIds: [], subjectIds: [], tempPassword: "study123", createdAt: iso(-80 * DAY) },
    { id: "st_noah", username: "noah", cohortId: "co_autumn", classIds: [], subjectIds: [], tempPassword: "noah2026", createdAt: iso(-80 * DAY) },
    { id: "st_priya", username: "priya", email: "priya@meridian.edu", cohortId: "co_autumn", classIds: [], subjectIds: [], tempPassword: "priya2026", createdAt: iso(-79 * DAY) },
    { id: "st_liam", username: "liam", cohortId: "co_autumn", classIds: [], subjectIds: [], tempPassword: "liam2026", createdAt: iso(-78 * DAY) },
    { id: "st_sara", username: "sara", cohortId: "co_autumn", classIds: [], subjectIds: [], tempPassword: "sara2026", createdAt: iso(-77 * DAY) },
    { id: "st_omar", username: "omar", email: "omar@meridian.edu", cohortId: "co_spring", classIds: [], subjectIds: [], tempPassword: "omar2026", createdAt: iso(-55 * DAY) },
    { id: "st_mei", username: "mei", cohortId: "co_spring", classIds: [], subjectIds: [], tempPassword: "mei2026", createdAt: iso(-54 * DAY) },
    { id: "st_hugo", username: "hugo", cohortId: "co_evening", classIds: [], subjectIds: [], tempPassword: "hugo2026", createdAt: iso(-40 * DAY) },
    { id: "st_zoe", username: "zoe", cohortId: "co_found", classIds: [], subjectIds: [], tempPassword: "zoe2026", createdAt: iso(-25 * DAY) },
  ];

  // ---- Tests -------------------------------------------------------------
  const tests: Test[] = [
    {
      id: "te_numbertheory",
      title: "Number Theory Basics",
      subject: "Mathematics",
      durationMinutes: 30,
      cohortId: "co_autumn",
      classId: null,
      subjectId: null,
      opensAt: iso(-14 * DAY),
      closesAt: iso(-13 * DAY),
      testCode: "MTH-NT01",
      status: "closed",
      createdAt: iso(-20 * DAY),
      questions: [
        mcq("Which of these is a prime number?", "Number Theory", 2, ["21", "27", "29", "33"], 2, 0),
        mcq("The greatest common divisor of 12 and 18 is:", "Number Theory", 2, ["2", "3", "6", "9"], 2, 1),
        mcq("How many factors does 16 have?", "Number Theory", 2, ["3", "4", "5", "6"], 2, 2),
        mcq("Which number is divisible by both 3 and 4?", "Number Theory", 2, ["18", "20", "24", "28"], 2, 3),
        mcq("The lowest common multiple of 4 and 6 is:", "Number Theory", 2, ["10", "12", "18", "24"], 1, 4),
      ],
    },
    {
      id: "te_grammar",
      title: "Grammar Foundations",
      subject: "English",
      durationMinutes: 25,
      cohortId: "co_autumn",
      classId: null,
      subjectId: null,
      opensAt: iso(-10 * DAY),
      closesAt: iso(-9 * DAY),
      testCode: "ENG-GR01",
      status: "closed",
      createdAt: iso(-16 * DAY),
      questions: [
        mcq("Choose the correct sentence:", "Grammar", 2, ["She don't like tea.", "She doesn't likes tea.", "She doesn't like tea.", "She not like tea."], 2, 0),
        mcq("Identify the adverb: 'He ran quickly to school.'", "Grammar", 2, ["ran", "quickly", "school", "He"], 1, 1),
        mcq("Which word is a synonym of 'rapid'?", "Vocabulary", 2, ["slow", "swift", "heavy", "calm"], 1, 2),
        mcq("Pick the correctly punctuated clause:", "Grammar", 2, ["Its raining outside.", "It's raining outside.", "Its' raining outside.", "Its raining, outside"], 1, 3),
      ],
    },
    {
      id: "te_cells",
      title: "Cell Biology Quiz",
      subject: "Biology",
      durationMinutes: 35,
      cohortId: "co_autumn",
      classId: null,
      subjectId: null,
      opensAt: iso(-7 * DAY),
      closesAt: iso(-6 * DAY),
      testCode: "BIO-CL01",
      status: "closed",
      createdAt: iso(-12 * DAY),
      questions: [
        mcq("Which organelle is the 'powerhouse' of the cell?", "Cells", 2, ["Nucleus", "Mitochondrion", "Ribosome", "Golgi body"], 1, 0),
        mcq("Plant cells contain which structure that animal cells lack?", "Cells", 2, ["Cell membrane", "Cytoplasm", "Cell wall", "Nucleus"], 2, 1),
        mcq("DNA is primarily stored in the:", "Genetics", 2, ["Vacuole", "Nucleus", "Lysosome", "Membrane"], 1, 2),
        textQ("Explain, in 2–3 sentences, the role of the cell membrane in homeostasis.", "Cells", 6, 3),
        mcq("Which process do mitochondria carry out?", "Cells", 2, ["Photosynthesis", "Respiration", "Transpiration", "Digestion"], 1, 4),
      ],
    },
    {
      id: "te_forces",
      title: "Forces & Motion",
      subject: "Physics",
      durationMinutes: 40,
      cohortId: "co_autumn",
      classId: null,
      subjectId: null,
      opensAt: iso(-4 * DAY),
      closesAt: iso(-3 * DAY),
      testCode: "PHY-FM01",
      status: "closed",
      createdAt: iso(-9 * DAY),
      questions: [
        mcq("The SI unit of force is the:", "Forces", 2, ["Joule", "Watt", "Newton", "Pascal"], 2, 0),
        mcq("Acceleration is the rate of change of:", "Motion", 2, ["distance", "velocity", "mass", "energy"], 1, 1),
        photoQ("Solve: a 2 kg block accelerates at 3 m/s². Show your working for the net force and photograph it.", "Forces", 6, 2),
        textQ("State Newton's third law in your own words and give one everyday example.", "Forces", 6, 3),
        mcq("Which quantity is a vector?", "Motion", 2, ["Speed", "Distance", "Velocity", "Time"], 2, 4),
      ],
    },
    {
      id: "te_algebra",
      title: "Algebra Foundations",
      subject: "Mathematics",
      durationMinutes: 45,
      cohortId: "co_autumn",
      classId: null,
      subjectId: null,
      opensAt: iso(-30 * MIN),
      closesAt: iso(3 * HR),
      testCode: "MTH-AL02",
      status: "active",
      createdAt: iso(-3 * DAY),
      questions: [
        mcq("Solve for x: 2x + 7 = 19", "Algebra", 3, ["x = 5", "x = 6", "x = 7", "x = 8"], 1, 0),
        mcq("Expand: (x + 3)(x − 2)", "Algebra", 3, ["x² + x − 6", "x² − x − 6", "x² + 5x − 6", "x² − 6"], 0, 1),
        mcq("Which is the gradient of y = 4x − 1?", "Graphs", 3, ["−1", "1", "4", "0"], 2, 2),
        textQ("Factorise x² − 9 and explain which identity you used.", "Algebra", 5, 3),
        photoQ("Solve the simultaneous equations x + y = 10, x − y = 4. Photograph your full working.", "Algebra", 6, 4),
      ],
    },
    {
      id: "te_calculus",
      title: "Calculus Mid-Unit",
      subject: "Mathematics",
      durationMinutes: 50,
      cohortId: "co_autumn",
      classId: null,
      subjectId: null,
      opensAt: iso(2 * DAY),
      closesAt: iso(2 * DAY + 4 * HR),
      testCode: "MTH-CA03",
      status: "active",
      createdAt: iso(-1 * DAY),
      questions: [
        mcq("The derivative of x³ is:", "Differentiation", 3, ["3x²", "x²", "3x", "2x³"], 0, 0),
        mcq("∫ 2x dx equals:", "Integration", 3, ["x² + C", "2x² + C", "x + C", "2 + C"], 0, 1),
        textQ("Differentiate y = 5x² − 3x + 2 and state dy/dx.", "Differentiation", 5, 2),
      ],
    },
    {
      id: "te_labsafety",
      title: "Lab Safety Essentials",
      subject: "Science",
      durationMinutes: 20,
      cohortId: null, // open to all
      classId: null,
      subjectId: null,
      opensAt: iso(-20 * MIN),
      closesAt: iso(6 * HR),
      testCode: "SCI-LS01",
      status: "active",
      createdAt: iso(-2 * DAY),
      questions: [
        mcq("What should you always wear when handling acids?", "Safety", 2, ["Gloves only", "Goggles only", "Goggles and gloves", "Nothing special"], 2, 0),
        mcq("If a chemical spills on your skin you should first:", "Safety", 2, ["Wipe with paper", "Rinse with water", "Ignore it", "Apply more chemical"], 1, 1),
        mcq("The correct fire response in a lab starts with:", "Safety", 2, ["Run", "Raise the alarm", "Hide", "Open windows"], 1, 2),
      ],
    },
    {
      id: "te_algorithms",
      title: "Intro to Algorithms",
      subject: "Computer Science",
      durationMinutes: 40,
      cohortId: "co_spring",
      classId: null,
      subjectId: null,
      opensAt: iso(5 * DAY),
      closesAt: iso(6 * DAY),
      testCode: "CS-ALG1",
      status: "draft",
      createdAt: iso(-1 * DAY),
      questions: [
        mcq("Big-O of binary search on a sorted array is:", "Complexity", 3, ["O(n)", "O(log n)", "O(n²)", "O(1)"], 1, 0),
      ],
    },
  ];

  // ---- Submissions (generated for closed tests) --------------------------
  const closedWithGrades: Record<string, { released: boolean }> = {
    te_numbertheory: { released: true },
    te_grammar: { released: true },
    te_cells: { released: true },
    te_forces: { released: false }, // left for the admin to grade/release
  };

  const testById = new Map(tests.map((t) => [t.id, t]));
  const submissions: Submission[] = [];

  // amelia gets a controlled set so Results + Progress look intentional.
  const ameliaTargets: Record<string, number> = {
    te_numbertheory: 82,
    te_grammar: 74,
    te_cells: 68,
    te_forces: 88,
  };

  function buildAnswers(test: Test, studentId: string, targetPct: number, fullyGraded: boolean): Answer[] {
    return test.questions.map((q) => {
      const seed = hash100(studentId + q.id);
      if (q.type === "mcq") {
        const correct = seed < targetPct;
        const selectedIndex = correct ? q.correctIndex : (q.correctIndex + 1 + (seed % 3)) % 4;
        return { questionId: q.id, type: "mcq", selectedIndex, marksAwarded: correct ? q.marks : 0 };
      }
      if (q.type === "text") {
        const base: Answer = {
          questionId: q.id,
          type: "text",
          text:
            "The cell membrane is selectively permeable, controlling what enters and leaves the cell. By regulating ion and water movement it keeps the internal environment stable, which is the essence of homeostasis.",
        };
        if (fullyGraded) {
          const award = Math.round((Math.min(100, targetPct + (seed % 20) - 10) / 100) * q.marks);
          return { ...base, marksAwarded: Math.max(0, Math.min(q.marks, award)), feedback: award >= q.marks * 0.6 ? "Clear and accurate — good use of the key term." : "On the right track; tie it back to stability explicitly." };
        }
        return base;
      }
      // photo
      const base: Answer = { questionId: q.id, type: "photo", photoDataUrl: PHOTO_PLACEHOLDER };
      if (fullyGraded) {
        const award = Math.round((Math.min(100, targetPct + (seed % 16) - 8) / 100) * q.marks);
        return { ...base, marksAwarded: Math.max(0, Math.min(q.marks, award)), feedback: "Working shown clearly; check the sign on the final line." };
      }
      return base;
    });
  }

  for (const [testId, cfg] of Object.entries(closedWithGrades)) {
    const test = testById.get(testId)!;
    const cohortStudents = students.filter(
      (s) => test.cohortId === null || s.cohortId === test.cohortId,
    );
    cohortStudents.forEach((student, i) => {
      const target =
        student.id === "st_amelia"
          ? ameliaTargets[testId]
          : 50 + (hash100(student.id + testId) % 45);
      // Leave one student on the to-be-graded test with no submission to vary completion.
      if (!cfg.released && i === cohortStudents.length - 1) return;
      const answers = buildAnswers(test, student.id, target, cfg.released);
      // MCQ always auto-graded on submit, even before release.
      const graded = autoGradeMcq(test, answers);
      const startedAt = new Date(new Date(test.opensAt).getTime() + 5 * MIN).toISOString();
      const submittedAt = new Date(new Date(test.opensAt).getTime() + (15 + (i % 10)) * MIN).toISOString();
      submissions.push({
        id: id("sub"),
        testId,
        studentId: student.id,
        answers: graded,
        status: cfg.released ? "released" : "submitted",
        startedAt,
        submittedAt,
        autoSubmitted: i % 4 === 0,
        durationSeconds: (10 + (i % 10)) * 60 + (i * 7) % 60,
        releasedAt: cfg.released ? new Date(new Date(test.closesAt).getTime() + 2 * HR).toISOString() : undefined,
      });
    });
  }

  // ---- Announcements -----------------------------------------------------
  const announcements: Announcement[] = [
    { id: "an_welcome", body: "Welcome to the Autumn 2026 term. Check your dashboard each morning for newly opened tests.", pinned: true, cohortId: null, createdAt: iso(-5 * DAY), dismissedBy: [] },
    { id: "an_algebra", body: "Algebra Foundations is open now and closes in a few hours — don't leave it to the last minute.", pinned: true, cohortId: "co_autumn", createdAt: iso(-30 * MIN), dismissedBy: [] },
    { id: "an_results", body: "Forces & Motion results are being graded and will be released shortly.", pinned: false, cohortId: "co_autumn", createdAt: iso(-2 * DAY), dismissedBy: ["st_noah"] },
    { id: "an_office", body: "Office hours move to Thursdays 4–5pm starting this week.", pinned: false, cohortId: null, createdAt: iso(-3 * DAY), dismissedBy: ["st_priya", "st_liam"] },
  ];

  // ---- Question bank -----------------------------------------------------
  const bank: QuestionBankItem[] = [
    { id: "bk_1", subject: "Mathematics", topic: "Algebra", type: "mcq", prompt: "Solve for x: 3x − 5 = 16", marks: 3, options: ["x = 5", "x = 6", "x = 7", "x = 8"], correctIndex: 2 },
    { id: "bk_2", subject: "Mathematics", topic: "Geometry", type: "mcq", prompt: "The interior angles of a triangle sum to:", marks: 2, options: ["90°", "180°", "270°", "360°"], correctIndex: 1 },
    { id: "bk_3", subject: "Mathematics", topic: "Algebra", type: "text", prompt: "Make x the subject of y = 3x + 4 and show each step.", marks: 4, maxLength: 400, showCounter: true },
    { id: "bk_4", subject: "Physics", topic: "Energy", type: "mcq", prompt: "Kinetic energy depends on mass and:", marks: 2, options: ["colour", "velocity", "temperature", "volume"], correctIndex: 1 },
    { id: "bk_5", subject: "Physics", topic: "Forces", type: "photo", prompt: "Draw a free-body diagram for a box resting on a table and photograph it.", marks: 5 },
    { id: "bk_6", subject: "Biology", topic: "Genetics", type: "mcq", prompt: "A section of DNA coding for a protein is a:", marks: 2, options: ["cell", "gene", "tissue", "organ"], correctIndex: 1 },
    { id: "bk_7", subject: "Biology", topic: "Cells", type: "text", prompt: "Describe one difference between diffusion and osmosis.", marks: 4, maxLength: 400, showCounter: true },
    { id: "bk_8", subject: "English", topic: "Vocabulary", type: "mcq", prompt: "Which word is an antonym of 'expand'?", marks: 2, options: ["grow", "stretch", "contract", "widen"], correctIndex: 2 },
    { id: "bk_9", subject: "English", topic: "Grammar", type: "mcq", prompt: "Identify the noun: 'The bright lantern glowed.'", marks: 2, options: ["bright", "lantern", "glowed", "The"], correctIndex: 1 },
    { id: "bk_10", subject: "Computer Science", topic: "Complexity", type: "mcq", prompt: "Which sort has worst-case O(n²)?", marks: 3, options: ["Merge sort", "Bubble sort", "Heap sort", "Counting sort"], correctIndex: 1 },
  ];

  return {
    cohorts,
    students,
    tests,
    submissions,
    announcements,
    bank,
    classes: [],
    subjects: [],
    notes: [],
    noteAssignments: [],
    rubrics: [],
    adminPassword: "admin2026",
  };
}
