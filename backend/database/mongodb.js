import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/campusverse";

let isConnected = false;

// 1. Material Schema
const materialSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    uploader_name: { type: String, default: "Student Scholar" },
    uploader_email: { type: String, default: "student@campusverse.edu" },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    department: { type: String, default: "Computer Science & Engineering" },
    subject: { type: String, default: "Academic Study Notes" },
    file_path: { type: String, default: "" },
    file_type: { type: String, default: "PDF" },
    file_size: { type: String, default: "1.0 MB" },
    file_hash: { type: String, default: "" },
    page_count: { type: Number, default: 1 },
    verification_status: { type: String, default: "APPROVED" },
    verification_reason: { type: String, default: "Verified academic study notes." },
    downloads: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    rating_count: { type: Number, default: 0 },
    ratings: [
      {
        userId: { type: String, required: true },
        rating: { type: Number, required: true, min: 1, max: 5 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    extracted_text: { type: String, default: "" },
    chunks: [
      {
        pageNumber: { type: Number, default: 1 },
        text: { type: String, default: "" },
      },
    ],
    summary: { type: String, default: "" },
    structuredSummary: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

materialSchema.index(
  {
    title: "text",
    description: "text",
    subject: "text",
    department: "text",
    extracted_text: "text",
    "chunks.text": "text",
  },
  {
    weights: {
      title: 10,
      subject: 8,
      description: 6,
      "chunks.text": 4,
      extracted_text: 2,
    },
    name: "MaterialTextIndex",
  }
);

// 2. User Profile Schema
const userSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    department: { type: String, default: "Computer Science & Engineering" },
    role: { type: String, default: "student" },
    bio: { type: String, default: "" },
    college: { type: String, default: "Campus University of Technology" },
    avatarUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

// 3. Conversation Schema
const conversationSchema = new mongoose.Schema(
  {
    sessionId: { type: String, unique: true, required: true, index: true },
    user_id: { type: String, default: "demo-usr-1", index: true },
    title: { type: String, default: "Academic Study Session" },
    materialId: { type: String, default: null },
    materialIds: [{ type: String }],
    messages: [
      {
        id: { type: String, default: () => `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` },
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, required: true },
        sources: [
          {
            materialId: String,
            title: String,
            pageNumber: Number,
            snippet: String,
          },
        ],
        groundedInNotes: { type: Boolean, default: false },
        isGeneralKnowledge: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export const Material = mongoose.models.Material || mongoose.model("Material", materialSchema);
export const User = mongoose.models.User || mongoose.model("User", userSchema);
export const Conversation = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);

/**
 * Connect to MongoDB and seed starter materials
 */
export async function connectMongoDB() {
  if (isConnected) return true;

  try {
    mongoose.set("strictQuery", false);
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 4000,
      autoIndex: true,
    });
    isConnected = true;
    console.log(`✅ MongoDB connected successfully to ${MONGODB_URI}`);

    // Safely remove semester concept across all existing documents without deleting data
    try {
      await Material.collection.updateMany({}, { $unset: { semester: "" } });
      await User.collection.updateMany({}, { $unset: { semester: "" } });
    } catch (migErr) {
      console.warn("Semester cleanup migration notice:", migErr.message);
    }

    // Seed default materials if missing
    await seedStarterData();
    return true;
  } catch (err) {
    console.warn(`⚠️ MongoDB connection warning (${MONGODB_URI}): ${err.message}`);
    isConnected = false;
    return false;
  }
}

export function isMongoConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * Seeds initial academic materials for demo-usr-1 with full extracted text
 */
async function seedStarterData() {
  try {
    const seeds = [
      {
        id: "eng-cs-1",
        user_id: "demo-usr-1",
        uploader_name: "Student Scholar",
        uploader_email: "student@campusverse.edu",
        title: "CPU Scheduling Algorithms & Deadlock Banker's Protocol",
        description: "In-depth reference notes on CPU scheduling algorithms and concurrency control.",
        department: "Computer Science & Engineering",
        subject: "Operating Systems",
        file_type: "PDF",
        file_size: "1.4 MB",
        page_count: 24,
        verification_status: "APPROVED",
        verification_reason: "Academic document verified for Operating Systems curriculum.",
        downloads: 342,
        rating: 4.8,
        rating_count: 5,
        ratings: [
          { userId: "usr_peer_1", rating: 5 },
          { userId: "usr_peer_2", rating: 5 },
          { userId: "usr_peer_3", rating: 4 },
          { userId: "usr_peer_4", rating: 5 },
          { userId: "usr_peer_5", rating: 5 },
        ],
        extracted_text: `Module 1: CPU Scheduling Concepts
CPU scheduling is the basis of multiprogrammed operating systems. By switching the CPU among processes, the operating system can make the computer more productive.
Core Scheduling Algorithms:
1. First-Come, First-Served (FCFS): Simple FIFO queue. Convoy effect occurs when short processes wait behind one long CPU-burst process.
2. Shortest-Job-First (SJF): Associates each process with the length of its next CPU burst. Optimal in minimizing average waiting time. Preemptive SJF is known as Shortest-Remaining-Time-First (SRTF).
3. Round Robin (RR): Allocates each process a small unit of CPU time (time quantum, typically 10 to 100 milliseconds). Ready queue treated as circular queue.
4. Priority Scheduling: Equal or unequal priority levels; starvation or indefinite blocking is resolved via aging.

Module 2: Deadlocks and Banker's Algorithm
Four Necessary Conditions for Deadlock:
1. Mutual Exclusion: At least one resource must be non-shareable.
2. Hold and Wait: A process must hold at least one resource and wait for additional resources held by other processes.
3. No Preemption: Resources cannot be preempted; a resource can only be released voluntarily by the process holding it.
4. Circular Wait: A set {P0, P1, ..., Pn} of waiting processes must exist such that P0 waits for P1, P1 for P2, and Pn for P0.

Banker's Algorithm:
Data Structures:
- Available[m]: Available instances of resource type Rj.
- Max[n][m]: Maximum demand of process Pi for resource Rj.
- Allocation[n][m]: Current instances of resource Rj allocated to process Pi.
- Need[n][m] = Max[n][m] - Allocation[n][m].
Safety Algorithm determines if a safe sequence exists where Work = Available and Finish[i] = false.`,
        chunks: [
          {
            pageNumber: 1,
            text: "CPU Scheduling Algorithms: FCFS, SJF, Round Robin, and Priority Scheduling. SJF is provably optimal for minimizing average turnaround time. Round Robin uses fixed time quantum (10-100ms) to ensure interactive responsiveness.",
          },
          {
            pageNumber: 2,
            text: "Four Necessary Conditions for Deadlock: Mutual Exclusion, Hold and Wait, No Preemption, Circular Wait. All four conditions must hold simultaneously for a deadlock to occur.",
          },
          {
            pageNumber: 3,
            text: "Banker's Algorithm: Avoids deadlocks by dynamically testing resource allocation against state safety. Need matrix formula: Need[i][j] = Max[i][j] - Allocation[i][j]. Safety test verifies if system can allocate max requested resources without deadlocking.",
          },
        ],
        summary: "Comprehensive guide to CPU scheduling (FCFS, SJF, Round Robin) and Deadlock avoidance using Dijkstra's Banker's algorithm.",
        created_at: new Date(Date.now() - 86400000 * 2),
      },
      {
        id: "med-card-2",
        user_id: "demo-usr-1",
        uploader_name: "Student Scholar",
        uploader_email: "student@campusverse.edu",
        title: "Clinical Practice Guidelines for Hypertension Management",
        description: "Comprehensive medical guideline for adult essential hypertension.",
        department: "Medical Sciences",
        subject: "Cardiology",
        file_type: "PDF",
        file_size: "2.1 MB",
        page_count: 32,
        verification_status: "APPROVED",
        verification_reason: "Academic medical curriculum guidelines verified.",
        downloads: 215,
        rating: 4.7,
        rating_count: 3,
        ratings: [
          { userId: "usr_med_1", rating: 5 },
          { userId: "usr_med_2", rating: 4 },
          { userId: "usr_med_3", rating: 5 },
        ],
        extracted_text: `Clinical Guidelines for Adult Hypertension Management:
Blood Pressure Classification:
- Normal: SBP < 120 mmHg and DBP < 80 mmHg.
- Elevated: SBP 120-129 mmHg and DBP < 80 mmHg.
- Stage 1 Hypertension: SBP 130-139 mmHg or DBP 80-89 mmHg.
- Stage 2 Hypertension: SBP >= 140 mmHg or DBP >= 90 mmHg.
- Hypertensive Crisis: SBP > 180 mmHg and/or DBP > 120 mmHg.

Pharmacotherapy First-Line Agents:
1. Thiazide-type diuretics (Chlorthalidone, Hydrochlorothiazide).
2. Angiotensin-Converting Enzyme (ACE) Inhibitors (Lisinopril, Enalapril).
3. Angiotensin Receptor Blockers (ARBs) (Losartan, Valsartan).
4. Calcium Channel Blockers (CCBs) (Amlodipine, Nifedipine).
Contraindication: Never combine ACE inhibitors and ARBs simultaneously due to hyperkalemia and renal failure risks.
Lifestyle Interventions: DASH diet, dietary sodium intake < 2,300 mg/day, 150 min/week moderate-intensity physical aerobic exercise.`,
        chunks: [
          {
            pageNumber: 1,
            text: "Hypertension Classification: Normal (<120/<80 mmHg), Elevated (120-129/<80), Stage 1 (130-139/80-89), Stage 2 (>=140/>=90 mmHg). Hypertensive Crisis (>180 and/or >120 mmHg).",
          },
          {
            pageNumber: 2,
            text: "First-Line Antihypertensive Agents: ACE inhibitors, ARBs, CCBs, and Thiazide diuretics. Avoid dual ACE inhibitor + ARB combination due to acute kidney injury risks.",
          },
        ],
        summary: "Clinical guidelines on hypertension diagnostic staging, first-line antihypertensive drugs, and lifestyle interventions.",
        created_at: new Date(Date.now() - 86400000 * 5),
      },
      {
        id: "bus-an-3",
        user_id: "demo-usr-1",
        uploader_name: "Student Scholar",
        uploader_email: "student@campusverse.edu",
        title: "Business Analytics Study Guide",
        description: "Core statistical models and descriptive analytics frameworks for business decisions.",
        department: "Management & Business Studies",
        subject: "Business Analytics",
        file_type: "PDF",
        file_size: "50.7 KB",
        page_count: 8,
        verification_status: "APPROVED",
        verification_reason: "Verified business analytics syllabus notes.",
        downloads: 98,
        rating: 4.9,
        rating_count: 2,
        ratings: [
          { userId: "usr_biz_1", rating: 5 },
          { userId: "usr_biz_2", rating: 5 },
        ],
        extracted_text: `Business Analytics Core Framework:
Three Pillars of Analytics:
1. Descriptive Analytics: What happened? Examines historical metrics, summaries, KPIs, and data distributions (mean, median, variance, histograms).
2. Predictive Analytics: What could happen? Leverages regression analysis, time-series forecasting, machine learning models, and classification algorithms.
3. Prescriptive Analytics: What should we do? Utilizes mathematical optimization (linear programming, integer programming) and simulation modeling to recommend optimal business actions.

Regression Modeling:
- Linear regression: y = beta_0 + beta_1 * x + epsilon.
- Ordinary Least Squares (OLS) minimizes sum of squared residuals.
- R-squared measures the proportion of variance in dependent variable explained by predictors.`,
        chunks: [
          {
            pageNumber: 1,
            text: "Three Pillars of Analytics: Descriptive (historical analysis), Predictive (future forecasting via regression & ML), and Prescriptive (decision optimization using linear programming).",
          },
          {
            pageNumber: 2,
            text: "Linear Regression: Models relationship between predictor and outcome variables using OLS. R-squared evaluates goodness-of-fit.",
          },
        ],
        summary: "Foundational frameworks covering Descriptive, Predictive, and Prescriptive analytics, with regression modeling fundamentals.",
        created_at: new Date(Date.now() - 86400000),
      },
    ];

    let inserted = 0;
    for (const seed of seeds) {
      const exists = await Material.findOne({ id: seed.id });
      if (!exists) {
        await Material.create(seed);
        inserted++;
      }
    }
    if (inserted > 0) {
      console.log(`✅ Successfully seeded ${inserted} missing starter materials into MongoDB.`);
    }
  } catch (err) {
    console.error("Error seeding starter data:", err.message);
  }
}
