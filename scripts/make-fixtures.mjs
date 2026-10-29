// Writes small one-page test PDFs into tests/fixtures/. No dependencies.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// One line per array item; a string is a single line.
function pdf(text) {
  const lines = [text].flat();
  const stream = `BT /F1 24 Tf 72 720 Td ${lines.map((l) => `(${l}) Tj`).join(" 0 -40 Td ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

const files = {
  "Hafta 1_Giris.pdf": "Hafta 1 Giris",
  "Hafta 2_Katmanlar.pdf": "Hafta 2 Katmanlar",
  "Ozet.pdf": "Ozet",
  "Hafta 5_Protokoller.pdf": ["Protokol: iletisim kurallari", "OSI modeli kac katmandir?", "Kapsulleme sinavda cikar"],
  "Aglar/Hafta 3_TCP.pdf": "Hafta 3 TCP",
  "Aglar/Hafta 4_UDP.pdf": "Hafta 4 UDP",
};
for (const [name, text] of Object.entries(files)) {
  const path = join("tests/fixtures", name);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, pdf(text), "latin1");
}
console.log(`${Object.keys(files).length} fixtures written`);
