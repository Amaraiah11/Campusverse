import fs from "fs";
import path from "path";
import FormData from "form-data";
import axios from "axios";

const API_BASE = "http://localhost:5000/api";

async function runTests() {
  console.log("==================================================");
  console.log("🚀 CAMPUSVERSE 5-DOCUMENT RECOGNITION & AI VERIFICATION");
  console.log("==================================================");

  const testCases = [
    {
      label: "1. Academic Notes PDF",
      file: "public/sample_files/01_os_cpu_scheduling.pdf",
      title: "Operating Systems CPU Scheduling & Deadlocks",
      expectedCategory: "Study Material",
    },
    {
      label: "2. Resume PDF",
      file: "public/sample_files/test_sample_resume.pdf",
      title: "Alexander Chen Software Engineer Resume",
      expectedCategory: "Resume / CV",
    },
    {
      label: "3. Resume DOCX",
      file: "public/sample_files/test_sample_resume.docx",
      title: "Priya Sharma Curriculum Vitae",
      expectedCategory: "Resume / CV",
    },
    {
      label: "4. Project Report PDF",
      file: "public/sample_files/test_capstone_project_report.pdf",
      title: "Autonomous Drone Surveillance System Capstone Project",
      expectedCategory: "Project Report",
    },
    {
      label: "5. PowerPoint Presentation PPTX",
      file: "public/sample_files/cse_networks_tcp_ip_osi_architecture.pptx",
      title: "Computer Networks TCP IP & OSI Architecture",
      expectedCategory: "Presentation",
    },
  ];

  let passedAll = true;

  for (const tc of testCases) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Checking: ${tc.label}`);
    console.log(`File: ${tc.file}`);

    const filePath = path.resolve(tc.file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      passedAll = false;
      continue;
    }

    const fileBuf = fs.readFileSync(filePath);

    // Step A: Test Classifier Prediction & Auto-Description
    const formPredict = new FormData();
    formPredict.append("file", fileBuf, path.basename(filePath));
    formPredict.append("title", tc.title);

    try {
      const predRes = await axios.post(`${API_BASE}/classifier/predict`, formPredict, {
        headers: formPredict.getHeaders(),
      });
      const data = predRes.data;

      console.log(`[AI Recognition Result]`);
      console.log(`  Identified Category: "${data.category}" (Expected: "${tc.expectedCategory}")`);
      console.log(`  Identified Subject:  "${data.subject}"`);
      console.log(`  Identified Branch:   "${data.branch || data.department}"`);
      console.log(`  AI Auto-Description: "${data.suggestedDescription}"`);

      const catMatches = data.category === tc.expectedCategory;
      const hasDescription = data.suggestedDescription && data.suggestedDescription.length > 20;

      if (catMatches && hasDescription) {
        console.log(`✅ Recognition & Auto-Description PASSED for ${tc.label}`);
      } else {
        console.error(`❌ Recognition check failed! Category match: ${catMatches}, Has Description: ${hasDescription}`);
        passedAll = false;
      }

      // Step B: Search database for this material
      const searchRes = await axios.get(`${API_BASE}/materials/search?q=${encodeURIComponent(tc.title.split(" ")[0])}`);
      const found = (searchRes.data?.results || []).find((m) =>
        m.title.toLowerCase().includes(tc.title.split(" ")[0].toLowerCase())
      );

      if (found) {
        console.log(`[Database Stored Record]`);
        console.log(`  Document Title:    "${found.title}"`);
        console.log(`  Stored Category:   "${found.category}"`);
        console.log(`  AI Description:    "${found.description}"`);
        if (found.category === tc.expectedCategory && found.description && found.description.length > 20) {
          console.log(`✅ Database Persistence & Retrieval PASSED for ${tc.label}`);
        } else {
          console.error(`❌ Stored document category or description mismatch!`);
          passedAll = false;
        }
      } else {
        console.log(`Record not yet in DB, uploading...`);
        const formUpload = new FormData();
        formUpload.append("file", fileBuf, path.basename(filePath));
        formUpload.append("title", tc.title);
        const upRes = await axios.post(`${API_BASE}/materials`, formUpload, {
          headers: formUpload.getHeaders(),
        });
        const upData = upRes.data?.material || upRes.data;
        console.log(`  Saved Category:    ${upData.category}`);
        console.log(`  Saved Description: ${upData.description}`);
        if (upData.category === tc.expectedCategory && upData.description && upData.description.length > 20) {
          console.log(`✅ Upload auto-save PASSED for ${tc.label}`);
        } else {
          console.error(`❌ Upload auto-save check failed!`);
          passedAll = false;
        }
      }
    } catch (err) {
      console.error(`❌ Error verifying ${tc.label}:`, err.response?.data || err.message);
      passedAll = false;
    }
  }

  // Step C: Verify AI Search Results for multiple queries
  console.log(`\n--------------------------------------------------`);
  console.log(`Testing Search Results Across All 5 Document Types...`);

  const searchTests = [
    { query: "Operating Systems", expectedCat: "Study Material" },
    { query: "Alexander Chen", expectedCat: "Resume / CV" },
    { query: "Priya Sharma", expectedCat: "Resume / CV" },
    { query: "Drone Surveillance", expectedCat: "Project Report" },
    { query: "TCP IP OSI Architecture", expectedCat: "Presentation" },
  ];

  for (const st of searchTests) {
    try {
      const res = await axios.get(`${API_BASE}/materials/search?q=${encodeURIComponent(st.query)}`);
      const matches = res.data?.results || [];
      const item = matches.find((m) => m.category === st.expectedCat);
      if (item) {
        console.log(`✅ Search for "${st.query}" -> Found: "${item.title}" [Category: ${item.category}] [AI Desc: "${item.description.slice(0, 75)}..."]`);
      } else {
        console.error(`❌ Search for "${st.query}" did not return expected category "${st.expectedCat}"`);
        passedAll = false;
      }
    } catch (e) {
      console.error(`❌ Search error for "${st.query}":`, e.message);
      passedAll = false;
    }
  }

  console.log("\n==================================================");
  if (passedAll) {
    console.log("🎉 ALL 5 DOCUMENT TYPES & AI DESCRIPTIONS FULLY VERIFIED!");
  } else {
    console.log("⚠️ Some checks failed. Please inspect logs.");
  }
  console.log("==================================================");
}

runTests();
