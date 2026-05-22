const canvas = document.getElementById('roomCanvas');
const ctx = canvas.getContext('2d');

// Use a single stable UMD PDF.js build (no .mjs). Try primary CDN then fallback.
const PDF_JS_URL = './vendor/pdfjs/pdf.min.js';
const PDF_JS_WORKER_URL = './vendor/pdfjs/pdf.worker.min.js';

const PDF_SOURCES = [
    './pdf/handlungsraum.pdf?v=20260522',
    './pdf/konzeptpapier.pdf?v=20260522',
    './pdf/kunstraum.pdf?v=20260522'
];

const WIKI_TERMS = [
    'Kunst',
    'Soziale Plastik',
    'Raum',
    'Handlung',
    'Relation'
];

const FORBIDDEN_TERMS = [
    'flüchtling',
    'flüchtlingsunterkunft',
    'kinder',
    'migration'
];

const STOPWORDS = new Set([
    'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'einer', 'eines', 'dem', 'den', 'des',
    'im', 'in', 'am', 'an', 'auf', 'aus', 'mit', 'von', 'für', 'zu', 'als', 'ist', 'sind', 'war',
    'wird', 'werden', 'sich', 'nicht', 'mehr', 'nur', 'auch', 'wie', 'durch', 'bei', 'zwischen',
    'the', 'and', 'of', 'to', 'in', 'for', 'with', 'as', 'is', 'are', 'be', 'this', 'that',
    'pdf', 'seite', 'seiten', 'text', 'fragment', 'fragmente', 'raum', 'handlungsraum'
]);

const THEME_ALIASES = new Map([
    ['kunst', 'kunst'],
    ['beuys', 'sozial'],
    ['plastik', 'sozial'],
    ['sozial', 'sozial'],
    ['gesellschaft', 'praxis'],
    ['praxis', 'praxis'],
    ['handlung', 'handlung'],
    ['handeln', 'handlung'],
    ['raum', 'raum'],
    ['relation', 'relation'],
    ['bezug', 'relation'],
    ['aufbau', 'aufbau'],
    ['struktur', 'aufbau'],
    ['material', 'material'],
    ['beton', 'material'],
    ['asphalt', 'material'],
    ['bewegung', 'bewegung'],
    ['dynamik', 'bewegung'],
    ['leere', 'leere'],
]);

const THEME_AXIS_ORDER = ['aufbau', 'relation', 'praxis', 'sozial', 'raum', 'handlung', 'bewegung', 'material', 'leere'];

let fragments = [];
let wikiFragments = [];
let backgroundLayer = null;
let sceneManager = null;

let animationTime = 0;
let layoutTime = 0;
let isPlaying = true;
let speedMultiplier = 1.0;
let density = 'medium';
let renderStarted = false;

const FRAGMENT_STATE = {
    QUEUED: 'queued',
    ACTIVE: 'active',
    FOUNDATION: 'foundation'
};

const MAX_FRAGMENTS = 180;
const MAX_ACTIVE = 3;
const MAX_WIKI = 6;
const ACTIVE_MIN_DISPLAY = 1.6;

function setupUI() {
    const playBtn = document.getElementById('playPause');
    const speedEl = document.getElementById('speed');
    const densityEl = document.getElementById('density');
    const refreshBtn = document.getElementById('refreshFragments');

    if (playBtn) {
        playBtn.setAttribute('aria-label', isPlaying ? 'Pause animation' : 'Play animation');
        playBtn.addEventListener('click', () => {
            isPlaying = !isPlaying;
            playBtn.setAttribute('aria-label', isPlaying ? 'Pause animation' : 'Play animation');
        });
    }

    if (speedEl) {
        speedEl.addEventListener('input', (e) => {
            speedMultiplier = parseFloat(e.target.value) || 1.0;
        });
    }

    if (densityEl) {
        densityEl.addEventListener('change', (e) => {
            density = e.target.value;
            if (sceneManager) sceneManager.bootstrap();
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => sceneManager && sceneManager.bootstrap());
    }
}

function cleanText(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function sanitizeFragment(text) {
    if (!text) return null;

    let t = text.replace(/-\s+/g, '');
    t = t.replace(/https?:\/\/\S+|www\.\S+|\/\S+\.pdf/gi, '');
    t = t.replace(/\.{2,}/g, '.');
    t = t.replace(/[\u00A0\u200B\u200C\u200D]/g, '');
    t = cleanText(t);

    const words = t.split(' ').filter(Boolean);
    if (words.length < 3) return null;

    const nonLetterCount = (t.match(/[^A-Za-zÀ-ž\s,\.\-'\"]/g) || []).length;
    if (nonLetterCount > Math.max(2, words.length * 0.12)) return null;

    if (isForbiddenText(t)) return null;
    return t;
}

function isForbiddenText(text) {
    const normalized = cleanText(text).toLowerCase();
    return FORBIDDEN_TERMS.some(term => normalized.includes(term));
}

function scoreFragmentText(text) {
    const length = text.length;
    const targetDistance = Math.abs(length - LAYOUT.targetFragmentLength);
    const sentenceBonus = /[.!?]$/.test(text) ? -10 : 0;
    const commaBonus = text.includes(',') ? -4 : 0;
    return targetDistance + sentenceBonus + commaBonus;
}

function splitIntoSemanticUnits(text) {
    const normalized = cleanText(text);
    const sentenceMatches = normalized.match(/[^.!?;:]+[.!?;:]?|[^.!?;:]+/g) || [];
    const sentences = sentenceMatches.map(sentence => cleanText(sentence)).filter(Boolean);

    const units = [];
    let current = '';
    const maxLength = 148;

    function pushCurrent() {
        if (current) {
            units.push(current);
            current = '';
        }
    }

    for (const sentence of sentences) {
        const pieces = sentence.length > 180 ? sentence.split(/,\s+/) : [sentence];
        for (const piece of pieces) {
            const candidate = current ? `${current} ${piece}` : piece;
            if (candidate.length <= maxLength) {
                current = candidate;
            } else {
                pushCurrent();
                current = piece;
            }
        }
    }

    pushCurrent();
    return units.map(unit => sanitizeFragment(unit)).filter(Boolean);
}

function tokenizeForClusters(text) {
    return cleanText(text)
        .toLowerCase()
        .replace(/[^a-zà-žäöüß0-9\s-]/gi, ' ')
        .split(/\s+/)
        .map(token => token.replace(/^-+|-+$/g, ''))
        .filter(token => token.length > 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

function buildSemanticProfile(items) {
    const counts = new Map();
    for (const item of items) {
        const tokens = tokenizeForClusters(item.text);
        const uniqueTokens = new Set(tokens);
        for (const token of uniqueTokens) {
            counts.set(token, (counts.get(token) || 0) + 1);
        }
    }
    return counts;
}

function assignClusterKey(text, profile) {
    const tokens = tokenizeForClusters(text);
    for (const token of tokens) {
        if (THEME_ALIASES.has(token)) return THEME_ALIASES.get(token);
    }

    let bestToken = '';
    let bestScore = -1;
    for (const token of tokens) {
        const score = profile.get(token) || 0;
        if (score > bestScore) {
            bestToken = token;
            bestScore = score;
        }
    }

    return THEME_ALIASES.get(bestToken) || bestToken || tokens[0] || 'grund';
}

function jitter(seed, spread) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return ((value - Math.floor(value)) - 0.5) * 2 * spread;
}

function seededValue(x, y, seed) {
    const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return value - Math.floor(value);
}

function tokenOverlapScore(aText, bText) {
    const a = new Set(tokenizeForClusters(aText));
    const b = new Set(tokenizeForClusters(bText));
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const token of a) if (b.has(token)) inter++;
    return inter / Math.min(a.size, b.size);
}

function wrapFragmentText(text, maxWidth, fontSize) {
    ctx.save();
    ctx.font = `${fontSize}px Inter, sans-serif`;
    const words = cleanText(text).split(' ').filter(Boolean);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth || !currentLine) {
            currentLine = candidate;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }

    if (currentLine) lines.push(currentLine);
    ctx.restore();
    return lines;
}

const LAYOUT = {
    spacingX: 280,
    spacingY: 220,
    marginX: 88,
    marginBottom: 220,
    rowDelay: 1.7,
    cellDelay: 0.1,
    riseDistance: 18,
    driftX: 1.0,
    driftY: 0.45,
    fragmentWidth: 380,
    lineHeight: 30,
    visibleWikiRelations: 6,
    maxFragmentsPerSource: 999,
    targetFragmentLength: 140
};

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    backgroundLayer = null;
    if (sceneManager && typeof sceneManager.onResize === 'function') {
        sceneManager.onResize();
    }
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

async function ensurePdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = PDF_JS_URL;
        script.async = true;
        script.onload = () => {
            try {
                window.pdfjsLib = window.pdfjsLib || window.pdfjsViewer || window['pdfjs-dist/build/pdf'] || window['pdfjs-dist'];
                if (!window.pdfjsLib) return reject(new Error('pdfjsLib not found'));
                window.pdfjsLib.GlobalWorkerOptions = window.pdfjsLib.GlobalWorkerOptions || {};
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
                console.log('[PDF] loaded');
                resolve(window.pdfjsLib);
            } catch (err) {
                reject(err);
            }
        };
        script.onerror = (e) => reject(e);
        document.head.appendChild(script);
    });
}

window.addEventListener('unhandledrejection', (e) => {
    console.error('[UnhandledRejection]', e.reason);
});

window.addEventListener('error', (e) => {
    console.error('[WindowError]', e.message, e.filename, e.lineno, e.colno);
});

async function extractPdfFragments(path) {
    try {
        const pdfjs = await ensurePdfJs();
        const loadingTask = pdfjs.getDocument(path);
        const pdf = await loadingTask.promise;
        let fullText = '';

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += ` ${pageText}`;
        }

        const units = splitIntoSemanticUnits(fullText);
        console.log(`PDF geladen: ${path} — Einheiten: ${units.length}`);
        console.log('[PDF] loaded', path);
        return units;
    } catch (error) {
        console.error('PDF Fehler:', path, error);
        return [];
    }
}

function curateFragments(extracted) {
    return extracted
        .map(t => sanitizeFragment(t))
        .filter(Boolean)
        .map(text => ({ text, score: scoreFragmentText(text) }))
        .sort((a, b) => a.score - b.score)
        .map(c => c.text);
}

class FragmentSystem {
    constructor(maxFragments) {
        this.maxFragments = maxFragments;
        this.fragments = [];
        this.pool = [];
    }

    acquire() {
        return this.pool.pop() || {
            text: '',
            source: '',
            sourceName: '',
            x: 0,
            y: 0,
            opacity: 0,
            scale: 0.9,
            size: 16,
            maxWidth: 320,
            lineHeight: LAYOUT.lineHeight,
            lines: [],
            renderLineHeight: LAYOUT.lineHeight,
            state: FRAGMENT_STATE.QUEUED,
            stateTime: 0,
            activatedAt: 0,
            revealedAt: 0,
            clusterKey: 'grund',
            clusterIndex: 0,
            clusterOrder: 0,
            clusterSize: 0,
            baseScale: 1,
            targetX: 0,
            targetY: 0,
            revealDelay: 0,
            height: 0
        };
    }

    recycle(fragment) {
        fragment.text = '';
        fragment.source = '';
        fragment.sourceName = '';
        fragment.x = 0;
        fragment.y = 0;
        fragment.opacity = 0;
        fragment.scale = 0.9;
        fragment.size = 16;
        fragment.maxWidth = 320;
        fragment.lineHeight = LAYOUT.lineHeight;
        fragment.lines = [];
        fragment.renderLineHeight = LAYOUT.lineHeight;
        fragment.state = FRAGMENT_STATE.QUEUED;
        fragment.stateTime = 0;
        fragment.activatedAt = 0;
        fragment.revealedAt = 0;
        fragment.clusterKey = 'grund';
        fragment.clusterIndex = 0;
        fragment.clusterOrder = 0;
        fragment.clusterSize = 0;
        fragment.baseScale = 1;
        fragment.targetX = 0;
        fragment.targetY = 0;
        fragment.revealDelay = 0;
        fragment.height = 0;
        this.pool.push(fragment);
    }

    reset() {
        for (const fragment of this.fragments) {
            this.recycle(fragment);
        }
        this.fragments = [];
    }

    ingest(entries) {
        for (const entry of entries) {
            let fragment;

            if (this.fragments.length >= this.maxFragments) {
                fragment = this.fragments.shift();
            } else {
                fragment = this.acquire();
            }

            fragment.text = entry.text;
            fragment.source = entry.source;
            fragment.sourceName = entry.sourceName;
            fragment.size = entry.size;
            fragment.state = FRAGMENT_STATE.QUEUED;
            fragment.opacity = 0;
            fragment.scale = 0.9;
            fragment.stateTime = 0;
            fragment.activatedAt = 0;
            fragment.revealedAt = 0;
            fragment.renderLineHeight = LAYOUT.lineHeight;

            this.fragments.push(fragment);
        }

        return this.fragments;
    }
}

class LayoutEngine {
    constructor() {
        this.seed = 17;
        this.drawOrder = [];
        this.queueOrder = [];
        this.relationPairs = [];
        this.wikiMatches = [];
    }

    seededNoise(seed) {
        const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
        return value - Math.floor(value);
    }

    build(fragments, wikiFragments, density) {
        const usableWidth = Math.max(1, canvas.width - LAYOUT.marginX * 2);
        const densityFactor = density === 'high' ? 1.06 : density === 'low' ? 0.92 : 1;
        const fragmentWidth = Math.min(LAYOUT.fragmentWidth, Math.max(250, Math.floor(usableWidth * 0.46 * densityFactor)));

        fragments.forEach(fragment => {
            fragment.maxWidth = fragmentWidth;
            fragment.lines = wrapFragmentText(fragment.text, fragment.maxWidth, fragment.size);
            fragment.height = Math.max(1, fragment.lines.length) * fragment.lineHeight + 8;
        });

        const profile = buildSemanticProfile(fragments);
        fragments.forEach(fragment => {
            fragment.clusterKey = assignClusterKey(fragment.text, profile);
            fragment.clusterWeight = profile.get(fragment.clusterKey) || 1;
        });

        const clusters = new Map();
        for (const fragment of fragments) {
            if (!clusters.has(fragment.clusterKey)) clusters.set(fragment.clusterKey, []);
            clusters.get(fragment.clusterKey).push(fragment);
        }

        const clusterEntries = Array.from(clusters.entries()).sort((left, right) => {
            const leftWeight = left[1].length;
            const rightWeight = right[1].length;
            return rightWeight - leftWeight || left[0].localeCompare(right[0]);
        });

        const axisXCenters = [0.12, 0.28, 0.44, 0.6, 0.76, 0.92];
        const axisYSlots = [0.78, 0.64, 0.5, 0.36, 0.22];
        const axisSpacing = Math.max(110, (canvas.height - LAYOUT.marginBottom * 1.15) / axisYSlots.length);
        const seedBase = fragments.length * 31 + canvas.width * 0.001 + canvas.height * 0.002;
        this.seed = seedBase;

        clusterEntries.forEach(([key, clusterFragments], clusterIndex) => {
            const axisIndex = clusterIndex % axisYSlots.length;
            const xCenter = LAYOUT.marginX + usableWidth * axisXCenters[clusterIndex % axisXCenters.length];
            const clusterCenterX = xCenter + (this.seededNoise(seedBase + clusterIndex * 0.7) - 0.5) * usableWidth * 0.02;
            const clusterCenterY = canvas.height - LAYOUT.marginBottom - axisIndex * axisSpacing;

            clusterFragments.forEach((fragment, index) => {
                fragment.clusterIndex = clusterIndex;
                fragment.clusterOrder = index;
                fragment.clusterSize = clusterFragments.length;
                fragment.baseScale = Math.min(1.08, Math.max(0.9, 0.96 + clusterFragments.length * 0.01 - index * 0.004));
                fragment.revealDelay = clusterIndex * 0.42 + index * 0.1;
                fragment.targetX = Math.min(
                    canvas.width - LAYOUT.marginX - fragment.maxWidth,
                    Math.max(LAYOUT.marginX, clusterCenterX + (index - (clusterFragments.length - 1) / 2) * 14 + (this.seededNoise(seedBase + clusterIndex * 3 + index) - 0.5) * 18)
                );
                fragment.targetY = Math.max(78, clusterCenterY + ((index % 2 === 0 ? -1 : 1) * Math.min(14, 5 + index * 1.2)));
                fragment.x = fragment.targetX;
                fragment.y = fragment.targetY + LAYOUT.riseDistance;
                fragment.opacity = 0;
                fragment.scale = 0.9;
                fragment.state = FRAGMENT_STATE.QUEUED;
            });
        });

        this.drawOrder = fragments.slice().sort((a, b) => a.targetY - b.targetY || a.targetX - b.targetX || a.revealDelay - b.revealDelay);
        this.queueOrder = fragments.slice().sort((a, b) => a.revealDelay - b.revealDelay || a.clusterIndex - b.clusterIndex || a.clusterOrder - b.clusterOrder);
        this.relationPairs = this.buildRelations(fragments);
        this.wikiMatches = this.buildWikiMatches(wikiFragments, fragments);
    }

    buildRelations(fragments) {
        const relations = [];
        for (let i = 1; i < this.drawOrder.length; i++) {
            const previous = this.drawOrder[i - 1];
            const current = this.drawOrder[i];
            const overlap = tokenOverlapScore(previous.text, current.text);
            if (overlap >= 0.08) {
                relations.push({ left: previous, right: current, opacity: 0.08 + overlap * 0.18 });
            }
        }

        for (const fragment of fragments) {
            fragment.clusterPeers = [];
        }

        const clusters = new Map();
        for (const fragment of fragments) {
            if (!clusters.has(fragment.clusterKey)) clusters.set(fragment.clusterKey, []);
            clusters.get(fragment.clusterKey).push(fragment);
        }

        clusters.forEach(clusterFragments => {
            const sorted = clusterFragments.slice().sort((a, b) => a.targetY - b.targetY || a.targetX - b.targetX);
            for (let i = 1; i < sorted.length; i++) {
                const left = sorted[i - 1];
                const right = sorted[i];
                const overlap = tokenOverlapScore(left.text, right.text);
                if (overlap >= 0.1) {
                    relations.push({ left, right, opacity: 0.12 + overlap * 0.16 });
                }
            }
        });

        return relations;
    }

    buildWikiMatches(wikiFragments, fragments) {
        const matches = [];

        for (const wiki of wikiFragments.slice(0, MAX_WIKI)) {
            let best = null;
            let bestScore = 0;

            for (const fragment of fragments) {
                const score = tokenOverlapScore(wiki.text || wiki.term || '', fragment.text || '');
                if (score > bestScore) {
                    bestScore = score;
                    best = fragment;
                }
            }

            if (best && bestScore > 0.1) {
                matches.push({ wiki, fragment: best, score: bestScore });
            }
        }

        return matches;
    }
}

class RenderEngine {
    constructor(canvasElement, context) {
        this.canvas = canvasElement;
        this.ctx = context;
        this.backgroundLayer = null;
        this.backgroundSeed = 17;
    }

    seededNoise(x, y, seed) {
        const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
        return value - Math.floor(value);
    }

    invalidateBackground() {
        this.backgroundLayer = null;
    }

    prepareBackground(seed) {
        this.backgroundSeed = seed;
        const layer = document.createElement('canvas');
        layer.width = this.canvas.width;
        layer.height = this.canvas.height;
        const lctx = layer.getContext('2d');

        lctx.fillStyle = '#8f8d86';
        lctx.fillRect(0, 0, layer.width, layer.height);

        const deepCount = Math.max(3, Math.floor(layer.width / 800));
        for (let i = 0; i < deepCount; i++) {
            const w = layer.width * (0.32 + this.seededNoise(i, 1, seed) * 0.55);
            const h = layer.height * (0.16 + this.seededNoise(i, 2, seed) * 0.22);
            const x = Math.max(0, layer.width * this.seededNoise(i, 3, seed) - w * 0.45);
            const y = layer.height * this.seededNoise(i, 4, seed) * 0.5;
            const g = lctx.createLinearGradient(x, y, x + w, y + h);
            const a = 0.05 + this.seededNoise(i, 5, seed) * 0.05;
            g.addColorStop(0, `rgba(50,50,52,${a})`);
            g.addColorStop(1, `rgba(80,78,74,${a * 0.5})`);
            lctx.fillStyle = g;
            lctx.fillRect(x, y, w, h);
        }

        const bands = 5;
        for (let i = 0; i < bands; i++) {
            const bandHeight = 28 + this.seededNoise(i, 6, seed) * 38;
            const y = layer.height * (0.28 + (i / bands) * 0.6) + (this.seededNoise(i, 7, seed) - 0.5) * 24;
            lctx.fillStyle = `rgba(30,30,30,${0.03 + this.seededNoise(i, 8, seed) * 0.05})`;
            lctx.fillRect(0, y, layer.width, bandHeight);
            if (this.seededNoise(i, 9, seed) > 0.5) {
                lctx.fillStyle = `rgba(20,20,20,${0.02 + this.seededNoise(i, 10, seed) * 0.03})`;
                const segW = 60 + this.seededNoise(i, 11, seed) * 260;
                const segX = this.seededNoise(i, 12, seed) * layer.width;
                lctx.fillRect(segX, y + bandHeight * 0.2, segW, Math.min(6, bandHeight * 0.4));
            }
        }

        const stains = 18;
        for (let i = 0; i < stains; i++) {
            const fx = this.seededNoise(i, 13, seed);
            const fy = 0.35 + this.seededNoise(i, 14, seed) * 0.55;
            const w = 40 + this.seededNoise(i, 15, seed) * 360;
            const h = 20 + this.seededNoise(i, 16, seed) * 220;
            const opacity = 0.02 + this.seededNoise(i, 17, seed) * 0.05;
            const x = Math.floor(layer.width * fx - w * 0.5);
            const y = Math.floor(layer.height * fy - h * 0.5);
            const g = lctx.createRadialGradient(x + w * 0.5, y + h * 0.5, 0, x + w * 0.5, y + h * 0.5, Math.max(w, h));
            g.addColorStop(0, `rgba(20,20,18,${opacity})`);
            g.addColorStop(0.5, `rgba(80,78,74,${opacity * 0.6})`);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            lctx.fillStyle = g;
            lctx.beginPath();
            lctx.ellipse(x + w * 0.5, y + h * 0.5, w * (0.8 + this.seededNoise(i, 18, seed) * 0.6), h * (0.6 + this.seededNoise(i, 19, seed) * 0.9), this.seededNoise(i, 20, seed) * 0.4, 0, Math.PI * 2);
            lctx.fill();
        }

        const grainStep = 28;
        for (let y = 0; y < layer.height; y += grainStep) {
            for (let x = 0; x < layer.width; x += grainStep) {
                const value = this.seededNoise(x, y, seed);
                if (value > 0.995) {
                    lctx.fillStyle = `rgba(255,255,255,${0.012 + (value - 0.995) * 0.05})`;
                    lctx.fillRect(x, y, 1, 1);
                } else if (value > 0.9975) {
                    lctx.fillStyle = `rgba(0,0,0,${0.012 + (value - 0.9975) * 0.06})`;
                    lctx.fillRect(x, y, 1, 1);
                }
            }
        }

        const fog = lctx.createLinearGradient(0, 0, 0, layer.height);
        fog.addColorStop(0, 'rgba(20,20,20,0.28)');
        fog.addColorStop(0.25, 'rgba(20,20,20,0.06)');
        fog.addColorStop(0.6, 'rgba(20,20,20,0.02)');
        fog.addColorStop(1, 'rgba(8,8,8,0.36)');
        lctx.fillStyle = fog;
        lctx.fillRect(0, 0, layer.width, layer.height);

        this.backgroundLayer = layer;
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawBackground() {
        if (!this.backgroundLayer) {
            this.prepareBackground(this.backgroundSeed);
        }
        this.ctx.drawImage(this.backgroundLayer, 0, 0);
    }

    drawFragments(fragments) {
        for (const fragment of fragments) {
            if (fragment.y < -220 || fragment.y > this.canvas.height + 260) continue;

            this.ctx.save();
            this.ctx.textBaseline = 'top';
            this.ctx.font = `${Math.max(10, Math.round(fragment.size * (fragment.scale || 1)))}px Inter, sans-serif`;
            this.ctx.fillStyle = fragment.state === FRAGMENT_STATE.FOUNDATION
                ? `rgba(239,235,224,${Math.max(0.16, fragment.opacity)})`
                : fragment.state === FRAGMENT_STATE.ACTIVE
                    ? `rgba(239,235,224,${Math.min(1, fragment.opacity)})`
                    : `rgba(239,235,224,${Math.min(0.12, fragment.opacity)})`;

            const lines = fragment.state === FRAGMENT_STATE.ACTIVE
                ? wrapFragmentText(fragment.text.slice(0, Math.max(1, Math.floor(fragment.text.length * fragment.revealProgress))), fragment.maxWidth, fragment.size)
                : fragment.lines;

            const lineHeight = fragment.renderLineHeight || fragment.lineHeight;
            let blockWidth = 0;
            for (const line of lines) {
                blockWidth = Math.max(blockWidth, this.ctx.measureText(line).width);
            }

            const anchorX = fragment.x + blockWidth * 0.5;
            const anchorY = fragment.y + lines.length * lineHeight + 6;
            const anchorAlpha = fragment.state === FRAGMENT_STATE.FOUNDATION ? 0.26 : fragment.state === FRAGMENT_STATE.ACTIVE ? 0.18 : 0.08;

            this.ctx.save();
            this.ctx.fillStyle = `rgba(8,8,6,${anchorAlpha})`;
            this.ctx.shadowColor = `rgba(0,0,0,${anchorAlpha})`;
            this.ctx.shadowBlur = fragment.state === FRAGMENT_STATE.FOUNDATION ? 10 : 6;
            this.ctx.beginPath();
            this.ctx.ellipse(anchorX, anchorY, Math.max(18, blockWidth * 0.42), fragment.state === FRAGMENT_STATE.FOUNDATION ? 8 : 6, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();

            let cursorY = fragment.y;
            for (const line of lines) {
                this.ctx.fillText(line, fragment.x, cursorY);
                cursorY += lineHeight;
            }

            if (fragment.clusterOrder === 0) {
                this.ctx.font = '9px IBM Plex Mono, monospace';
                this.ctx.fillStyle = 'rgba(209,191,88,0.28)';
                this.ctx.fillText(`${fragment.sourceName || ''} · ${fragment.clusterKey || ''}`, fragment.x, fragment.y - 12);
            }

            this.ctx.restore();
        }
    }

    drawRelations(relations) {
        this.ctx.save();
        this.ctx.lineWidth = 0.8;
        for (const relation of relations) {
            const left = relation.left;
            const right = relation.right;
            const midX = (left.x + right.x) * 0.5;
            const midY = (left.y + right.y) * 0.5 - 18;
            this.ctx.strokeStyle = `rgba(209,191,88,${relation.opacity})`;
            this.ctx.beginPath();
            this.ctx.moveTo(left.x + left.maxWidth * 0.5, left.y + left.renderLineHeight * 0.6);
            this.ctx.lineTo(midX, midY);
            this.ctx.lineTo(right.x + right.maxWidth * 0.25, right.y + right.renderLineHeight * 0.6);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    drawWikipedia(wikiMatches, time) {
        if (!wikiMatches.length) return;

        this.ctx.save();
        wikiMatches.slice(0, MAX_WIKI).forEach((match, index) => {
            const fragment = match.fragment;
            const anchorY = Math.max(96, this.canvas.height - LAYOUT.marginBottom - index * Math.max(40, LAYOUT.spacingY * 0.5));
            const anchorX = this.canvas.width - 172;
            const targetX = fragment.x - 18;
            const targetY = fragment.y + (fragment.renderLineHeight || fragment.lineHeight) * 0.45;
            const pulse = 0.08 + match.score * 0.22;

            this.ctx.strokeStyle = `rgba(209,191,88,${pulse})`;
            this.ctx.lineWidth = 0.7;
            this.ctx.beginPath();
            this.ctx.moveTo(anchorX, anchorY);
            this.ctx.lineTo((anchorX + targetX) * 0.5, anchorY + 2);
            this.ctx.lineTo(targetX, targetY);
            this.ctx.stroke();

            this.ctx.fillStyle = `rgba(209,191,88,${pulse + 0.08})`;
            this.ctx.beginPath();
            this.ctx.arc(anchorX, anchorY, 1.4, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.font = '10px IBM Plex Mono, monospace';
            this.ctx.fillStyle = `rgba(209,191,88,${0.24 + pulse})`;
            this.ctx.fillText(match.wiki.term, anchorX - 118, anchorY - 5);
        });
        this.ctx.restore();
    }
}

class SceneManager {
    constructor() {
        this.fragmentSystem = new FragmentSystem(MAX_FRAGMENTS);
        this.layoutEngine = new LayoutEngine();
        this.renderEngine = new RenderEngine(canvas, ctx);
        this.fragments = this.fragmentSystem.fragments;
        this.wikiFragments = [];
        this.activeFragments = [];
        this.foundationFragments = [];
        this.time = 0;
        this.layoutTime = 0;
        this.running = false;
        this.uiInitialized = false;
        this.lastTimestamp = 0;
        this.speedMultiplier = 1.0;
        this.density = 'medium';
    }

    async loadPdfFragments() {
        const rawEntries = [];

        for (const source of PDF_SOURCES) {
            const extracted = await extractPdfFragments(source);
            const curated = curateFragments(extracted);
            for (const text of curated) {
                rawEntries.push({
                    text,
                    source,
                    sourceName: source.split('/').pop() || source,
                    size: Math.min(20, 16.5 + Math.min(5.5, text.length / 34))
                });
            }
        }

        this.fragmentSystem.reset();
        this.fragments = this.fragmentSystem.ingest(rawEntries);
        console.log('[PDF] fragments:', this.fragments.length);
    }

    async loadWikipediaFragments() {
        const collected = [];

        for (const term of WIKI_TERMS.slice(0, MAX_WIKI)) {
            try {
                const response = await fetch(`https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
                if (!response.ok) continue;
                const data = await response.json();
                if (data.extract) {
                    collected.push({ term, text: data.extract.slice(0, 180) });
                }
            } catch (error) {
                continue;
            }
        }

        this.wikiFragments = collected.slice(0, MAX_WIKI);
        console.log('[WIKI] loaded:', this.wikiFragments.length);
    }

    async bootstrap() {
        console.log('[Bootstrap] start');
        if (!this.uiInitialized) {
            setupUI();
            this.uiInitialized = true;
        }

        this.speedMultiplier = speedMultiplier;
        this.density = density;
        this.time = 0;
        this.layoutTime = 0;
        this.activeFragments = [];
        this.foundationFragments = [];

        try {
            await this.loadPdfFragments();
            await this.loadWikipediaFragments();
        } catch (err) {
            console.error('[Bootstrap] error loading fragments', err);
            this.fragments = [];
            this.wikiFragments = [];
        }

        this.layoutEngine.build(this.fragments, this.wikiFragments, this.density);
        this.renderEngine.invalidateBackground();
        this.renderEngine.prepareBackground(this.layoutEngine.seed);
        this.running = true;

        console.log('[Bootstrap] loaded fragments count', this.fragments.length);
        if (!this.rendering) {
            this.rendering = true;
            this.renderFrame();
        }
    }

    onResize() {
        this.layoutEngine.build(this.fragments, this.wikiFragments, this.density);
        this.renderEngine.invalidateBackground();
        this.renderEngine.prepareBackground(this.layoutEngine.seed);
    }

    updateStateMachine(dt) {
        const maxActive = MAX_ACTIVE;

        for (const fragment of this.layoutEngine.queueOrder) {
            if (fragment.state !== FRAGMENT_STATE.QUEUED) continue;
            if (this.activeFragments.length >= maxActive) break;
            if (this.layoutTime >= fragment.revealDelay) {
                fragment.state = FRAGMENT_STATE.ACTIVE;
                fragment.activatedAt = this.layoutTime;
                fragment.revealProgress = 0;
                fragment.opacity = 0;
                fragment.x = fragment.targetX + this.layoutEngine.seededNoise(fragment.clusterIndex + fragment.clusterOrder, 1, this.layoutEngine.seed) * 14 - 7;
                fragment.y = fragment.targetY + LAYOUT.riseDistance * 0.6;
                this.activeFragments.push(fragment);
            }
        }

        for (let i = this.activeFragments.length - 1; i >= 0; i--) {
            const fragment = this.activeFragments[i];
            const activeAge = this.layoutTime - fragment.activatedAt;
            if (activeAge >= ACTIVE_MIN_DISPLAY + 1.8) {
                fragment.state = FRAGMENT_STATE.FOUNDATION;
                fragment.revealedAt = this.layoutTime;
                fragment.opacity = Math.max(fragment.opacity, 0.18);
                this.foundationFragments.push(fragment);
                this.activeFragments.splice(i, 1);
            }
        }

        const foundationStartY = this.canvasHeightOffset();
        const foundationWidth = Math.min(canvas.width * 0.82, this.fragments.length * (LAYOUT.fragmentWidth * 0.62 + 12));
        const foundationStartX = (canvas.width - foundationWidth) * 0.5 + LAYOUT.marginX * 0.5;
        const spacing = foundationWidth / Math.max(1, this.fragments.filter(f => f.state === FRAGMENT_STATE.FOUNDATION).length || 1);
        let foundationIndex = 0;

        for (const fragment of this.fragments) {
            if (fragment.state !== FRAGMENT_STATE.FOUNDATION) continue;
            fragment.targetX = Math.min(canvas.width - LAYOUT.marginX - fragment.maxWidth, Math.max(LAYOUT.marginX, foundationStartX + foundationIndex * spacing));
            fragment.targetY = foundationStartY;
            fragment.renderLineHeight = LAYOUT.lineHeight;
            foundationIndex++;
        }
    }

    canvasHeightOffset() {
        return canvas.height - 110;
    }

    updateMotion(dt) {
        for (const fragment of this.fragments) {
            if (fragment.state === FRAGMENT_STATE.QUEUED) {
                fragment.opacity = Math.min(fragment.opacity + dt * 0.06, 0.1);
                fragment.scale = 0.9;
                fragment.x += (fragment.targetX - fragment.x) * 0.02;
                fragment.y += (fragment.targetY + LAYOUT.riseDistance * 0.6 - fragment.y) * 0.02;
                continue;
            }

            if (fragment.state === FRAGMENT_STATE.ACTIVE) {
                const activeAge = Math.max(0, this.layoutTime - fragment.activatedAt);
                const progress = Math.min(1, activeAge / 1.8);
                fragment.revealProgress = progress;
                fragment.opacity = Math.min(1, 0.58 + progress * 0.42);
                fragment.scale = fragment.scale + ((fragment.baseScale || 1) - fragment.scale) * (0.06 + progress * 0.22);
                fragment.x += (fragment.targetX - fragment.x) * (0.06 + progress * 0.12);
                fragment.y += ((fragment.targetY - 6 - progress * 8) - fragment.y) * (0.06 + progress * 0.16);
                continue;
            }

            if (fragment.state === FRAGMENT_STATE.FOUNDATION) {
                fragment.opacity = Math.max(0.18, fragment.opacity + dt * 0.005);
                fragment.scale += ((fragment.baseScale || 1) - fragment.scale) * 0.01;
                fragment.x += (fragment.targetX - fragment.x) * 0.015;
                fragment.y += (fragment.targetY - fragment.y) * 0.015;
            }
        }
    }

    renderFrame(timestamp) {
        this.speedMultiplier = speedMultiplier;
        this.density = density;

        if (this.running && isPlaying) {
            const step = 0.0035 * Math.max(0.12, Math.min(3, this.speedMultiplier));
            this.time += step;
            this.layoutTime += step;
        }

        if (!renderStarted) {
            console.log('[RENDER] started');
            renderStarted = true;
        }

        this.updateStateMachine();
        this.updateMotion();

        this.renderEngine.clearCanvas();
        this.renderEngine.drawBackground();
        this.renderEngine.drawFragments(this.fragments);
        this.renderEngine.drawRelations(this.layoutEngine.relationPairs);
        this.renderEngine.drawWikipedia(this.layoutEngine.wikiMatches, this.layoutTime);

        requestAnimationFrame((nextTimestamp) => this.renderFrame(nextTimestamp));
    }
}

sceneManager = new SceneManager();

function render() {
    if (sceneManager) {
        return sceneManager.renderFrame();
    }
}

async function bootstrap() {
    if (sceneManager) {
        sceneManager.speedMultiplier = speedMultiplier;
        sceneManager.density = density;
        return sceneManager.bootstrap();
    }
}

bootstrap();
