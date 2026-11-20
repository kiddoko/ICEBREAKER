// A little demo .mod made from scratch (our own samples and notes, free to use): for testing breakerMED.
//   node modules/breakermed/tools/make-demo.mjs demo.mod
import { writeFileSync } from "node:fs";
const out = [];
const u8 = (v) => out.push(v & 255), u16 = (v) => (u8(v >> 8), u8(v));
const text = (s, n) => { for (let i = 0; i < n; i++) u8(i < s.length ? s.charCodeAt(i) : 0); };
// samples: 1 square (looped), 2 saw bass (looped), 3 kick, 4 hat (noise)
const sq = Array.from({ length: 64 }, (_, i) => (i < 32 ? 90 : -90));
const saw = Array.from({ length: 64 }, (_, i) => Math.round(i * 3.5 - 112));
const kick = Array.from({ length: 3000 }, (_, i) => Math.round(120 * Math.exp(-i / 700) * Math.sin(2 * Math.PI * i * (60 + 200 * Math.exp(-i / 150)) / 8287)));
let seed = 1; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const hat = Array.from({ length: 900 }, (_, i) => Math.round(90 * Math.exp(-i / 120) * rnd()));
const samples = [["square", sq, true, 40], ["saw bass", saw, true, 52], ["kick", kick, false, 64], ["hat", hat, false, 34]];
text("breakerMED demo", 20);
for (let i = 0; i < 31; i++) {
  const s = samples[i];
  text(s ? s[0] : "", 22);
  if (!s) { u16(0); u8(0); u8(0); u16(0); u16(1); continue; }
  u16(s[1].length / 2); u8(0); u8(s[3]); u16(0); u16(s[2] ? s[1].length / 2 : 1);
}
const P = [856,808,762,720,678,640,604,570,538,508,480,453,428,404,381,360,339,320,302,285,269,254,240,226,214,202,190,180,170,160,151,143,135,127,120,113];
const order = [0, 1, 0, 2];
u8(order.length); u8(127); for (let i = 0; i < 128; i++) u8(order[i] ?? 0); text("M.K.", 4);
const melody = [24, 27, 31, 34, 31, 27, 24, 22, 24, 27, 31, 29, 27, 26, 24, 19];
const bass = [12, 12, 15, 15, 17, 17, 10, 10];
function pattern(variant) {
  for (let line = 0; line < 64; line++)
    for (let t = 0; t < 4; t++) {
      let note = -1, inst = 0, e = 0, p = 0;
      if (t === 0 && line % 4 === 0) { note = melody[(line / 4 + variant * 3) % 16] - (variant === 2 ? 12 : 0); inst = 1; e = 0xa; p = 0x01; }
      if (t === 0 && line % 4 === 2 && variant === 1) { note = melody[(line / 4 + 5) % 16]; inst = 1; e = 0x4; p = 0x46; }
      if (t === 1 && line % 8 === 0) { note = bass[(line / 8) % 8]; inst = 2; }
      if (t === 2 && line % 8 === 0) { note = 12; inst = 3; }
      if (t === 2 && line % 16 === 12 && variant) { note = 12; inst = 3; e = 0xc; p = 0x28; }
      if (t === 3 && line % 2 === 1) { note = 24; inst = 4; e = 0xc; p = line % 4 === 3 ? 0x30 : 0x18; }
      if (t === 3 && line === 0 && variant === 0) { e = 0xf; p = 0x05; }
      const per = note >= 0 ? P[Math.max(0, Math.min(35, note))] : 0;
      u8((inst & 0xf0) | (per >> 8)); u8(per & 255); u8(((inst & 15) << 4) | e); u8(p);
    }
}
pattern(0); pattern(1); pattern(2);
for (const s of samples) for (const v of s[1]) u8(v);
writeFileSync(process.argv[2], Uint8Array.from(out));
console.log("wrote", process.argv[2], out.length, "bytes");
