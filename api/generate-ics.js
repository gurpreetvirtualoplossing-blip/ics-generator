import formidable from "formidable";
import { createEvent } from "ics";
import * as XLSX from "xlsx";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import Tesseract from "tesseract.js";

// Disable default body parser for file uploads
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

  let extractedText = "";

  const text = fields.text;
  const url = fields.url;
  const file = files.file;

  // 1️⃣ Image OCR
  if (file && file.mimetype.startsWith("image/")) {
    const result = await Tesseract.recognize(file.filepath, "eng");
    extractedText = result.data.text;
  }

  // 2️⃣ CSV / XLSX
  if (file && (file.mimetype.includes("csv") || file.mimetype.includes("sheet"))) {
    const workbook = XLSX.readFile(file.filepath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);
    extractedText = JSON.stringify(json);
  }

  // 3️⃣ URL scraping
  if (url) {
    const html = await (await fetch(url)).text();
    const $ = cheerio.load(html);
    extractedText = $("body").text();
  }

  // 4️⃣ Manual text
  if (text) extractedText = text;

  // 🟦 Default event for ICS
  const eventObj = {
    title: extractedText.split("\n")[0] || "Generated Event",
    description: extractedText,
    start: [2025, 1, 1, 10, 0],
    duration: { hours: 1 }
  };

  createEvent(eventObj, (error, value) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: "ICS creation failed" });
    }

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=event.ics");
    res.send(value);
  });
}
