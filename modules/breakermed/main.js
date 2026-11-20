// modules/breakermed/src/keys.ts
/**
* The computer's keyboard as a piano, the way trackers have always done it:
* the bottom row (Z S X D C V G B H N J M) is an octave, the row above it
* (Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P) the next one and a bit. Read by the
* key's PLACE (KeyboardEvent.code), never its letter: on an AZERTY keyboard
* W X C… sit where Z X C… are on a QWERTY one, and play the same notes.
*/
var PIANO = {
	KeyZ: 0,
	KeyS: 1,
	KeyX: 2,
	KeyD: 3,
	KeyC: 4,
	KeyV: 5,
	KeyG: 6,
	KeyB: 7,
	KeyH: 8,
	KeyN: 9,
	KeyJ: 10,
	KeyM: 11,
	Comma: 12,
	KeyL: 13,
	Period: 14,
	Semicolon: 15,
	Slash: 16,
	KeyQ: 12,
	Digit2: 13,
	KeyW: 14,
	Digit3: 15,
	KeyE: 16,
	KeyR: 17,
	Digit5: 18,
	KeyT: 19,
	Digit6: 20,
	KeyY: 21,
	Digit7: 22,
	KeyU: 23,
	KeyI: 24,
	Digit9: 25,
	KeyO: 26,
	Digit0: 27,
	KeyP: 28,
	BracketLeft: 29,
	Equal: 30,
	BracketRight: 31
};
/** The semitone above the octave's C a key plays (0–31), or null for a key that isn't on the piano. */
function pianoKey(code) {
	return code in PIANO ? PIANO[code] : null;
}
var NOTE_NAMES = [
	"C-",
	"C#",
	"D-",
	"D#",
	"E-",
	"F-",
	"F#",
	"G-",
	"G#",
	"A-",
	"A#",
	"B-"
];
function emptyCell(pages = 1) {
	return {
		note: 0,
		inst: 0,
		cmd: new Array(pages).fill(0),
		val: new Array(pages).fill(0)
	};
}
function newBlock(tracks, lines = 64, pages = 1, name = "") {
	return {
		name,
		lines,
		pages,
		cells: Array.from({ length: lines }, () => Array.from({ length: tracks }, () => emptyCell(pages)))
	};
}
function emptyInstrument() {
	return {
		name: "",
		kind: "empty",
		data: /* @__PURE__ */ new Float32Array(0),
		bits16: false,
		loopStart: 0,
		loopLength: 0,
		pingPong: false,
		volume: 64,
		gain: 1,
		finetune: 0,
		transpose: 0,
		hold: 0,
		decay: 0
	};
}
/** The Amiga's voices: left, right, right, left (again for more tracks), not quite hard. */
function amigaPan(tracks, width = .6) {
	return Array.from({ length: tracks }, (_, i) => (i & 3) === 0 || (i & 3) === 3 ? -width : width);
}
/** "C-3", "D#1", "---", "^^^" (note off) */
function noteName(n) {
	if (!n) return "---";
	if (n === 128) return "^^^";
	const i = n - 1;
	return `${NOTE_NAMES[i % 12]}${Math.floor(i / 12) + 1}`.slice(0, 3);
}
var hex = (v, digits = 2) => v.toString(16).toUpperCase().padStart(digits, "0");
/** The Amiga's clock (PAL): a period of P plays PAULA_CLOCK / P frames a second. */
var PAULA_CLOCK = 3546895;
/**
* ProTracker's periods for finetune 0, C-1 … B-3 (its exact table; the
* other finetunes and the octaves past it follow the same curve).
*/
var PT_PERIODS = [
	856,
	808,
	762,
	720,
	678,
	640,
	604,
	570,
	538,
	508,
	480,
	453,
	428,
	404,
	381,
	360,
	339,
	320,
	302,
	285,
	269,
	254,
	240,
	226,
	214,
	202,
	190,
	180,
	170,
	160,
	151,
	143,
	135,
	127,
	120,
	113
];
/** The period of a note (0 = C-1, may be negative or past B-3) with a finetune -8…7. */
function periodOf(semi, finetune = 0) {
	if (finetune === 0 && semi >= 0 && semi < PT_PERIODS.length) return PT_PERIODS[semi];
	return 856 * Math.pow(2, -(semi + finetune / 8) / 12);
}
/** The note (0 = C-1) closest to a period — for a .mod's cells. */
function semiOfPeriod(period) {
	let best = 0;
	let dist = Infinity;
	for (let s = -24; s < 72; s++) {
		const d = Math.abs(periodOf(s) - period);
		if (d < dist) dist = d, best = s;
	}
	return best;
}
/** The tempo as ProTracker's BPM (ticks at BPM × 2 / 5 Hz). */
function ptBpmOf(mode, tempo, lpb, eightChannel = false, hardwareMix = true) {
	const t = Math.max(1, tempo);
	if (mode === "pt") return Math.max(32, Math.min(255, t));
	if (mode === "bpm" && !eightChannel) return t < 7 ? 111.5 : t * Math.max(1, lpb) / 4;
	if (eightChannel) return [
		179,
		164,
		152,
		141,
		131,
		123,
		116,
		110,
		104,
		99
	][Math.min(10, t) - 1];
	if (hardwareMix && t <= 10) return 10640682 / 14500 / t;
	if (!hardwareMix && t < 8) return 157.86;
	return t / .264;
}
// modules/breakermed/src/app.ts
/** a cell's width: "C-3 01 0C20" and 5 more a command page */
var cellW = (pages) => 6 + pages * 5;
var LEFT = 22;
function makeApp(ib, engine, st) {
	const { BOLD, t, truncate, ListView, mix } = ib.lib;
	const run = (line) => void ib.shell.run(line);
	const seqList = new ListView();
	const instList = new ListView();
	seqList.cmdOf = (i) => `med pos ${i}`;
	seqList.onActivate = (i) => run(`med play song ${i}`);
	instList.onSelect = (i) => st.inst = i;
	instList.onActivate = (i) => preview(st.octave * 12, i);
	/** first track shown (the page scrolls sideways when they don't fit) */
	let firstTrack = 0;
	const preview = (semi, inst = st.inst) => {
		const s = st.song;
		const ins = s?.instruments[inst];
		if (!s || !ins || ins.kind === "empty") return;
		const rate = PAULA_CLOCK / periodOf(semi + ins.transpose + s.transpose, ins.finetune);
		engine.preview(inst, rate).catch((e) => ib.ui.notify(String(e?.message ?? e), "error"));
	};
	const moveLine = (d) => {
		const s = st.song;
		if (!s) return;
		const lines = s.blocks[s.sequence[st.seq]]?.lines ?? 64;
		st.line = Math.max(0, Math.min(lines - 1, st.line + d));
	};
	const moveTrack = (d) => {
		if (st.song) st.track = Math.max(0, Math.min(st.song.tracks - 1, st.track + d));
	};
	return {
		kind: "breakermed",
		key: "breakermed",
		rawKeys: true,
		title: () => st.song ? `♫ ${st.path.split("/").pop()}` : "breakerMED",
		status: () => st.song ? `${t("enter play")} · ⇧enter ${t("block")} · ${t("space stop")} · ${t("keys: a piano")} · alt ↑↓ ${t("octave")} ${st.octave} · alt ←→ ${t("instrument")} ${hex(st.inst + 1)}` : t("med open <file.med|.mod> — or drop one in the vault"),
		render(ui, r, focused) {
			const c = ui.c;
			const s = st.song;
			const now = engine.current();
			if (engine.playing) ui.animate(16);
			if (now) {
				st.seq = now.seq;
				st.line = now.line;
			}
			const name = s ? s.title || st.path.split("/").pop() || "" : "";
			let x = ui.text(r.x + 1, r.y, "breakerMED", {
				fg: c.accent,
				attrs: BOLD
			});
			if (s) x = ui.text(x + 2, r.y, truncate(name, Math.max(4, r.w - 60)), { fg: c.fg }, r.w - 60);
			if (s) {
				const f = s.flags;
				const bpm = ptBpmOf(s.tempoMode, s.tempo, s.lpb, f.eightChannel, f.hardwareMix);
				const right = `${engine.playing ? engine.mode === "block" ? "▶ BLOCK" : "▶ SONG" : "■ STOP"}  ${s.tempoMode === "bpm" ? `${s.tempo} BPM` : s.tempoMode === "spd" ? `SPD ${s.tempo}` : `${s.tempo} BPM`} (${bpm.toFixed(0)})  ${t("speed")} ${hex(s.speed)}  ${s.format}  ${engine.paula ? "PAULA" : "SMOOTH"}`;
				ui.textRight(r.x + r.w - 1, r.y, right, { fg: engine.playing ? c.success : c.muted });
			}
			if (!s) {
				ui.textCenter(r, r.y + Math.floor(r.h / 2) - 1, t("no song loaded"), { fg: c.muted });
				ui.textCenter(r, r.y + Math.floor(r.h / 2) + 1, st.error || "med open <file.med | file.mod>", { fg: st.error ? c.error : c.subtle });
				return;
			}
			const body = {
				x: r.x,
				y: r.y + 1,
				w: r.w,
				h: r.h - 1
			};
			const leftW = Math.min(LEFT, Math.floor(body.w / 3));
			const seqH = Math.max(5, Math.floor(body.h * .45));
			const seqBox = ui.box({
				x: body.x,
				y: body.y,
				w: leftW,
				h: seqH
			}, {
				title: t("SEQUENCE"),
				focused: false
			});
			seqList.items = s.sequence.map((_, i) => i);
			if (seqList.selected !== st.seq) seqList.select(st.seq);
			seqList.render(ui, seqBox, false, (i, row, sel) => {
				const b = s.blocks[s.sequence[i]];
				ui.text(row.x, row.y, `${hex(i)} ${hex(s.sequence[i], 3)} ${b?.name ?? ""}`, {
					fg: sel ? c.accent : c.muted,
					attrs: sel ? BOLD : 0
				}, row.w);
			});
			const instBox = ui.box({
				x: body.x,
				y: body.y + seqH,
				w: leftW,
				h: body.h - seqH
			}, {
				title: t("INSTRUMENTS"),
				focused: false
			});
			instList.items = s.instruments.map((_, i) => i);
			if (instList.selected !== st.inst && st.inst < s.instruments.length) instList.select(st.inst);
			instList.render(ui, instBox, false, (i, row, sel) => {
				const ins = s.instruments[i];
				const empty = ins.kind === "empty";
				const tag = ins.kind === "synth" ? "∿" : ins.kind === "hybrid" ? "≈" : "";
				ui.text(row.x, row.y, `${hex(i + 1)} ${tag}${ins.name || (empty ? "·" : t("(no name)"))}`, {
					fg: sel ? c.accent : empty ? c.faint : c.fg,
					attrs: sel ? BOLD : 0
				}, row.w);
			});
			const blockNo = s.sequence[st.seq] ?? 0;
			const block = s.blocks[blockNo];
			const px = body.x + leftW;
			const inner = ui.box({
				x: px,
				y: body.y,
				w: body.w - leftW,
				h: body.h
			}, {
				title: `${t("BLOCK")} ${hex(blockNo, 3)}${block?.name ? ` · ${block.name}` : ""} · ${t("line")} ${hex(st.line)}/${hex((block?.lines ?? 1) - 1)}`,
				focused
			});
			if (!block) return;
			const cw = cellW(block.pages) + 1;
			const numW = 4;
			const fits = Math.max(1, Math.floor((inner.w - numW) / cw));
			if (st.track < firstTrack) firstTrack = st.track;
			if (st.track >= firstTrack + fits) firstTrack = st.track - fits + 1;
			firstTrack = Math.max(0, Math.min(firstTrack, Math.max(0, s.tracks - fits)));
			const hy = inner.y;
			for (let k = 0; k < fits && firstTrack + k < s.tracks; k++) {
				const tr = firstTrack + k;
				const muted = engine.muted.has(tr);
				const hx = inner.x + numW + k * cw;
				ui.text(hx, hy, `${muted ? "×" : "▪"} ${t("track")} ${tr + 1}`, {
					fg: muted ? c.faint : tr === st.track ? c.accent : c.subtle,
					attrs: tr === st.track ? BOLD : 0
				}, cw - 1);
				ui.hit({
					x: hx,
					y: hy,
					w: cw - 1,
					h: 1
				}, {
					cmd: `med mute ${tr + 1}`,
					tip: t("mute / unmute this track")
				});
			}
			const rows = inner.h - 1;
			const mid = Math.floor(rows / 2);
			for (let k = 0; k < rows; k++) {
				const line = st.line - mid + k;
				const y = inner.y + 1 + k;
				if (line < 0 || line >= block.lines) continue;
				const here = line === st.line;
				const beat = line % Math.max(1, s.lpb) === 0;
				const bg = here ? engine.playing ? mix(c.panel, c.accent, .28) : c.highlight : beat ? c.panelAlt : void 0;
				if (bg !== void 0) ui.fill({
					x: inner.x,
					y,
					w: inner.w,
					h: 1
				}, { bg });
				ui.text(inner.x, y, hex(line, 3), {
					fg: here ? c.accent : beat ? c.muted : c.faint,
					bg
				});
				for (let j = 0; j < fits && firstTrack + j < s.tracks; j++) {
					const tr = firstTrack + j;
					const cell = block.cells[line][tr];
					const cx = inner.x + numW + j * cw;
					const dim = engine.muted.has(tr);
					let xx = ui.text(cx, y, noteName(cell.note), {
						fg: dim ? c.faint : cell.note === 128 ? c.warning : cell.note ? c.fg : c.faint,
						bg,
						attrs: cell.note ? BOLD : 0
					});
					xx = ui.text(xx + 1, y, cell.inst ? hex(cell.inst) : "..", {
						fg: dim ? c.faint : cell.inst ? c.accent : c.faint,
						bg
					});
					for (let p = 0; p < block.pages; p++) {
						const has = cell.cmd[p] || cell.val[p];
						xx = ui.text(xx + 1, y, has ? `${hex(cell.cmd[p])}${hex(cell.val[p])}` : "....", {
							fg: dim ? c.faint : has ? c.accentAlt : c.faint,
							bg
						});
					}
					if (here && tr === st.track && focused) ui.tint({
						x: cx,
						y,
						w: 3,
						h: 1
					}, c.bg, c.accent);
					ui.hit({
						x: cx,
						y,
						w: cw - 1,
						h: 1
					}, {
						onClick: () => (st.line = line, st.track = tr),
						onWheel: (d) => moveLine(Math.sign(d) * 2)
					});
				}
			}
			ui.hit(inner, { onWheel: (d) => moveLine(Math.sign(d) * 2) });
		},
		onKey(k) {
			const s = st.song;
			if (k.key === "enter") return run(k.shift ? `med play block ${st.seq} ${st.line}` : `med play song ${st.seq} ${st.line}`), true;
			if (k.key === "space") return run("med stop"), true;
			if (!s) return false;
			if (k.alt) {
				if (k.key === "up") return st.octave = Math.min(7, st.octave + 1), true;
				if (k.key === "down") return st.octave = Math.max(0, st.octave - 1), true;
				if (k.key === "left") return st.inst = Math.max(0, st.inst - 1), true;
				if (k.key === "right") return st.inst = Math.min(Math.max(0, s.instruments.length - 1), st.inst + 1), true;
				return false;
			}
			switch (k.key) {
				case "up": return moveLine(-1), true;
				case "down": return moveLine(1), true;
				case "pageup": return moveLine(-16), true;
				case "pagedown": return moveLine(16), true;
				case "home": return st.line = 0, true;
				case "end": return moveLine(9999), true;
				case "left": return moveTrack(-1), true;
				case "right": return moveTrack(1), true;
			}
			const semi = pianoKey(k.code);
			if (semi !== null && !k.ctrl && !k.meta) return k.repeat || preview(st.octave * 12 + semi), true;
			return false;
		},
		onAction(a) {
			switch (a) {
				case "up": return moveLine(-1), true;
				case "down": return moveLine(1), true;
				case "left": return moveTrack(-1), true;
				case "right": return moveTrack(1), true;
				case "page-up": return moveLine(-16), true;
				case "page-down": return moveLine(16), true;
				case "confirm": return run(engine.playing ? "med stop" : `med play song ${st.seq} ${st.line}`), true;
			}
			return false;
		}
	};
}
// \0@oxc-project+runtime@0.156.0/helpers/esm/typeof.js
function _typeof(o) {
	"@babel/helpers - typeof";
	return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
		return typeof o;
	} : function(o) {
		return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
	}, _typeof(o);
}
// \0@oxc-project+runtime@0.156.0/helpers/esm/toPrimitive.js
function toPrimitive(t, r) {
	if ("object" != _typeof(t) || !t) return t;
	var e = t[Symbol.toPrimitive];
	if (void 0 !== e) {
		var i = e.call(t, r || "default");
		if ("object" != _typeof(i)) return i;
		throw new TypeError("@@toPrimitive must return a primitive value.");
	}
	return ("string" === r ? String : Number)(t);
}
// \0@oxc-project+runtime@0.156.0/helpers/esm/toPropertyKey.js
function toPropertyKey(t) {
	var i = toPrimitive(t, "string");
	return "symbol" == _typeof(i) ? i : i + "";
}
// \0@oxc-project+runtime@0.156.0/helpers/esm/defineProperty.js
function _defineProperty(e, r, t) {
	return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
		value: t,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[r] = t, e;
}
// modules/breakermed/src/format/bytes.ts
/**
* Reading and writing big-endian files (the Amiga's order), bounds-checked:
* a broken or hostile file throws a clear error, never reads past its end.
*/
var Reader = class {
	constructor(b) {
		_defineProperty(this, "b", void 0);
		_defineProperty(this, "pos", 0);
		this.b = b;
	}
	get length() {
		return this.b.length;
	}
	can(n, at = this.pos) {
		return at >= 0 && n >= 0 && at + n <= this.b.length;
	}
	need(n, at = this.pos, what = "data") {
		if (!this.can(n, at)) throw new Error(`the file ends too early (${what} at ${at})`);
	}
	seek(at) {
		if (at < 0 || at > this.b.length) throw new Error(`a pointer leads out of the file (${at})`);
		this.pos = at;
		return this;
	}
	u8() {
		this.need(1);
		return this.b[this.pos++];
	}
	s8() {
		const v = this.u8();
		return v > 127 ? v - 256 : v;
	}
	u16() {
		this.need(2);
		const v = this.b[this.pos] << 8 | this.b[this.pos + 1];
		this.pos += 2;
		return v;
	}
	s16() {
		const v = this.u16();
		return v > 32767 ? v - 65536 : v;
	}
	u32() {
		this.need(4);
		const v = (this.b[this.pos] << 24 >>> 0) + (this.b[this.pos + 1] << 16) + (this.b[this.pos + 2] << 8) + this.b[this.pos + 3];
		this.pos += 4;
		return v;
	}
	bytes(n) {
		this.need(n);
		const out = this.b.subarray(this.pos, this.pos + n);
		this.pos += n;
		return out;
	}
	/** a fixed-size text field (stops at the first 0), Latin-1 like the Amiga's */
	text(n) {
		const raw = this.bytes(n);
		let s = "";
		for (const c of raw) {
			if (!c) break;
			s += c < 32 ? " " : String.fromCharCode(c);
		}
		return s.trimEnd();
	}
};
/** Signed 8-bit sample bytes → floats. */
function s8ToFloats(raw) {
	const out = new Float32Array(raw.length);
	for (let i = 0; i < raw.length; i++) out[i] = (raw[i] > 127 ? raw[i] - 256 : raw[i]) / 128;
	return out;
}
/** Signed 16-bit big-endian sample bytes → floats. */
function s16beToFloats(raw) {
	const out = new Float32Array(raw.length >> 1);
	for (let i = 0; i < out.length; i++) {
		const v = raw[2 * i] << 8 | raw[2 * i + 1];
		out[i] = (v > 32767 ? v - 65536 : v) / 32768;
	}
	return out;
}
/** OctaMED's "delta" samples: each byte is the difference from the previous one. */
function undelta8(raw) {
	const out = new Uint8Array(raw.length);
	let acc = 0;
	for (let i = 0; i < raw.length; i++) out[i] = acc = acc + raw[i] & 255;
	return out;
}
// modules/breakermed/src/format/med.ts
/**
* OctaMED .med files (MMD0, MMD1, MMD2, MMD3): reading. Writing comes with
* step 3.
*
* The layout is public: Teijo Kinnunen's MED-FORM.TXT describes MMD0 / MMD1,
* and the rest (MMD2's sections and play sequences, MMD3, the command pages,
* the tempo modes, the octave folding of the Amiga's four voices) was checked
* against libopenmpt's reader (Load_med.cpp, BSD-3-Clause, docs/CREDITS.md).
* This is our own code: one structure after the other, every pointer
* checked against the file's length.
*
* Not read yet: packed (ADPCM) samples, MIDI, several songs in one file (the
* first is read), MMD2's play-sequence commands (stop / jump).
*/
function isMed(b) {
	return b.length >= 52 && b[0] === 77 && b[1] === 77 && b[2] === 68 && b[3] >= 48 && b[3] <= 51;
}
function readMed(bytes) {
	if (!isMed(bytes)) throw new Error("not an OctaMED file (no MMD0–MMD3 header)");
	const r = new Reader(bytes);
	r.seek(3);
	const h = {
		version: r.u8() - 48,
		songOffset: 0,
		blockArr: 0,
		sampleArr: 0,
		expData: 0
	};
	r.u32();
	h.songOffset = r.u32();
	r.u32();
	h.blockArr = r.u32();
	r.u32();
	h.sampleArr = r.u32();
	r.u32();
	h.expData = r.u32();
	r.seek(h.songOffset);
	const sampleHeads = Array.from({ length: 63 }, () => ({
		loopStart: r.u16() * 2,
		loopLength: r.u16() * 2,
		midiChannel: r.u8(),
		midiPreset: r.u8(),
		volume: r.u8(),
		transpose: r.s8()
	}));
	const numBlocks = r.u16();
	const songLength = r.u16();
	const songArea = r.pos;
	r.seek(songArea + 256);
	const defaultTempo = r.u16();
	const playTranspose = r.s8();
	const flags = r.u8();
	const flags2 = r.u8();
	const tempo2 = r.u8();
	const trackVol16 = Array.from(r.bytes(16));
	const masterVol = r.u8();
	const numSamples = r.u8();
	if (numSamples > 63 || numBlocks > 32767) throw new Error("not a valid OctaMED song (too many instruments or blocks)");
	const hardwareMix = h.version < 2 || !(flags2 & 128);
	const bpmMode = !!(flags2 & 32);
	const tempoMode = bpmMode ? "bpm" : "spd";
	let sequence = [];
	let tracks = 4;
	let trackVolume = [];
	let trackPan = null;
	if (h.version < 2) {
		r.seek(songArea);
		sequence = Array.from(r.bytes(256)).slice(0, Math.min(256, songLength));
		trackVolume = trackVol16;
	} else {
		r.seek(songArea);
		const playSeqTable = r.u32();
		const sectionTable = r.u32();
		const trackVols = r.u32();
		const numTracks = r.u16();
		const numPlaySeqs = r.u16();
		const trackPanOffset = r.u32();
		const flags3 = r.u32();
		if (numTracks < 1 || numTracks > 64) throw new Error(`not a valid OctaMED song (${numTracks} tracks)`);
		tracks = numTracks;
		if (trackVols && r.can(numTracks, trackVols)) trackVolume = Array.from(r.seek(trackVols).bytes(numTracks));
		if ((!hardwareMix && !!(flags3 & 2) || h.version > 2) && trackPanOffset && r.can(numTracks, trackPanOffset)) {
			r.seek(trackPanOffset);
			trackPan = Array.from({ length: numTracks }, () => Math.max(-16, Math.min(16, r.s8())) / 16);
		}
		if (sectionTable && r.can(songLength * 2, sectionTable)) {
			r.seek(sectionTable);
			const sections = Array.from({ length: songLength }, () => r.u16());
			for (const sec of sections) {
				if (sec >= numPlaySeqs || !r.can(4, playSeqTable + sec * 4)) continue;
				const at = r.seek(playSeqTable + sec * 4).u32();
				if (!r.can(42, at)) continue;
				r.seek(at + 40);
				const length = r.u16();
				for (let i = 0; i < length && r.can(2); i++) {
					const b = r.u16();
					if (b < 32768) sequence.push(b);
				}
			}
		}
	}
	const blocks = [];
	for (let n = 0; n < numBlocks; n++) {
		if (!r.can(4, h.blockArr + n * 4)) break;
		const at = r.seek(h.blockArr + n * 4).u32();
		if (!at || !r.can(2, at)) {
			blocks.push(newBlock(tracks, 64));
			continue;
		}
		r.seek(at);
		if (h.version < 1) {
			const t = r.u8();
			const lines = r.u8() + 1;
			tracks = Math.max(tracks, t);
			const block = newBlock(t, lines, 1);
			for (let l = 0; l < lines; l++) for (let k = 0; k < t; k++) {
				if (!r.can(3)) break;
				const b0 = r.u8(), b1 = r.u8(), b2 = r.u8();
				const c = block.cells[l][k];
				c.note = b0 & 63;
				c.inst = b1 >> 4 | (b0 & 128) >> 3 | (b0 & 64) >> 1;
				c.cmd[0] = b1 & 15;
				c.val[0] = b2;
			}
			blocks.push(block);
			continue;
		}
		const t = r.u16();
		const lines = r.u16() + 1;
		const info = r.u32();
		const cellsAt = r.pos;
		if (t < 1 || t > 64 || lines > 3200) throw new Error(`block ${n}: ${t} tracks × ${lines} lines`);
		tracks = Math.max(tracks, t);
		let name = "";
		let pages = [];
		if (info && r.can(20, info)) {
			r.seek(info);
			r.u32();
			const nameOffset = r.u32();
			const nameLength = r.u32();
			const pageTable = r.u32();
			if (nameOffset && nameLength && r.can(Math.min(nameLength, 255), nameOffset)) name = r.seek(nameOffset).text(Math.min(nameLength, 255));
			if (pageTable && r.can(4, pageTable)) {
				r.seek(pageTable);
				const count = r.u16();
				r.u16();
				for (let i = 0; i < count && r.can(4); i++) pages.push(r.u32());
			}
		}
		pages = pages.slice(0, 15);
		const block = newBlock(t, lines, 1 + pages.length, name);
		r.seek(cellsAt);
		for (let l = 0; l < lines; l++) for (let k = 0; k < t; k++) {
			if (!r.can(4)) break;
			const b0 = r.u8(), b1 = r.u8(), b2 = r.u8(), b3 = r.u8();
			const c = block.cells[l][k];
			c.note = b0 === 128 ? 128 : b0 & 127;
			c.inst = b1 & 63;
			c.cmd[0] = b2;
			c.val[0] = b3;
		}
		pages.forEach((p, i) => {
			if (!p || !r.can(t * lines * 2, p)) return;
			r.seek(p);
			for (let l = 0; l < lines; l++) for (let k = 0; k < t; k++) {
				const c = block.cells[l][k];
				c.cmd[i + 1] = r.u8();
				c.val[i + 1] = r.u8();
			}
		});
		blocks.push(block);
	}
	for (const b of blocks) for (const row of b.cells) while (row.length < tracks) row.push({
		note: 0,
		inst: 0,
		cmd: new Array(b.pages).fill(0),
		val: new Array(b.pages).fill(0)
	});
	const exp = readExp(r, h.expData);
	const instruments = [];
	for (let i = 0; i < numSamples; i++) {
		const head = sampleHeads[i];
		const inst = emptyInstrument();
		inst.volume = Math.min(64, head.volume);
		inst.transpose = head.transpose;
		inst.loopStart = head.loopStart;
		inst.loopLength = head.loopLength > 2 ? head.loopLength : 0;
		const ext = exp.instrExt(i);
		if (ext) {
			inst.hold = ext.hold;
			inst.decay = ext.decay;
			inst.finetune = Math.max(-8, Math.min(7, ext.finetune));
			if (ext.volume !== void 0) inst.gain = (ext.volume + 1) / 128;
		}
		inst.name = exp.instrName(i);
		const at = h.sampleArr && r.can(4, h.sampleArr + i * 4) ? r.seek(h.sampleArr + i * 4).u32() : 0;
		if (at && r.can(6, at)) readInstrumentData(r, at, inst, h.version);
		if (ext && inst.kind === "sample") {
			if (ext.loopLength !== void 0) {
				inst.loopStart = ext.loopStart ?? 0;
				inst.loopLength = ext.loopLength;
			}
			if (ext.flags !== void 0) {
				if (!(ext.flags & 1)) inst.loopLength = 0;
				inst.pingPong = !!(ext.flags & 8);
				if (ext.flags & 4) inst.gain = 0;
			}
		}
		if (inst.loopStart + inst.loopLength > inst.data.length) inst.loopLength = Math.max(0, inst.data.length - inst.loopStart);
		if (inst.loopLength <= 2) inst.loopStart = 0, inst.loopLength = 0;
		instruments.push(inst);
	}
	const song = {
		title: exp.songName,
		format: `MMD${h.version}`,
		tracks,
		blocks,
		sequence: sequence.filter((b) => b < blocks.length),
		restart: 0,
		instruments,
		tempoMode,
		tempo: defaultTempo,
		speed: Math.max(1, Math.min(32, tempo2 || 6)),
		lpb: bpmMode ? 1 + (flags2 & 31) : 4,
		transpose: playTranspose,
		noteShift: h.version > 2 ? -24 : 0,
		masterVolume: masterVol ? Math.min(64, masterVol) : 64,
		trackVolume: Array.from({ length: tracks }, (_, i) => Math.max(0, Math.min(64, trackVolume[i] ?? 64))),
		trackPan: trackPan && trackPan.length === tracks ? trackPan : amigaPan(tracks),
		flags: {
			volHex: !!(flags & 16),
			vol7bit: h.version > 2,
			ptSlides: !!(flags & 32),
			eightChannel: !!(flags & 64),
			hardwareMix,
			filter: !!(flags & 1)
		}
	};
	if (!song.sequence.length) song.sequence = [0];
	if (!song.blocks.length) song.blocks.push(newBlock(tracks));
	return song;
}
/** The expansion data: instrument names and extras, the song's name. */
function readExp(r, at) {
	const out = {
		songName: "",
		instrExt: (_i) => null,
		instrName: (_i) => ""
	};
	if (!at || !r.can(52, at)) return out;
	r.seek(at + 4);
	const extAt = r.u32();
	const extEntries = r.u16();
	const extSize = r.u16();
	r.u32();
	r.u32();
	const infoAt = r.u32();
	const infoEntries = r.u16();
	const infoSize = r.u16();
	r.seek(at + 44);
	const nameAt = r.u32();
	const nameLength = r.u32();
	if (nameAt && nameLength && r.can(Math.min(nameLength, 255), nameAt)) out.songName = r.seek(nameAt).text(Math.min(nameLength, 255));
	out.instrExt = (i) => {
		if (!extAt || i >= extEntries || extSize < 4 || !r.can(extSize, extAt + i * extSize)) return null;
		r.seek(extAt + i * extSize);
		const e = {
			hold: r.u8(),
			decay: r.u8(),
			finetune: (r.u8(), r.s8())
		};
		if (extSize > 5) {
			r.u8();
			e.flags = r.u8();
		}
		if (extSize >= 18) {
			r.seek(extAt + i * extSize + 10);
			e.loopStart = r.u32();
			e.loopLength = r.u32();
		}
		if (extSize >= 19) e.volume = r.u8();
		return e;
	};
	out.instrName = (i) => infoAt && i < infoEntries && infoSize > 0 && r.can(Math.min(40, infoSize), infoAt + i * infoSize) ? r.seek(infoAt + i * infoSize).text(Math.min(40, infoSize)) : "";
	return out;
}
/** An instrument's sound: a sample (8 / 16 bits, mono / stereo, delta, several octaves), a synth or a hybrid. */
function readInstrumentData(r, at, inst, version) {
	r.seek(at);
	const length = r.u32();
	const type = r.s16();
	if (type === -1 || type === -2) {
		if (!r.can(272)) return;
		r.u32();
		const loopStart = r.u16() * 2;
		const loopLength = r.u16() * 2;
		const volLen = Math.min(128, r.u16());
		const waveLen = Math.min(128, r.u16());
		inst.volSpeed = r.u8();
		inst.waveSpeed = r.u8();
		const numWaves = r.u16();
		const volTable = Array.from(r.bytes(128));
		const waveTable = Array.from(r.bytes(128));
		inst.volTable = volTable.slice(0, volLen);
		inst.waveTable = waveTable.slice(0, waveLen);
		if (numWaves > 64) return;
		const offsets = Array.from({ length: numWaves }, () => r.can(4) ? r.u32() : 0);
		inst.waves = [];
		offsets.forEach((o, i) => {
			if (o <= 278 || !r.can(2, at + o)) return void inst.waves.push(/* @__PURE__ */ new Float32Array(0));
			r.seek(at + o);
			if (type === -2 && i === 0) {
				const len = r.u32();
				r.s16();
				inst.waves.push(r.can(len) ? s8ToFloats(r.bytes(len)) : /* @__PURE__ */ new Float32Array(0));
			} else {
				const len = r.u16() * 2;
				inst.waves.push(r.can(len) ? s8ToFloats(r.bytes(len)) : /* @__PURE__ */ new Float32Array(0));
			}
		});
		inst.kind = type === -1 ? "synth" : "hybrid";
		const first = inst.waves[0] ?? /* @__PURE__ */ new Float32Array(0);
		inst.data = first;
		if (type === -1) {
			inst.loopStart = 0;
			inst.loopLength = first.length;
			if (version <= 2) inst.transpose -= 24;
		} else if (loopLength > 2) {
			inst.loopStart = loopStart;
			inst.loopLength = loopLength;
		}
		return;
	}
	if (type < 0 || type & 128) return;
	const octaves = [
		1,
		5,
		3,
		2,
		4,
		6,
		7,
		1
	][type & 15] ?? 1;
	const bits16 = !!(type & 16);
	const stereo = !!(type & 32);
	const delta = !!(type & 64);
	const total = stereo ? length * 2 : length;
	if (!r.can(total)) return;
	let raw = r.bytes(total);
	if (delta && !bits16) raw = undelta8(raw);
	const decode = (b) => bits16 ? s16beToFloats(b) : s8ToFloats(b);
	let left = decode(stereo ? raw.subarray(0, length) : raw);
	inst.right = stereo ? decode(raw.subarray(length)) : void 0;
	if (octaves > 1) {
		const first = Math.floor(left.length / ((1 << octaves) - 1));
		const start = first * ((1 << octaves - 1) - 1);
		left = left.slice(start, start + first * (1 << octaves - 1));
		inst.loopStart *= 1 << octaves - 1;
		inst.loopLength *= 1 << octaves - 1;
		if (octaves >= 5) inst.transpose += 12;
	}
	inst.data = left;
	inst.bits16 = bits16;
	inst.kind = left.length ? "sample" : "empty";
}
// modules/breakermed/src/format/mod.ts
/**
* ProTracker .mod files: reading (writing comes with step 3). The format is the
* well-known public one: a title, 31 instruments, the order list, a tag
* ("M.K.", "6CHN", "8CHN"…), patterns of 64 lines × 4 bytes a cell, the samples.
* A file without a tag is read as an old 15-instrument SoundTracker module.
*
* Effects are translated into OctaMED's numbering (song.ts), the way OctaMED
* itself reads a .mod: 4 → 14 (ProTracker's vibrato depth), D → 1D (the line in
* hex), Ex → 11/12/15/16/18/1A/1B/1E/1F, F → 09 (speed) or 0F (BPM).
*/
var TAGS4 = /* @__PURE__ */ new Set([
	"M.K.",
	"M!K!",
	"M&K!",
	"FLT4",
	"4CHN",
	"N.T."
]);
/** The tracks a tag means (0: not a tag we know). */
function tracksOfTag(tag) {
	if (TAGS4.has(tag)) return 4;
	if (tag === "FLT8" || tag === "OCTA" || tag === "CD81") return 8;
	let m = /^(\d)CHN$/.exec(tag);
	if (m) return +m[1];
	m = /^(\d\d)C[HN]$/.exec(tag);
	if (m) return +m[1];
	return 0;
}
/** Does it look like a .mod (31 instruments and a tag)? */
function isMod(b) {
	if (b.length < 1084) return false;
	return tracksOfTag(String.fromCharCode(b[1080], b[1081], b[1082], b[1083])) > 0;
}
function readMod(bytes) {
	const r = new Reader(bytes);
	if (bytes.length < 600) throw new Error("too short for a .mod");
	const tag = bytes.length >= 1084 ? String.fromCharCode(bytes[1080], bytes[1081], bytes[1082], bytes[1083]) : "";
	let tracks = tracksOfTag(tag);
	const old = tracks === 0;
	if (old) tracks = 4;
	const numInst = old ? 15 : 31;
	const title = r.text(20);
	const heads = [];
	for (let i = 0; i < numInst; i++) {
		const inst = emptyInstrument();
		inst.name = r.text(22);
		const len = r.u16() * 2;
		const ft = r.u8() & 15;
		inst.finetune = ft > 7 ? ft - 16 : ft;
		inst.volume = Math.min(64, r.u8());
		let ls = r.u16() * 2;
		const ll = r.u16() * 2;
		if (old) ls >>= 1;
		if (ll > 2) {
			inst.loopStart = ls;
			inst.loopLength = ll;
		}
		heads.push({
			inst,
			bytes: len
		});
	}
	const songLength = Math.max(1, Math.min(128, r.u8()));
	let restart = r.u8();
	const orders = Array.from(r.bytes(128));
	if (!old) r.u32();
	const used = orders.slice(0, songLength);
	const numPat = Math.max(...orders.filter((o) => o < 128)) + 1;
	if (restart >= songLength || restart === 127) restart = 0;
	const song = {
		title,
		format: old ? "MOD 15" : `MOD ${tag}`,
		tracks,
		blocks: [],
		sequence: used,
		restart,
		instruments: [],
		tempoMode: "pt",
		tempo: 125,
		speed: 6,
		lpb: 4,
		transpose: 0,
		noteShift: 0,
		masterVolume: 64,
		trackVolume: new Array(tracks).fill(64),
		trackPan: amigaPan(tracks),
		flags: {
			volHex: true,
			vol7bit: false,
			ptSlides: true,
			eightChannel: false,
			hardwareMix: true,
			filter: false
		}
	};
	for (let p = 0; p < numPat; p++) {
		const block = newBlock(tracks, 64, 1);
		for (let line = 0; line < 64; line++) for (let t = 0; t < tracks; t++) {
			if (!r.can(4)) break;
			const a = r.u8(), b = r.u8(), c = r.u8(), d = r.u8();
			const period = (a & 15) << 8 | b;
			const cell = block.cells[line][t];
			cell.inst = a & 240 | c >> 4;
			if (cell.inst > 63) cell.inst = 0;
			if (period) cell.note = Math.max(1, semiOfPeriod(period) + 1);
			const [cmd, val] = modToMed(c & 15, d);
			cell.cmd[0] = cmd;
			cell.val[0] = val;
		}
		song.blocks.push(block);
	}
	for (const h of heads) {
		const n = Math.min(h.bytes, Math.max(0, bytes.length - r.pos));
		if (n > 0) {
			h.inst.data = s8ToFloats(r.bytes(n));
			h.inst.kind = "sample";
		}
		if (h.inst.loopStart + h.inst.loopLength > h.inst.data.length) {
			h.inst.loopLength = Math.max(0, h.inst.data.length - h.inst.loopStart);
			if (h.inst.loopLength <= 2) h.inst.loopStart = 0, h.inst.loopLength = 0;
		}
		song.instruments.push(h.inst);
	}
	while (song.instruments.length && song.instruments[song.instruments.length - 1].kind === "empty") song.instruments.pop();
	return song;
}
/** A ProTracker effect as an OctaMED command. Returns [0, 0] for what has none. */
function modToMed(e, p) {
	switch (e) {
		case 0: return p ? [0, p] : [0, 0];
		case 4: return [20, p];
		case 8: return [0, 0];
		case 9: return [25, p];
		case 13: return [29, Math.min(63, (p >> 4) * 10 + (p & 15))];
		case 14: {
			const x = p >> 4, y = p & 15;
			switch (x) {
				case 0: return [15, y ? 248 : 249];
				case 1: return [17, y];
				case 2: return [18, y];
				case 5: return [21, y];
				case 6: return [22, y];
				case 9: return [31, y];
				case 10: return [26, y];
				case 11: return [27, y];
				case 12: return [24, y];
				case 13: return [31, y << 4];
				case 14: return [30, y];
				default: return [0, 0];
			}
		}
		case 15:
			if (p === 0) return [15, 254];
			return p < 32 ? [9, p] : [15, p];
		default: return [e, p];
	}
}
// modules/breakermed/src/format/index.ts
/** the names songs have: "x.med", "x.mod", and the Amiga's way: "mod.x", "med.x" */
var SONG_EXTS = [
	".med",
	".mod",
	".mmd0",
	".mmd1",
	".mmd2",
	".mmd3"
];
function readSong(bytes, name = "") {
	if (isMed(bytes)) return readMed(bytes);
	if (isMod(bytes) || /\.mod$|(^|\/)mod\./i.test(name)) return readMod(bytes);
	throw new Error("not a .med (MMD0–MMD3) or .mod file");
}
// modules/breakermed/src/replayer.ts
/**
* breakerMED — the replayer: it reads a song tick by tick, the way OctaMED and
* ProTracker do, and says what each voice does (start this instrument, at
* this speed, this loud, there). No sound and no clock here: `step()` gives
* one tick and how long it lasts; engine.ts dates those and sends them to the
* deck's sampler (ib.audio). So it runs the same in a test.
*
* A line is `speed` ticks. On a line's first tick the notes start and the
* one-off commands act; the slides, vibratos and arpeggios move on the other
* ticks (on every tick, the first too, in OctaMED's own slide mode).
*
* Commands, in OctaMED's numbering (hex):
*   00 arpeggio · 01/02 slide up/down · 03 slide to note · 04 vibrato (twice
*   ProTracker's depth) · 05 03 + volume slide · 06 04 + volume slide · 07 tremolo ·
*   09 speed (ticks a line) · 0A / 0D volume slide · 0B jump to a position ·
*   0C volume · 0F tempo, 0F00 next block, 0FF1 note twice, 0FF2 half a line
*   late, 0FF3 three times, 0FF8/9 filter, 0FFE stop, 0FFF note off ·
*   11/12 fine slide · 14 vibrato (ProTracker's) · 15 finetune · 16 loop ·
*   18 cut the note · 19 sample offset · 1A/1B fine volume · 1D next block at a
*   line · 1E repeat the line · 1F note delay / retrigger · 2E pan.
* Not yet: 08 hold/decay (the instrument's own hold/decay works), 0E synth jump,
* 20 reverse, the synth instruments' programs, MIDI.
*/
var SINE = [
	0,
	24,
	49,
	74,
	97,
	120,
	141,
	161,
	180,
	197,
	212,
	224,
	235,
	244,
	250,
	253,
	255,
	253,
	250,
	244,
	235,
	224,
	212,
	197,
	180,
	161,
	141,
	120,
	97,
	74,
	49,
	24
];
var Player = class {
	constructor(song, opts = {}) {
		_defineProperty(this, "song", void 0);
		_defineProperty(this, "opts", void 0);
		_defineProperty(this, "seq", 0);
		_defineProperty(this, "line", 0);
		_defineProperty(this, "tick", 0);
		_defineProperty(this, "speed", void 0);
		_defineProperty(this, "tempo", void 0);
		_defineProperty(
			this,
			/** a tempo OctaMED's 0F01 / 0F02 set (as ProTracker BPM), else null */
			"bpmOverride",
			null
		);
		_defineProperty(this, "chans", void 0);
		_defineProperty(this, "delayLines", 0);
		_defineProperty(this, "breakTo", null);
		_defineProperty(this, "jumpTo", null);
		_defineProperty(this, "stopped", false);
		_defineProperty(this, "mix", void 0);
		this.song = song;
		this.opts = opts;
		this.speed = song.speed;
		this.tempo = song.tempo;
		this.chans = Array.from({ length: song.tracks }, (_, i) => this.newChan(i));
		this.mix = .5 * Math.min(1, 2 / Math.sqrt(Math.max(4, song.tracks)));
	}
	newChan(i) {
		return {
			inst: 0,
			semi: 0,
			period: 0,
			target: 0,
			portaSpeed: 0,
			volume: 64,
			finetune: 0,
			vibPos: 0,
			vibSpeed: 0,
			vibDepth: 0,
			vibShift: 7,
			tremPos: 0,
			tremSpeed: 0,
			tremDepth: 0,
			pan: this.song.trackPan[i] ?? 0,
			offsetMem: 0,
			delayed: null,
			cutAt: -1,
			retrig: 0,
			loopLine: 0,
			loopCount: 0,
			age: 0,
			on: false,
			sent: {
				rate: -1,
				volume: -1,
				pan: -2
			}
		};
	}
	/** Start (again) from a position. */
	jump(seq, line = 0) {
		this.seq = Math.max(0, Math.min(this.song.sequence.length - 1, seq));
		this.line = line;
		this.tick = 0;
		this.delayLines = 0;
		this.breakTo = this.jumpTo = null;
		this.stopped = false;
	}
	get block() {
		return this.song.sequence[this.seq] ?? 0;
	}
	get tickSeconds() {
		const f = this.song.flags;
		return 2.5 / (this.bpmOverride ?? ptBpmOf(this.song.tempoMode, this.tempo, this.song.lpb, f.eightChannel, f.hardwareMix));
	}
	/** Silence everything (the events to send). */
	silence() {
		return this.chans.map((c, voice) => (c.on = false, c.sent = {
			rate: -1,
			volume: -1,
			pan: -2
		}, {
			voice,
			stop: true
		}));
	}
	/** One tick: what the voices do, and how long it lasts. */
	step() {
		const out = {
			seconds: this.tickSeconds,
			events: []
		};
		if (this.stopped) return {
			...out,
			ended: true
		};
		const triggers = /* @__PURE__ */ new Map();
		if (this.tick === 0 && this.delayLines === 0) {
			out.line = {
				seq: this.seq,
				block: this.block,
				line: this.line
			};
			this.readLine(triggers);
		} else this.effects(triggers);
		this.voices(out.events, triggers);
		out.seconds = this.tickSeconds;
		if (++this.tick >= this.speed) {
			this.tick = 0;
			if (this.delayLines > 0) this.delayLines--;
			if (this.delayLines === 0) this.advance(out);
		}
		if (this.stopped) out.ended = true;
		return out;
	}
	cells() {
		return this.song.blocks[this.block]?.cells[this.line] ?? [];
	}
	inst(c) {
		return this.song.instruments[c.inst - 1];
	}
	/** a note number → the semitone it plays (0 = C-1), the Amiga's octave folding included */
	semiOf(note, inst) {
		let s = note - 1 + this.song.transpose + this.song.noteShift + (inst?.transpose ?? 0);
		if (this.song.format.startsWith("MMD")) {
			const top = this.song.flags.hardwareMix ? 36 : 48;
			if (s >= top) s -= Math.floor((s - top + 12) / 12) * 12;
		}
		return s;
	}
	readLine(triggers) {
		const f = this.song.flags;
		this.cells().forEach((cell, t) => {
			const c = this.chans[t];
			if (!c) return;
			c.cutAt = -1;
			c.retrig = 0;
			let porta = false;
			let delay = 0;
			for (let p = 0; p < cell.cmd.length; p++) {
				const cmd = cell.cmd[p], v = cell.val[p];
				if (cmd === 3 || cmd === 5) porta = true;
				if (cmd === 31 && v >> 4) delay = v >> 4;
				if (cmd === 15 && v === 242) delay = this.speed >> 1;
			}
			if (delay && delay < this.speed && (cell.note || cell.inst)) c.delayed = {
				tick: delay,
				note: cell.note,
				inst: cell.inst,
				porta
			};
			else this.noteOn(c, t, cell.note, cell.inst, porta, triggers);
			for (let p = 0; p < cell.cmd.length; p++) this.lineCommand(c, t, cell.cmd[p], cell.val[p], !!cell.note, triggers);
			if (!f.ptSlides) this.slides(c, cell.cmd, cell.val, true);
		});
	}
	noteOn(c, t, note, instNo, porta, triggers) {
		if (instNo) {
			c.inst = instNo;
			const inst = this.inst(c);
			c.volume = inst?.volume ?? 64;
			c.finetune = inst?.finetune ?? 0;
		}
		if (note === 128) {
			c.on = false;
			triggers.set(t, -1);
			return;
		}
		if (!note) return;
		const inst = this.inst(c);
		const semi = this.semiOf(note, inst);
		const period = periodOf(semi, c.finetune);
		if (porta && c.on) {
			c.target = period;
			return;
		}
		c.semi = semi;
		c.period = c.target = period;
		c.vibPos = c.tremPos = 0;
		c.age = 0;
		if (inst && inst.kind !== "empty" && inst.data.length) {
			c.on = true;
			triggers.set(t, 0);
		} else {
			c.on = false;
			triggers.set(t, -1);
		}
	}
	lineCommand(c, t, cmd, v, hasNote, triggers) {
		const f = this.song.flags;
		switch (cmd) {
			case 3:
				if (v) c.portaSpeed = v;
				break;
			case 4:
				if (v >> 4) c.vibSpeed = v >> 4;
				if (v & 15) c.vibDepth = v & 15;
				c.vibShift = 6;
				break;
			case 20:
				if (v >> 4) c.vibSpeed = v >> 4;
				if (v & 15) c.vibDepth = v & 15;
				c.vibShift = 7;
				break;
			case 7:
				if (v >> 4) c.tremSpeed = v >> 4;
				if (v & 15) c.tremDepth = v & 15;
				break;
			case 9:
				if (v > 0 && v <= 32) this.speed = v;
				break;
			case 11:
				this.jumpTo = v;
				this.breakTo ??= 0;
				break;
			case 12: {
				let vol;
				if (f.vol7bit) vol = (v & 127) + 1 >> 1;
				else if (f.volHex) vol = Math.min(64, v & 127);
				else vol = v < 153 ? (v >> 4) * 10 + (v & 15) : 64;
				c.volume = Math.min(64, vol);
				break;
			}
			case 15:
				this.cmd0F(c, t, v, triggers);
				break;
			case 17:
				c.period = this.clampPeriod(c.period - (v & 15));
				break;
			case 18:
				c.period = this.clampPeriod(c.period + (v & 15));
				break;
			case 21:
				c.finetune = (v & 15) > 7 ? (v & 15) - 16 : v & 15;
				break;
			case 22:
				if ((v & 15) === 0) c.loopLine = this.line;
				else if (c.loopCount === 0) {
					c.loopCount = v & 15;
					this.breakTo = c.loopLine;
					this.jumpTo = -1;
				} else if (--c.loopCount > 0) {
					this.breakTo = c.loopLine;
					this.jumpTo = -1;
				}
				break;
			case 24:
				c.cutAt = Math.min(15, v);
				if (c.cutAt === 0) c.volume = 0;
				break;
			case 25:
				if (v) c.offsetMem = v * 256;
				if (hasNote && triggers.get(t) === 0) triggers.set(t, c.offsetMem);
				break;
			case 26:
				c.volume = Math.min(64, c.volume + (v & 15));
				break;
			case 27:
				c.volume = Math.max(0, c.volume - (v & 15));
				break;
			case 29:
				this.breakTo = v;
				break;
			case 30:
				if (this.delayLines === 0 && v) this.delayLines = Math.min(15, v) + 1;
				break;
			case 31:
				c.retrig = v & 15;
				break;
			case 46: {
				const s = v > 127 ? v - 256 : v;
				if (s >= -16 && s <= 16) c.pan = s / 16;
				break;
			}
		}
	}
	cmd0F(c, t, v, triggers) {
		if (v === 0) this.breakTo = 0;
		else if (v <= 240) {
			if (this.song.tempoMode === "pt") {
				if (v >= 32) this.tempo = v;
			} else if (v < 3) this.bpmOverride = 112;
			else {
				this.tempo = v;
				this.bpmOverride = null;
			}
		} else if (v === 241) c.retrig = Math.max(1, this.speed >> 1);
		else if (v === 243) c.retrig = Math.max(1, Math.floor(this.speed / 3));
		else if (v === 248) this.song.flags.filter = false;
		else if (v === 249) this.song.flags.filter = true;
		else if (v === 254) this.stopped = true;
		else if (v === 255) {
			c.on = false;
			triggers.set(t, -1);
		}
	}
	/** the ticks after the first: slides, vibrato, arpeggio, retrigger, cut, delayed notes */
	effects(triggers) {
		this.cells().forEach((cell, t) => {
			const c = this.chans[t];
			if (!c) return;
			if (c.delayed && c.delayed.tick === this.tick) {
				const d = c.delayed;
				c.delayed = null;
				this.noteOn(c, t, d.note, d.inst, d.porta, triggers);
			}
			if (c.cutAt === this.tick) c.volume = 0;
			if (c.retrig && this.tick % c.retrig === 0 && c.on) {
				c.age = 0;
				triggers.set(t, 0);
			}
			this.slides(c, cell.cmd, cell.val, false);
		});
	}
	/** slides on this tick (`first`: OctaMED's own mode also slides on a line's first tick) */
	slides(c, cmds, vals, first) {
		for (let p = 0; p < cmds.length; p++) {
			const cmd = cmds[p], v = vals[p];
			switch (cmd) {
				case 1:
					c.period = this.clampPeriod(c.period - v);
					break;
				case 2:
					c.period = this.clampPeriod(c.period + v);
					break;
				case 3:
					this.toward(c);
					break;
				case 5:
					this.toward(c);
					this.volSlide(c, v);
					break;
				case 6:
					if (!first) this.vibrato(c);
					this.volSlide(c, v);
					break;
				case 10:
				case 13:
					this.volSlide(c, v);
					break;
				case 4:
				case 20:
					if (!first) this.vibrato(c);
					break;
				case 7: if (!first) c.tremPos = c.tremPos + c.tremSpeed & 63;
			}
		}
	}
	toward(c) {
		if (!c.target || !c.portaSpeed) return;
		if (c.period < c.target) c.period = Math.min(c.target, c.period + c.portaSpeed);
		else if (c.period > c.target) c.period = Math.max(c.target, c.period - c.portaSpeed);
	}
	volSlide(c, v) {
		if (v >> 4) c.volume = Math.min(64, c.volume + (v >> 4));
		else c.volume = Math.max(0, c.volume - (v & 15));
	}
	vibrato(c) {
		c.vibPos = c.vibPos + c.vibSpeed & 63;
	}
	clampPeriod(p) {
		return this.song.tempoMode === "pt" ? Math.max(113, Math.min(856, p)) : Math.max(28, Math.min(6848, p));
	}
	/** what each voice plays now, as events (only what changed) */
	voices(events, triggers) {
		const s = this.song;
		this.chans.forEach((c, voice) => {
			const trig = triggers.get(voice);
			const muted = this.opts.muted?.has(voice);
			if (trig === -1 || !c.on && c.sent.volume !== 0 && c.sent.volume !== -1) {
				events.push({
					voice,
					stop: true
				});
				c.sent = {
					rate: -1,
					volume: 0,
					pan: -2
				};
				return;
			}
			if (!c.on) return;
			const inst = this.inst(c);
			if (!inst) return;
			let period = c.period;
			for (const [cmd, v] of this.cellCmds(voice)) {
				if (cmd === 0 && v) {
					const k = this.tick % 3;
					if (k) period = periodOf(c.semi + (k === 1 ? v >> 4 : v & 15), c.finetune);
				}
				if ((cmd === 4 || cmd === 20 || cmd === 6) && c.vibDepth) period += SINE[c.vibPos & 31] * (c.vibPos & 32 ? -1 : 1) * c.vibDepth >> c.vibShift;
			}
			let vol = c.volume;
			if (this.cellCmds(voice).some(([cmd]) => cmd === 7) && c.tremDepth) vol = Math.max(0, Math.min(64, vol + (SINE[c.tremPos & 31] * (c.tremPos & 32 ? -1 : 1) * c.tremDepth >> 6)));
			let env = 1;
			if (inst.hold > 0) {
				if (c.age >= inst.hold) env = inst.decay ? Math.max(0, 1 - (c.age - inst.hold + 1) * inst.decay / 64) : 0;
			}
			c.age++;
			const rate = PAULA_CLOCK / Math.max(1, period);
			const volume = muted ? 0 : vol / 64 * env * inst.gain * ((s.trackVolume[voice] ?? 64) / 64) * (s.masterVolume / 64) * this.mix;
			const ev = { voice };
			let any = false;
			if (trig !== void 0 && trig >= 0) {
				ev.play = c.inst - 1;
				ev.offset = trig;
				any = true;
			}
			if (any || Math.abs(rate - c.sent.rate) > 1e-6) ev.rate = rate, any = true;
			if (any || Math.abs(volume - c.sent.volume) > 1e-6) ev.volume = volume, any = true;
			if (any || c.pan !== c.sent.pan) ev.pan = c.pan, any = true;
			if (any) {
				events.push(ev);
				c.sent = {
					rate,
					volume,
					pan: c.pan
				};
			}
		});
	}
	cellCmds(t) {
		const cell = this.cells()[t];
		if (!cell) return [];
		return cell.cmd.map((cmd, i) => [cmd, cell.val[i]]);
	}
	/** after a line: the next one (breaks, jumps, loops, the block's end, the song's end) */
	advance(out) {
		const seqLen = this.song.sequence.length;
		const lines = this.song.blocks[this.block]?.lines ?? 64;
		if (this.opts.loopBlock) {
			if (this.jumpTo === -1 && this.breakTo !== null) this.line = this.breakTo;
			else if (this.breakTo !== null || this.jumpTo !== null) this.line = 0;
			else this.line = (this.line + 1) % lines;
		} else if (this.jumpTo === -1 && this.breakTo !== null) this.line = this.breakTo;
		else if (this.jumpTo !== null && this.jumpTo >= 0) {
			if (this.jumpTo <= this.seq) out.wrapped = true;
			this.seq = this.jumpTo < seqLen ? this.jumpTo : 0;
			this.line = this.breakTo ?? 0;
		} else if (this.breakTo !== null) {
			this.next(out);
			this.line = this.breakTo;
		} else if (++this.line >= lines) {
			this.next(out);
			this.line = 0;
		}
		const now = this.song.blocks[this.block]?.lines ?? 64;
		if (this.line >= now) this.line = 0;
		this.breakTo = this.jumpTo = null;
	}
	next(out) {
		if (++this.seq >= this.song.sequence.length) {
			this.seq = Math.min(this.song.restart, this.song.sequence.length - 1);
			out.wrapped = true;
		}
	}
};
/** How long the song lasts once through (seconds), and its lines — by playing it silently. */
function songLength(song, maxSeconds = 3600) {
	const p = new Player(song);
	let seconds = 0;
	let lines = 0;
	while (seconds < maxSeconds) {
		const t = p.step();
		if (t.line) lines++;
		seconds += t.seconds;
		if (t.wrapped || t.ended) break;
	}
	return {
		seconds,
		lines
	};
}
// modules/breakermed/src/commands.ts
var EFFECTS = [
	["00xy", "arpeggio: the note, +x, +y semitones"],
	["01xx / 02xx", "slide the pitch up / down"],
	["03xx", "slide to the note (xx: speed)"],
	["04xy", "vibrato (x speed, y depth, twice ProTracker's)"],
	["05xy / 06xy", "03 / 04 going on, with a volume slide"],
	["07xy", "tremolo"],
	["09xx", "speed: ticks a line (01–20)"],
	["0Axy / 0Dxy", "volume slide (x up, y down)"],
	["0Bxx", "jump to position xx"],
	["0Cxx", "volume (decimal 00–64, or hex in hex mode)"],
	["0Fxx", "tempo · 0F00 next block · F1 note twice · F2 half a line late · F3 three times · FE stop · FF note off"],
	["11x / 12x", "fine slide up / down"],
	["14xy", "vibrato, ProTracker's depth"],
	["15x", "finetune (-8…7)"],
	["16x", "loop: 1600 marks, 16x plays x more times"],
	["18x", "cut the note at tick x"],
	["19xx", "start xx × 256 frames into the sample"],
	["1Ax / 1Bx", "fine volume up / down"],
	["1Dxx", "next block, at line xx"],
	["1Ex", "play the line x more times"],
	["1Fxy", "note x ticks late · y: again every y ticks"],
	["2Exx", "pan (F0 left … 00 middle … 10 right)"]
];
function registerCommands(ib, engine, st) {
	const { fmt, parseFlags } = ib.lib;
	const find = async (dir = "", depth = 0, out = []) => {
		if (depth > 5 || out.length > 500) return out;
		for (const e of await ib.vault.list(dir).catch(() => [])) if (e.isDir) {
			if (!e.name.startsWith(".")) await find(e.path, depth + 1, out);
		} else if (SONG_EXTS.some((x) => e.name.toLowerCase().endsWith(x) || e.name.toLowerCase().startsWith(x.slice(1) + "."))) out.push(e.path);
		return out;
	};
	const open = async (ctx, path) => {
		const song = readSong(await ib.vault.readBytes(path), path);
		st.song = song;
		st.path = path;
		st.seq = st.line = st.track = 0;
		st.inst = Math.max(0, song.instruments.findIndex((i) => i.kind !== "empty"));
		st.error = "";
		await engine.load(song);
		const len = songLength(song);
		ctx.out(`${fmt.green("♫")} ${song.title || path} · ${song.format} · ${song.tracks} tracks · ${song.blocks.length} blocks · ${song.sequence.length} positions · ${song.instruments.filter((i) => i.kind !== "empty").length} instruments · ${Math.floor(len.seconds / 60)}:${String(Math.floor(len.seconds % 60)).padStart(2, "0")}\n`);
		await ib.storage.set("last", path);
	};
	const need = () => {
		if (!st.song) throw new Error("no song loaded (med open <file>)");
		return st.song;
	};
	ib.commands.register({
		name: "med",
		summary: "breakerMED: a tracker for .med (OctaMED) and .mod (ProTracker) songs",
		usage: [
			"med                        what's loaded, where it is",
			"med open [file]            a .med / .mod of the vault (no file: choose one)",
			"med ls                     the songs in the vault",
			"med play [song|block] [position] [line]",
			"med stop",
			"med pos <position> [line]  move the cursor (and where play starts)",
			"med mute <track> · med solo <track>   (again: back)",
			"med paula on|off           stepped like the Amiga (on), or smooth",
			"med effects                every command (00–2E) in one line each",
			"med info                   the song's settings"
		].join("\n"),
		examples: [
			["med open songs/axel.mod", "load a song"],
			["med play", "play from the cursor"],
			["med play block", "play this block again and again"],
			"med mute 2",
			"med effects"
		],
		complete: () => [
			"open",
			"ls",
			"play",
			"stop",
			"pos",
			"mute",
			"solo",
			"paula",
			"effects",
			"info",
			"song",
			"block",
			"on",
			"off"
		],
		async run(ctx) {
			const { rest: positional } = parseFlags(ctx.args);
			const [sub = "", ...rest] = positional;
			try {
				switch (sub) {
					case "": {
						if (!st.song) return ctx.out(`${fmt.dim("no song loaded")} · med open <file> · med ls\n`), 0;
						const s = st.song;
						ctx.out(`♫ ${s.title || st.path} (${st.path})\n  ${engine.playing ? fmt.green(`playing (${engine.mode})`) : "stopped"} · position ${hex(st.seq)} · block ${hex(s.sequence[st.seq] ?? 0, 3)} · line ${hex(st.line)}\n`);
						return 0;
					}
					case "ls": {
						const songs = await find();
						ctx.out(songs.length ? songs.join("\n") + "\n" : fmt.dim("no .med / .mod in the vault (drop one in it)\n"));
						return 0;
					}
					case "open": {
						let path = rest.join(" ");
						if (!path) {
							const songs = await find();
							if (!songs.length) return ctx.err("no .med / .mod in the vault (drop one in it)\n"), 1;
							const i = await ib.ui.choose("OPEN A SONG", songs.map((p) => ({ label: p })));
							if (i === null) return 1;
							path = songs[i];
						}
						await open(ctx, ctx.resolve(path));
						ib.apps.open("breakermed");
						return 0;
					}
					case "play": {
						const s = need();
						const mode = rest[0] === "block" ? "block" : "song";
						const nums = rest.filter((x) => /^[0-9a-f]+$/i.test(x) && x !== "block");
						const seq = nums[0] !== void 0 ? parseInt(nums[0], 16) : st.seq;
						const line = nums[1] !== void 0 ? parseInt(nums[1], 16) : nums[0] !== void 0 ? 0 : st.line;
						if (seq >= s.sequence.length) return ctx.err(`med: position ${hex(seq)} isn't in the sequence (0–${hex(s.sequence.length - 1)})\n`), 1;
						st.seq = seq;
						st.line = line;
						await engine.play(mode, {
							seq,
							line
						});
						return 0;
					}
					case "stop":
						engine.stop();
						return 0;
					case "pos": {
						const s = need();
						const seq = parseInt(rest[0] ?? "0", 16);
						if (!(seq >= 0 && seq < s.sequence.length)) return ctx.err(`med: position 0–${hex(s.sequence.length - 1)}\n`), 1;
						st.seq = seq;
						st.line = rest[1] ? parseInt(rest[1], 16) || 0 : 0;
						if (engine.playing) await engine.play(engine.mode ?? "song", {
							seq: st.seq,
							line: st.line
						});
						return 0;
					}
					case "mute":
					case "solo": {
						const s = need();
						const tr = parseInt(rest[0] ?? "", 10) - 1;
						if (!(tr >= 0 && tr < s.tracks)) return ctx.err(`med: a track is 1–${s.tracks}\n`), 1;
						if (sub === "mute") engine.muted.has(tr) ? engine.muted.delete(tr) : engine.muted.add(tr);
						else {
							const alone = engine.muted.size === s.tracks - 1 && !engine.muted.has(tr);
							engine.muted.clear();
							if (!alone) {
								for (let i = 0; i < s.tracks; i++) if (i !== tr) engine.muted.add(i);
							}
						}
						ctx.out(engine.muted.size ? `muted: ${[...engine.muted].map((x) => x + 1).sort((a, b) => a - b).join(" ")}\n` : "every track plays\n");
						return 0;
					}
					case "paula":
						engine.paula = rest[0] === "on" ? true : rest[0] === "off" ? false : !engine.paula;
						await ib.storage.set("paula", engine.paula);
						ctx.out(engine.paula ? "PAULA: stepped, gritty, like the Amiga\n" : "SMOOTH: interpolated\n");
						return 0;
					case "effects":
						for (const [k, v] of EFFECTS) ctx.out(`${fmt.cyan(k.padEnd(13))} ${v}\n`);
						return 0;
					case "info": {
						const s = need();
						const len = songLength(s);
						ctx.out([
							`title       ${s.title || "—"}`,
							`file        ${st.path} (${s.format})`,
							`tracks      ${s.tracks} · blocks ${s.blocks.length} · positions ${s.sequence.length}`,
							`tempo       ${s.tempoMode.toUpperCase()} ${s.tempo} · speed ${s.speed} · lines a beat ${s.lpb}`,
							`transpose   ${s.transpose} · master volume ${s.masterVolume}`,
							`slides      ${s.flags.ptSlides ? "ProTracker" : "OctaMED"} · volumes ${s.flags.volHex ? "hex" : "decimal"} · ${s.flags.hardwareMix ? "Amiga voices" : "mixing"}`,
							`length      ${Math.floor(len.seconds / 60)}:${String(Math.floor(len.seconds % 60)).padStart(2, "0")} (${len.lines} lines)`,
							`instruments`,
							...s.instruments.map((i, n) => i.kind === "empty" ? "" : `  ${hex(n + 1)} ${i.name.padEnd(22)} ${i.kind.padEnd(6)} ${String(i.data.length).padStart(7)} frames · vol ${i.volume}${i.loopLength ? ` · loop ${i.loopStart}+${i.loopLength}` : ""}${i.transpose ? ` · ${i.transpose > 0 ? "+" : ""}${i.transpose}` : ""}`).filter(Boolean)
						].join("\n") + "\n");
						return 0;
					}
					case "note":
						ctx.out(noteName(parseInt(rest[0] ?? "0", 10)) + "\n");
						return 0;
					default: return ctx.err(`med: unknown "${sub}" (med -h)\n`), 1;
				}
			} catch (e) {
				st.error = e instanceof Error ? e.message : String(e);
				ctx.err(`med: ${st.error}\n`);
				return 1;
			}
		}
	});
}
// modules/breakermed/src/engine.ts
/**
* breakerMED — the engine: it runs the replayer a little ahead of the sound
* (LOOKAHEAD) and sends what it plays to the deck's sampler (ib.audio), each
* event dated on the audio clock. The deck plays them on the exact frame, so
* the song never stutters even when the screen is busy. It also remembers when
* each line sounds, so the page can follow the song as it's heard.
*/
/** seconds of song computed ahead of the sound */
var LOOKAHEAD = .15;
var PUMP_MS = 25;
/** how long a note played on the keyboard lasts (the deck says when a key goes down, not up) */
var PREVIEW_SECONDS = .6;
var Engine = class {
	constructor(audio) {
		_defineProperty(this, "audio", void 0);
		_defineProperty(this, "song", null);
		_defineProperty(this, "mode", null);
		_defineProperty(
			this,
			/** stepped like the Amiga's Paula (true) or smooth */
			"paula",
			true
		);
		_defineProperty(this, "muted", /* @__PURE__ */ new Set());
		_defineProperty(this, "onChange", void 0);
		_defineProperty(this, "player", null);
		_defineProperty(this, "uploaded", /* @__PURE__ */ new Map());
		_defineProperty(this, "timer", null);
		_defineProperty(
			this,
			/** audio time of the next tick */
			"next",
			0
		);
		_defineProperty(
			this,
			/** audio time − performance time (s), measured at start, checked now and then */
			"skew",
			0
		);
		_defineProperty(this, "synced", 0);
		_defineProperty(this, "lines", []);
		_defineProperty(this, "busy", false);
		_defineProperty(this, "previews", 0);
		this.audio = audio;
	}
	/** A new song: its instruments go to the sampler. */
	async load(song) {
		this.stop();
		this.song = song;
		this.lines = [];
		await this.audio.drop().catch(() => {});
		this.uploaded.clear();
		await this.upload();
	}
	/** Send the instruments that changed (or every one). */
	async upload() {
		const s = this.song;
		if (!s) return;
		for (let i = 0; i < s.instruments.length; i++) {
			const inst = s.instruments[i];
			if (this.uploaded.get(i) === inst) continue;
			if (inst.kind === "empty" || !inst.data.length) continue;
			await this.audio.sample(`i${i}`, inst.data, {
				loopStart: inst.loopStart,
				loopLength: inst.loopLength
			});
			this.uploaded.set(i, inst);
		}
	}
	get playing() {
		return this.mode !== null;
	}
	/** Play the song (or one block, again and again) from a position. */
	async play(mode, from) {
		const s = this.song;
		if (!s) throw new Error("no song loaded (med open <file>)");
		if (!this.audio.available()) throw new Error("no sound output here");
		this.stop();
		await this.upload();
		this.player = new Player(s, {
			loopBlock: mode === "block",
			muted: this.muted
		});
		this.player.jump(from.seq, from.line);
		await this.sync();
		this.next = this.audioNow() + .05;
		this.lines = [];
		this.mode = mode;
		this.timer = setInterval(() => void this.pump(), PUMP_MS);
		await this.pump();
		this.onChange?.();
	}
	stop() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		const was = this.mode;
		this.mode = null;
		this.player = null;
		if (was) {
			this.audio.stop().catch(() => {});
			this.onChange?.();
		}
	}
	/** The line being heard now (null when stopped). */
	current() {
		if (!this.mode || !this.lines.length) return null;
		const now = this.audioNow();
		let pos = this.lines[0].pos;
		for (const l of this.lines) {
			if (l.at > now) break;
			pos = l.pos;
		}
		return pos;
	}
	/** One note now (the keyboard as a piano), on a voice past the song's tracks. */
	async preview(instrument, rate, voice) {
		const s = this.song;
		if (!s) return;
		await this.upload();
		const v = voice ?? Math.min(63, s.tracks + this.previews++ % 4);
		if (!this.synced) await this.sync();
		await this.audio.schedule([{
			voice: v,
			play: `i${instrument}`,
			offset: 0,
			rate,
			volume: .45,
			pan: 0,
			interp: this.paula ? "none" : "linear"
		}, {
			at: this.audioNow() + PREVIEW_SECONDS,
			voice: v,
			stop: true
		}]);
	}
	audioNow() {
		return performance.now() / 1e3 + this.skew;
	}
	async sync() {
		const before = performance.now();
		const t = await this.audio.now();
		const after = performance.now();
		this.skew = t - (before + after) / 2e3;
		this.synced = after;
	}
	/** Compute what's due in the next LOOKAHEAD seconds and send it. */
	async pump() {
		if (this.busy || !this.player || !this.mode) return;
		this.busy = true;
		try {
			if (performance.now() - this.synced > 2e3) await this.sync();
			const now = this.audioNow();
			if (this.next < now - .2) this.next = now + .02;
			const out = [];
			const p = this.player;
			while (this.next < now + LOOKAHEAD && this.player === p) {
				const t = p.step();
				if (t.line) this.lines.push({
					at: this.next,
					pos: t.line
				});
				for (const e of t.events) out.push(this.event(e, this.next));
				if (t.ended) {
					this.mode = null;
					break;
				}
				this.next += t.seconds;
			}
			while (this.lines.length > 2 && this.lines[1].at < now - 1) this.lines.shift();
			if (out.length) await this.audio.schedule(out);
			if (!this.mode) {
				if (this.timer) clearInterval(this.timer);
				this.timer = null;
				this.player = null;
				this.onChange?.();
			}
		} finally {
			this.busy = false;
		}
	}
	event(e, at) {
		const o = {
			at,
			voice: e.voice
		};
		if (e.stop) o.stop = true;
		if (e.play !== void 0) {
			o.play = `i${e.play}`;
			o.offset = e.offset ?? 0;
			o.interp = this.paula ? "none" : "linear";
		}
		if (e.rate !== void 0) o.rate = e.rate;
		if (e.volume !== void 0) o.volume = e.volume;
		if (e.pan !== void 0) o.pan = e.pan;
		return o;
	}
};
// modules/breakermed/src/main.ts
var engine = null;
function activate(ib) {
	ib.lib.addTranslations("fr", FR);
	engine = new Engine(ib.audio);
	const st = {
		song: null,
		path: "",
		seq: 0,
		line: 0,
		track: 0,
		inst: 0,
		octave: 2,
		error: ""
	};
	engine.onChange = () => ib.ui.redraw();
	ib.storage.get("paula", true).then((v) => engine && (engine.paula = v !== false));
	registerCommands(ib, engine, st);
	ib.apps.register({
		kind: "breakermed",
		title: "breakerMED",
		description: "a tracker: .med and .mod songs, played and edited",
		icon: "♫",
		launcher: true,
		rawKeys: true,
		create: () => makeApp(ib, engine, st)
	});
	ib.palette.register({
		id: "breakermed.open",
		title: "breakerMED: open a song…",
		run: () => void ib.shell.run("med open")
	});
	ib.palette.register({
		id: "breakermed.stop",
		title: "breakerMED: stop",
		run: () => void ib.shell.run("med stop")
	});
}
function deactivate() {
	engine?.stop();
	engine = null;
}
var FR = {
	"enter play": "entrée joue",
	block: "bloc",
	"space stop": "espace stop",
	"keys: a piano": "touches : un piano",
	octave: "octave",
	instrument: "instrument",
	"med open <file.med|.mod> — or drop one in the vault": "med open <fichier.med|.mod> — ou dépose-en un dans le vault",
	speed: "vitesse",
	"no song loaded": "aucun morceau chargé",
	SEQUENCE: "SÉQUENCE",
	INSTRUMENTS: "INSTRUMENTS",
	"(no name)": "(sans nom)",
	BLOCK: "BLOC",
	line: "ligne",
	track: "piste",
	"mute / unmute this track": "couper / rétablir cette piste"
};
export { activate, deactivate };
