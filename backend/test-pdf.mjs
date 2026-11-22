import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import pdfParse from "pdf-parse";
import fs from "fs";

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
const page = doc.addPage([595.28, 841.89]);
page.drawText("CPU Scheduling & Deadlocks", { x: 50, y: 800, size: 20, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
page.drawText("Operating Systems | Semester 5", { x: 50, y: 775, size: 12, font, color: rgb(0.4, 0.4, 0.4) });
page.drawText("CampusVerse Academic Study Material", { x: 50, y: 750, size: 10, font, color: rgb(0.5, 0.5, 0.5) });

const bytes = await doc.save();
fs.writeFileSync("test_output.pdf", bytes);
const buf = fs.readFileSync("test_output.pdf");
const parsed = await pdfParse(buf);
console.log("SUCCESS! Pages:", parsed.numpages, "Text:", parsed.text.trim());
