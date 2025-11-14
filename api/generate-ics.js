import formidable from "formidable";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import Tesseract from "tesseract.js";
import * as XLSX from "xlsx";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  const form = formidable({ multiples: false });
  const { fields, files } = await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });

  let text = fields.text || "";
  let url = fields.url || "";
  let extractedText = text;

  // -------------------------------------------------------
  // 1️⃣ IMAGE OCR
  // -------------------------------------------------------
  if (files.file && files.file.mimetype.startsWith("image/")) {
    const result = await Tesseract.recognize(files.file.filepath, "eng");
    extractedText = result.data.text;
  }

  // -------------------------------------------------------
  // 2️⃣ CSV / XLSX Extraction
  // -------------------------------------------------------
  if (files.file && (files.file.mimetype.includes("csv") || files.file.mimetype.includes("sheet"))) {
    const workbook = XLSX.readFile(files.file.filepath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);
    extractedText = JSON.stringify(json, null, 2);
  }

  // -------------------------------------------------------
  // 3️⃣ URL Extraction (scraping)
  // -------------------------------------------------------
  if (url) {
    const html = await (await fetch(url)).text();
    const $ = cheerio.load(html);
    extractedText = $("body").text().trim();
  }

  // -------------------------------------------------------
  // 4️⃣ Default Fallback
  // -------------------------------------------------------
  if (!extractedText || extractedText.length < 2) {
    extractedText = "Generated Event";
  }

  const title = extractedText.split("\n")[0].trim().slice(0, 40);
  const description = extractedText.replace(/\n/g, "\\n");

  // -------------------------------------------------------
  // 5️⃣ ICS FORMATTING (100% working)
  // -------------------------------------------------------
  const UID = uuidv4();
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const dtStart = "20251215T180000"; // aap chahe to field se dynamic bana sakte ho
  const dtEnd = "20251215T220000";

  let ics = `
BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
PRODID:-//EventExtractor/EN
X-WR-CALNAME:${title}
BEGIN:VEVENT
UID:${UID}@event-extractor.com
DTSTAMP:${now}
DTSTART;TZID=Asia/Calcutta:${dtStart}
DTEND;TZID=Asia/Calcutta:${dtEnd}
SUMMARY:${title}
DESCRIPTION:${description}
LOCATION:
END:VEVENT
END:VCALENDAR
  `.trim();

  // MUST USE CRLF
  ics = ics.replace(/\n/g, "\r\n");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=event.ics");
  res.send(ics);
}
