1. Canvas
const canvas = document.getElementById("space");
const ctx = canvas.getContext("2d");

resize();

window.addEventListener("resize", resize);

function resize(){
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
const pdfs = [
  "pdf/dewey.pdf",
  "pdf/bertram.pdf",
  "pdf/beuys.pdf"
];

let fragments = [];

async function loadPDF(url){

  const pdf = await pdfjsLib.getDocument(url).promise;

  let fullText = "";

  for(let i=1; i<=pdf.numPages; i++){

    const page = await pdf.getPage(i);

    const textContent = await page.getTextContent();

    const text = textContent.items
      .map(item => item.str)
      .join(" ");

    fullText += text + " ";
  }

  return fullText;
}

async function initPDFs(){

  for(const pdf of pdfs){

    const text = await loadPDF(pdf);

    const split = text.match(/[^\.!\?]+[\.!\?]+/g);

    if(split){

      split.forEach(sentence => {

        if(sentence.length > 40){

          fragments.push({
            text: sentence.trim(),
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,

            vx: (Math.random()-0.5)*0.2,
            vy: (Math.random()-0.5)*0.2,

            type: "theory"
          });
        }
      });
    }
  }
}

initPDFs();

async function fetchLiveData(){

  const query = "Soziale Plastik";

  const url = `
https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}
`;

  try{

    const res = await fetch(url);

    const data = await res.json();

    const text = data.extract;

    const split = text.match(/[^\.!\?]+[\.!\?]+/g);

    split.forEach(sentence => {

      fragments.push({

        text: sentence,

        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,

        vx:(Math.random()-0.5)*0.5,
        vy:(Math.random()-0.5)*0.5,

        type:"live"
      });

    });

  }catch(err){

    console.log(err);

  }
}

fetchLiveData();

function applyNatureMotion(p){

  const t = Date.now() * 0.001;

  // WASSER
  p.x += Math.sin(t + p.y * 0.01) * 0.2;

  // LUFT
  p.y += Math.cos(t + p.x * 0.01) * 0.1;

  // FEUER
  p.vx += (Math.random()-0.5) * 0.002;

  // ERDE
  p.vx *= 0.995;
  p.vy *= 0.995;

  p.x += p.vx;
  p.y += p.vy;

  // ENDLOSRAUM

  if(p.x > canvas.width + 300) p.x = -300;
  if(p.x < -300) p.x = canvas.width + 300;

  if(p.y > canvas.height + 300) p.y = -300;
  if(p.y < -300) p.y = canvas.height + 300;
}

function drawConnections(){

  for(let i=0; i<fragments.length; i++){

    for(let j=i+1; j<fragments.length; j++){

      const a = fragments[i];
      const b = fragments[j];

      const dx = a.x - b.x;
      const dy = a.y - b.y;

      const dist = Math.sqrt(dx*dx + dy*dy);

      if(dist < 180){

        ctx.beginPath();

        ctx.strokeStyle = "rgba(214,201,74,0.08)";

        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);

        ctx.stroke();
      }
    }
  }
}

function render(){

  ctx.clearRect(0,0,canvas.width,canvas.height);

  drawConnections();

  fragments.forEach(p => {

    applyNatureMotion(p);

    ctx.font = "13px Arial";

    ctx.fillStyle =
      p.type === "live"
      ? "#d6c94a"
      : "#f5f5f5";

    ctx.fillText(
      p.text.substring(0,120),
      p.x,
      p.y
    );
  });

  requestAnimationFrame(render);
}

render();
