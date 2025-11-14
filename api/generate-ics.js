import { createEvent } from "ics";
import * as XLSX from "xlsx";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import Tesseract from "tesseract.js";

export default async function handler(req, res) {

  const file = req.body?.file;
  const text = req.body?.text;
  const url = req.body?.url;

  let extractedText = "";

  // 1. IMAGE → OCR
  if (file && file.mimetype.startsWith("image/")) {
    const result = await Tesseract.recognize(file.buffer, "eng");
    extractedText = result.data.text;
  }

  // 2. CSV/XLSX
  if (file && (file.mimetype.includes("csv") || file.mimetype.includes("sheet"))) {
    const workbook = XLSX.read(file.buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);
    extractedText = JSON.stringify(json);
  }

  // 3. URL extraction
  if (url) {
    const html = await (await fetch(url)).text();
    const $ = cheerio.load(html);
    extractedText = $("body").text();
  }

  // 4. Manual text
  if (text) extractedText = text;

  // Simple ICS event object
  const eventObj = {
    title: extractedText.split("\n")[0] || "New Event",
    start: [2025, 1, 1, 10, 0],
    duration: { hours: 1 },
    description: extractedText
  };

  createEvent(eventObj, (error, value) => {
    res.setHeader("Content-Type", "text/calendar");
    res.send(value);
  });
}
