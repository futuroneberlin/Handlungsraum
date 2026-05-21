(() => {
    'use strict';

    const canvas = document.getElementById('roomCanvas');
    const context = canvas.getContext('2d', { alpha: false });
    const fontStack = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    const PDF_JS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const PDF_SOURCES = [
        ['pdf/konzeptpapier.pdf'],
        ['pdf/kunstraum.pdf']
    ];
    const BUILD_INTERVAL = 1000; // ms between brick placements
    let pdfBuildCounter = 0;
    const MAX_FRAGMENT_COUNT = 24;
    const MIN_FRAGMENT_COUNT = 12;
    const MAX_PDF_FRAGMENTS = 8;

    const fragments = [];

    const state = {
        width: 0,
        height: 0,
        dpr: Math.min(window.devicePixelRatio || 1, 2)
    };

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

        await loadExternalScript(PDF_JS_URL);

        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
            return window.pdfjsLib;
        }

        throw new Error('PDF.js konnte nicht initialisiert werden');
    }

    function cleanText(text) {
        return text.replace(/\s+/g, ' ').trim();
    }

    function splitIntoFragments(text, sourceLabel) {
        const words = cleanText(text).split(' ').filter(Boolean);
        const chunks = [];
        let current = [];

        for (const word of words) {
            current.push(word);

            if (current.length >= 16) {
                chunks.push(current.join(' '));
                current = [];
            }
        }

        if (current.length) {
            chunks.push(current.join(' '));
        }

        return chunks
            .map((chunk, index) => ({
                text: chunk,
                seed: hashToSeed(`${sourceLabel}-${index}-${chunk}`),
                phase: index * 0.7,
                source: sourceLabel === 'pdf' ? 'pdf' : (sourceLabel === 'live' ? 'live' : undefined),
                buildOrder: sourceLabel === 'pdf' ? (pdfBuildCounter++) : undefined
            }))
            .slice(0, MAX_PDF_FRAGMENTS)
            .filter((fragment) => fragment.text.length > 18);
    }

    function appendFragments(nextFragments) {
        const remainingSlots = Math.max(0, MAX_FRAGMENT_COUNT - fragments.length);
        if (!remainingSlots) return;

        const existing = new Set(fragments.map((f) => (f.text || '').toLowerCase().trim()));
        const filtered = [];
        for (const nf of nextFragments) {
            const key = (nf.text || '').toLowerCase().trim();
            if (existing.has(key)) continue;
            existing.add(key);
            filtered.push(nf);
            if (filtered.length >= remainingSlots) break;
        }

        fragments.push(...filtered.slice(0, remainingSlots));
    }

    function ensureMinimumFragments() {
        return fragments.length > 0;
    }

    function hashToSeed(value) {
        let hash = 0;
        for (let index = 0; index < value.length; index += 1) {
            hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
        }

        return Math.abs(hash) / 1000000;
    }

    async function extractPdfFragments() {
        try {
            console.log('[PDF] extractPdfFragments:start');
            const pdfjsLib = await ensurePdfJs();
            console.log('[PDF] pdfjsLib:ready', Boolean(pdfjsLib));

            for (const sources of PDF_SOURCES) {
                console.log('[PDF] sources:start', sources);
                const pageTexts = [];

                for (const pdfPath of sources) {
                    try {
                        console.log('[PDF] loader:before', pdfPath);
                        const loadingTask = pdfjsLib.getDocument({ url: pdfPath, useWorkerFetch: false });
                        const pdf = await loadingTask.promise;
                        const pageCount = Number(pdf?.numPages) || 0;
                        console.log('[PDF] loaded', pdfPath, { numPages: pdf.numPages, pageCount });

                        if (!pageCount) {
                            console.warn('[PDF] no-pages', pdfPath);
                            continue;
                        }

                        for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
                            try {
                                const page = await pdf.getPage(pageIndex);
                                const content = await page.getTextContent();
                                const pageText = content.items.map((item) => item.str).join(' ');
                                pageTexts.push(pageText);
                                console.log('[PDF] page:text', pdfPath, { pageIndex, pageTextLength: pageText.length, collectedPages: pageTexts.length, pageText });
                            } catch (pageError) {
                                console.error('[PDF] page/error', pdfPath, { pageIndex, pageError });
                            }
                        }

                        break;
                    } catch (error) {
                        console.error('[PDF] load/error', pdfPath, error);
                    }
                }

                const rawText = pageTexts.join(' ');

                console.log('[PDF] rawText', rawText);

                if (rawText.trim()) {
                    const pdfFragments = splitIntoFragments(rawText, 'pdf');
                    console.log('[PDF] fragments:prepared', pdfFragments.length);
                    appendFragments(pdfFragments);
                    console.log('[PDF] fragments:length-after-append', fragments.length);
                } else {
                    console.log('[PDF] no-text-for-source-group', sources);
                }
            }
        } catch (error) {
            console.error('[PDF] extractPdfFragments:outer-error', error);
            // Fallback: vorhandene Raumfragmente bleiben sichtbar.
        }
    }

    function resize() {
        state.width = Math.max(1, window.innerWidth);
        state.height = Math.max(1, window.innerHeight);
        state.dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(state.width * state.dpr);
        canvas.height = Math.floor(state.height * state.dpr);
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;
        context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    }

    function seedToValue(seed, offset) {
        const value = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453;
        return value - Math.floor(value);
    }

    function initialize() {
        const cols = Math.max(3, Math.ceil(Math.sqrt(fragments.length)));
        const rows = Math.max(2, Math.ceil(fragments.length / cols));
        const cellW = state.width / cols;
        const cellH = state.height / rows;

        fragments.forEach((fragment, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            fragment.gridIndex = index;
            fragment.gridX = col;
            fragment.gridY = row;
            fragment.baseX = (col + 0.5) * cellW;
            fragment.baseY = (row + 0.5) * cellH;
            fragment.offsetX = 0;
            fragment.offsetY = 0;
            fragment.x = fragment.baseX;
            fragment.y = fragment.baseY;
            fragment.vx = (seedToValue(fragment.seed, 3) - 0.5) * 0.10;
            fragment.vy = (seedToValue(fragment.seed, 4) - 0.5) * 0.08;
        });
        // mark build start time for brick-by-brick reveal
        state.buildStart = performance.now();
    }

    function wrap(value, limit) {
        if (value < -120) {
            return limit + 120;
        }

        if (value > limit + 120) {
            return -120;
        }

        return value;
    }

    function drawBackground(time) {
        context.fillStyle = '#000000';
        context.fillRect(0, 0, state.width, state.height);
    }

    function applyMotion(fragment, time) {
        fragment.x = fragment.baseX;
        fragment.y = fragment.baseY;
    }

    function wrapText(text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            const candidate = currentLine ? `${currentLine} ${word}` : word;
            if (context.measureText(candidate).width <= maxWidth || !currentLine) {
                currentLine = candidate;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines;
    }

    function drawFragment(fragment, time) {
        const size = 18;
        const lineHeight = Math.max(24, size * 1.4);
        const maxWidth = Math.min(320, Math.max(160, state.width * 0.22));
        context.font = `400 ${size}px ${fontStack}`;
        context.fillStyle = `rgba(243, 241, 234, 0.86)`;
        // If this fragment is a PDF brick with a build order, only draw it when its time has come
        if (fragment.source === 'pdf' && typeof fragment.buildOrder === 'number') {
            const start = state.buildStart || 0;
            if (time < start + fragment.buildOrder * BUILD_INTERVAL) {
                return; // not yet placed
            }
        }

        const lines = wrapText(fragment.text, maxWidth);
        const totalHeight = (lines.length - 1) * lineHeight;
        let y = fragment.y - (totalHeight * 0.5);
        for (const line of lines) {
            context.fillText(line, fragment.x, y);
            y += lineHeight;
        }
    }

    function render(time) {
        drawBackground(time);

        for (const fragment of fragments) {
            applyMotion(fragment, time);
            drawFragment(fragment, time);
        }

        requestAnimationFrame(render);
    }

    window.addEventListener('resize', () => {
        resize();
        initialize();
    }, { passive: true });

    resize();
    console.log('[PDF] chain:before-extract', { fragmentsLength: fragments.length });
    extractPdfFragments().then(() => {
        console.log('[PDF] chain:after-extract', { fragmentsLength: fragments.length });

        if (!ensureMinimumFragments()) {
            console.warn('[PDF] no-pdf-fragments-after-load');
            return;
        }

        initialize();
        console.log('[PDF] chain:completed', { fragmentsLength: fragments.length });
        requestAnimationFrame(render);
    });
})();