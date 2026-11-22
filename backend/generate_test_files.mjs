import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

async function createTestFiles() {
  const outDir = path.resolve("public/sample_files");

  // ==========================================
  // 1. Resume PDF
  // ==========================================
  const resumeDoc = await PDFDocument.create();
  const font = await resumeDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await resumeDoc.embedFont(StandardFonts.HelveticaBold);
  const resumePage = resumeDoc.addPage([595.28, 841.89]);

  const resumeLines = [
    { text: "ALEXANDER CHEN", size: 18, bold: true, y: 790 },
    { text: "alexander.chen@email.com | (555) 234-5678 | San Francisco, CA | github.com/alexchen", size: 10, bold: false, y: 770 },
    { text: "PROFESSIONAL SUMMARY", size: 12, bold: true, y: 740 },
    { text: "Full-Stack Software Engineer with 4+ years of experience designing and scaling distributed systems, cloud microservices, and React web applications.", size: 10, bold: false, y: 725 },
    { text: "TECHNICAL SKILLS", size: 12, bold: true, y: 700 },
    { text: "Languages: JavaScript, TypeScript, Python, Java, SQL, Go", size: 10, bold: false, y: 685 },
    { text: "Frameworks: React, Node.js, Express, FastAPI, Next.js, Spring Boot", size: 10, bold: false, y: 670 },
    { text: "Cloud & DevOps: AWS (EC2, S3, Lambda), Docker, Kubernetes, CI/CD, PostgreSQL, Supabase", size: 10, bold: false, y: 655 },
    { text: "WORK EXPERIENCE", size: 12, bold: true, y: 630 },
    { text: "Senior Software Engineer — TechSphere Solutions (2022 - Present)", size: 11, bold: true, y: 615 },
    { text: "- Architected high-throughput REST APIs handling 5M daily requests with Node.js and Redis caching.", size: 9.5, bold: false, y: 600 },
    { text: "- Designed asynchronous messaging queues using RabbitMQ to decouple notification microservices.", size: 9.5, bold: false, y: 585 },
    { text: "- Led migration from monolithic architecture to containerized Docker microservices on AWS EKS.", size: 9.5, bold: false, y: 570 },
    { text: "Software Developer — InnovateX Labs (2020 - 2022)", size: 11, bold: true, y: 550 },
    { text: "- Implemented dynamic interactive dashboards using React, Redux Toolkit, and Tailwind CSS.", size: 9.5, bold: false, y: 535 },
    { text: "- Built robust authentication flows using JWT, OAuth2, and role-based access control.", size: 9.5, bold: false, y: 520 },
    { text: "EDUCATION & CERTIFICATIONS", size: 12, bold: true, y: 495 },
    { text: "Bachelor of Science in Computer Science — University of California, Berkeley (2016 - 2020)", size: 10, bold: false, y: 480 },
    { text: "AWS Certified Solutions Architect — Associate (2023)", size: 10, bold: false, y: 465 },
    { text: "KEY PROJECTS", size: 12, bold: true, y: 440 },
    { text: "CloudMetrics: Real-time distributed telemetry pipeline using Go, Kafka, and Grafana.", size: 9.5, bold: false, y: 425 },
    { text: "CampusConnect: Open-source peer mentorship platform built with React, Node.js, and Supabase.", size: 9.5, bold: false, y: 410 },
  ];

  for (const line of resumeLines) {
    resumePage.drawText(line.text, {
      x: 50,
      y: line.y,
      size: line.size,
      font: line.bold ? fontBold : font,
      color: rgb(0.15, 0.15, 0.15),
    });
  }

  const resumeBytes = await resumeDoc.save();
  const resumePdfPath = path.join(outDir, "test_sample_resume.pdf");
  fs.writeFileSync(resumePdfPath, resumeBytes);
  console.log("Created Resume PDF:", resumePdfPath);

  // ==========================================
  // 2. Project Report PDF
  // ==========================================
  const reportDoc = await PDFDocument.create();
  const repFont = await reportDoc.embedFont(StandardFonts.Helvetica);
  const repBold = await reportDoc.embedFont(StandardFonts.HelveticaBold);
  const repPage1 = reportDoc.addPage([595.28, 841.89]);

  const reportLines = [
    { text: "PROJECT REPORT: AUTONOMOUS DRONE SURVEILLANCE SYSTEM", size: 15, bold: true, y: 790 },
    { text: "Capstone Project Documentation | Department of Computer Science & Engineering", size: 10, bold: false, y: 770 },
    { text: "Authors: Team AeroVision | Academic Year 2025-2026", size: 9.5, bold: false, y: 755 },
    { text: "1. ABSTRACT", size: 12, bold: true, y: 725 },
    { text: "This capstone project report presents the design, implementation, and evaluation of an autonomous aerial surveillance system using edge AI and computer vision. The system performs real-time obstacle avoidance, object detection, and GPS-guided telemetry transmission across wireless mesh networks.", size: 9.5, bold: false, y: 705 },
    { text: "2. PROBLEM STATEMENT & OBJECTIVES", size: 12, bold: true, y: 660 },
    { text: "Modern facility inspection and security surveillance require autonomous patrols capable of navigating dynamic environments without human telemetry latency. This project implements low-latency edge inference on an onboard NVIDIA Jetson Nano paired with a flight controller.", size: 9.5, bold: false, y: 640 },
    { text: "3. SYSTEM ARCHITECTURE & METHODOLOGY", size: 12, bold: true, y: 595 },
    { text: "- Hardware Layer: Carbon fiber quadcopter frame, Pixhawk 4 autopilot, Intel RealSense D435 depth camera.", size: 9.5, bold: false, y: 575 },
    { text: "- Neural Network Pipeline: Quantized YOLOv8-nano model optimized with TensorRT achieving 32 FPS.", size: 9.5, bold: false, y: 560 },
    { text: "- Communication & Control: ROS2 (Robot Operating System) nodes communicating via MAVLink protocol.", size: 9.5, bold: false, y: 545 },
    { text: "4. EXPERIMENTAL RESULTS & PERFORMANCE EVALUATION", size: 12, bold: true, y: 510 },
    { text: "Field experiments demonstrated a 94.2% mean average precision (mAP) in detecting perimeter intruders and a 99.1% success rate in dynamic obstacle avoidance under varying outdoor illumination conditions.", size: 9.5, bold: false, y: 490 },
    { text: "5. CONCLUSION & FUTURE WORK", size: 12, bold: true, y: 445 },
    { text: "The autonomous drone system successfully fulfilled all operational specifications for autonomous waypoint tracking, perimeter safety monitoring, and secure ground-station telemetry logging.", size: 9.5, bold: false, y: 425 },
  ];

  for (const line of reportLines) {
    repPage1.drawText(line.text, {
      x: 50,
      y: line.y,
      size: line.size,
      font: line.bold ? repBold : repFont,
      color: rgb(0.15, 0.15, 0.15),
    });
  }

  const reportBytes = await reportDoc.save({ useObjectStreams: false });
  const reportPdfPath = path.join(outDir, "test_capstone_project_report.pdf");
  fs.writeFileSync(reportPdfPath, reportBytes);
  console.log("Created Project Report PDF:", reportPdfPath);

  // ==========================================
  // 3. Resume DOCX
  // ==========================================
  // Use existing docx as base template and replace word/document.xml with resume content
  const sampleDocxPath = path.join(outDir, "02_dbms_sql_normalization.docx");
  if (fs.existsSync(sampleDocxPath)) {
    const zip = new AdmZip(sampleDocxPath);
    const resumeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>PRIYA SHARMA - CURRICULUM VITAE</w:t></w:r></w:p>
    <w:p><w:r><w:t>priya.sharma@techmail.com | +91-9876543210 | Bangalore, India</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>PROFESSIONAL SUMMARY</w:t></w:r></w:p>
    <w:p><w:r><w:t>Data Scientist and Machine Learning Engineer with 3+ years experience building predictive models, NLP pipelines, and production machine learning workflows using Python, PyTorch, and Scikit-Learn.</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>TECHNICAL SKILLS</w:t></w:r></w:p>
    <w:p><w:r><w:t>Machine Learning, Deep Learning, Natural Language Processing, Python, TensorFlow, PyTorch, SQL, Pandas, NumPy, Docker, AWS SageMaker.</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>WORK EXPERIENCE</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Machine Learning Engineer - DataCore Analytics (2022 - Present)</w:t></w:r></w:p>
    <w:p><w:r><w:t>- Designed and deployed customer churn prediction model with 92% ROC-AUC score.</w:t></w:r></w:p>
    <w:p><w:r><w:t>- Built automated document classification pipeline processing 100k daily text files using transformer embeddings.</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>EDUCATION</w:t></w:r></w:p>
    <w:p><w:r><w:t>B.Tech in Artificial Intelligence and Data Science - National Institute of Technology (2018 - 2022)</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>CERTIFICATIONS</w:t></w:r></w:p>
    <w:p><w:r><w:t>TensorFlow Developer Certificate | AWS Certified Machine Learning - Specialty</w:t></w:r></w:p>
  </w:body>
</w:document>`;
    zip.updateFile("word/document.xml", Buffer.from(resumeXml, "utf-8"));
    const resumeDocxPath = path.join(outDir, "test_sample_resume.docx");
    zip.writeZip(resumeDocxPath);
    console.log("Created Resume DOCX:", resumeDocxPath);
  }
}

createTestFiles().catch(console.error);
