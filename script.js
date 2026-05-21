<<<<<<< HEAD
const canvas = document.getElementById("space");

const ctx = canvas.getContext("2d");

function resize(){

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

=======
(() => {
    // Konfiguration und Basismaterial
    const FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.js';
    const PDF_JS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.js';
    const PDF_SOURCES = [
        { id: 'konzeptpapier', url: 'pdf/konzeptpapier.pdf', label: 'Konzeptpapier.pdf', category: 'theory' },
        { id: 'kunstraum', url: 'pdf/kunstraum.pdf', label: 'Kunstraum.pdf', category: 'theory' }
    ];
    const LIVE_QUERIES = ['Soziale Plastik', 'Joseph Beuys', 'Social Sculpture'];
    const MAX_THEORY_FRAGMENTS = 22;
    const MAX_LIVE_FRAGMENTS = 12;
    const MAX_RELATIONS = 56;
    const MAX_VISIBLE_FRAGMENTS = 42;
    const COLLISION_ITERATIONS = 2;
    const RELATION_THRESHOLD = 0.18;
    const STOPWORDS = new Set([
        'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'einer', 'eines', 'einem', 'mit', 'ohne', 'von', 'für', 'im', 'in', 'auf',
        'ist', 'sind', 'war', 'werden', 'als', 'auch', 'den', 'dem', 'des', 'zur', 'zum', 'dass', 'nicht', 'mehr', 'nur', 'über', 'unter',
        'the', 'and', 'or', 'a', 'an', 'of', 'to', 'for', 'with', 'in', 'on', 'at', 'by', 'from', 'is', 'are', 'be', 'as', 'this', 'that'
    ]);
    const ELEMENTS = ['water', 'air', 'fire', 'earth'];

    const FALLBACK_THEORY = [
        {
            title: 'Kunst als Erfahrung',
            text: 'John Dewey: Kunst entsteht nicht als Objekt, sondern als verdichtete Erfahrung zwischen Wahrnehmung, Handlung und Bedeutung.',
            tags: ['erfahrung', 'handlung', 'wahrnehmung']
        },
        {
            title: 'Kunst als menschliche Praxis',
            text: 'Georg W. Bertram: Kunst ist eine Praxis, die sich in gemeinsamer Arbeit, Aushandlung und sozialer Formgebung ereignet.',
            tags: ['praxis', 'gemeinsamkeit', 'formgebung']
        },
        {
            title: 'Soziale Plastik',
            text: 'Joseph Beuys: gesellschaftliche Prozesse werden als formbare Materie begriffen, die durch Handlungen, Sprache und Aufmerksamkeit skulptural wird.',
            tags: ['gesellschaft', 'form', 'sprache']
        },
        {
            title: 'Prozessraum',
            text: 'Der Raum bleibt in Arbeit, reagiert auf Daten, hält Übergänge offen und verweigert den Eindruck eines abgeschlossenen Ergebnis.',
            tags: ['prozess', 'offenheit', 'übergang']
        },
        {
            title: 'Relationale Form',
            text: 'Bedeutung entsteht im Zwischenraum: aus Nähe, Reibung, Wiederholung und der leisen Verschiebung zwischen Fragmenten.',
            tags: ['beziehung', 'zwischenraum', 'verschiebung']
        },
        {
            title: 'Arbeiterschrift',
            text: 'Die Typografie bleibt funktional, roh und lesbar, damit sie nicht illustriert, sondern als Material der Wahrnehmung arbeitet.',
            tags: ['typografie', 'lesbarkeit', 'material']
        },
        {
            title: 'Diskursive Drift',
            text: 'Texte treten nicht als Illustration auf, sondern als driftende, sich überlagernde Spuren eines gemeinsamen Denkraums.',
            tags: ['drift', 'denken', 'spur']
        },
        {
            title: 'Handlungsraum',
            text: 'Der Raum ist eine soziale Plastik, in der Sprache, Daten und Bewegung einander fortschreiben.',
            tags: ['raum', 'bewegung', 'sprache']
        }
    ];

    const FallbackLive = [
        {
            title: 'Soziale Plastik',
            text: 'Wikipedia-Fragment: Kunst als gesellschaftliche Formung und als offene Praxis des Mitgestaltens.',
            tags: ['wikipedia', 'gesellschaft']
        },
        {
            title: 'Joseph Beuys',
            text: 'Wikipedia-Fragment: Denken, Handeln und künstlerische Intervention als zusammenhängender sozialer Prozess.',
            tags: ['wikipedia', 'beuys']
        },
        {
            title: 'Social Sculpture',
            text: 'Wikipedia-Fragment: skulpturales Arbeiten am Sozialen, das nicht Objekt, sondern Verhandlung ist.',
            tags: ['wikipedia', 'relation']
        }
    ];

    const canvas = document.getElementById('roomCanvas');
    const context = canvas.getContext('2d', { alpha: true });
    const statusNode = document.getElementById('roomStatus');
    const metaNode = document.getElementById('roomMeta');

    const state = {
        width: 0,
        height: 0,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        lastTime: performance.now(),
        fragments: [],
        relations: [],
        pdfReady: false,
        liveReady: false,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
    };

    // Kleine Hilfsfunktionen
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const lerp = (start, end, amount) => start + (end - start) * amount;
    const hashString = (value) => {
        let hash = 0;
        for (let index = 0; index < value.length; index += 1) {
            hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
        }
        return Math.abs(hash);
    };
    const randomFromHash = (value) => ((Math.sin(value) + 1) / 2);

    function setStatus(message, meta = null) {
        statusNode.textContent = message;
        if (meta !== null) {
            metaNode.textContent = meta;
        }
    }

    function loadExternalScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Script konnte nicht geladen werden: ${url}`));
            document.head.appendChild(script);
        });
    }

    async function ensurePdfJs() {
        if (window.pdfjsLib) {
            return window.pdfjsLib;
        }

        try {
            await loadExternalScript(PDF_JS_URL);
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
                return window.pdfjsLib;
            }
        } catch (error) {
            return null;
        }

        return null;
    }


/* ERDE */

p.vx *= 0.995;
p.vy *= 0.995;





p.x += p.vx;
p.y += p.vy;





if(p.x > canvas.width + 200){
p.x = -200;
}

if(p.x < -200){
p.x = canvas.width + 200;
}

if(p.y > canvas.height + 200){
p.y = -200;
}

if(p.y < -200){
p.y = canvas.height + 200;
}

}





function drawConnections(){

for(let i = 0; i < fragments.length; i++){

for(let j = i + 1; j < fragments.length; j++){

const a = fragments[i];
const b = fragments[j];

const dx = a.x - b.x;
const dy = a.y - b.y;

const dist = Math.sqrt(dx * dx + dy * dy);

if(dist < 160){

ctx.beginPath();

ctx.strokeStyle = "rgba(214,201,74,0.08)";

ctx.moveTo(a.x, a.y);

        window.addEventListener('resize', resizeCanvas, { passive: true });

        bootstrap();
})();
    {
        title: 'Menschliche Praxis',
        source: 'Konzept',
        excerpt: 'Das Projekt bleibt offen für weitere Begriffe, Fragmente und Verweise.'
    }
];

const liveFeed = document.getElementById('liveFeed');
const liveTerms = document.getElementById('liveTerms');

function renderFeed(items) {
    liveFeed.innerHTML = items.map((item) => `
        <article class="feed-item">
            <header>
                <strong>${item.title}</strong>
                <span>${item.source}</span>
            </header>
            <p>${item.excerpt}</p>
        </article>
    `).join('');

    const terms = items.flatMap((item) => item.title.split(/\s+/)).slice(0, 10);
    liveTerms.innerHTML = terms.map((term) => `<span class="term">${term}</span>`).join('');
}

async function fetchFragments(query) {
    const url = `https://de.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Wikipedia status ${response.status}`);
    }

    const data = await response.json();
    const results = data?.query?.search ?? [];

    return results.slice(0, 3).map((result) => ({
        title: result.title,
        source: 'Wikipedia',
        excerpt: result.snippet.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"')
    }));
}

async function loadLiveFeed() {
    const queries = ['Soziale Plastik', 'Joseph Beuys', 'Bildhauerei'];

    try {
        const batches = await Promise.all(queries.map((query) => fetchFragments(query)));
        const items = batches.flat().filter(Boolean);

        if (!items.length) {
            throw new Error('empty result');
        }

        renderFeed(items);
    } catch (error) {
        renderFeed(fallbackFeed);
    }
}

const canvas = document.getElementById('backgroundCanvas');
const context = canvas.getContext('2d');
let width = 0;
let height = 0;
let nodes = [];
let pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

function resizeCanvas() {
    width = canvas.width = window.innerWidth * devicePixelRatio;
    height = canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    nodes = Array.from({ length: 34 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: 1.2 + Math.random() * 1.8
    }));
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('mousemove', (event) => {
    pointer.targetX = event.clientX / window.innerWidth - 0.5;
    pointer.targetY = event.clientY / window.innerHeight - 0.5;
});

function drawCanvas() {
    pointer.x += (pointer.targetX - pointer.x) * 0.05;
    pointer.y += (pointer.targetY - pointer.y) * 0.05;

    context.clearRect(0, 0, width, height);
    context.save();
    context.scale(devicePixelRatio, devicePixelRatio);

    for (const node of nodes) {
        node.x += node.vx + pointer.x * 0.12;
        node.y += node.vy + pointer.y * 0.12;

        if (node.x < -40) node.x = width / devicePixelRatio + 40;
        if (node.x > width / devicePixelRatio + 40) node.x = -40;
        if (node.y < -40) node.y = height / devicePixelRatio + 40;
        if (node.y > height / devicePixelRatio + 40) node.y = -40;

        context.beginPath();
        context.fillStyle = 'rgba(255,255,255,0.7)';
        context.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        context.fill();
    }

    context.restore();
    requestAnimationFrame(drawCanvas);
}

resizeCanvas();
drawCanvas();
loadLiveFeed();
>>>>>>> d32ce80 (feat: kinetic room — PDF analysis, live data, relations)
