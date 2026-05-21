const canvas = document.getElementById("space");

const ctx = canvas.getContext("2d");

function resize(){

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

}

resize();

window.addEventListener("resize", resize);





const pdfs = [

"pdf/kunst.pdf",
"pdf/konzeptpapier.pdf"

];





let fragments = [];





async function loadPDF(url){

const pdf = await pdfjsLib.getDocument(url).promise;

let fullText = "";

for(let i = 1; i <= pdf.numPages; i++){

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

try{

const text = await loadPDF(pdf);

const split =
text.match(/[^\.!\?]+[\.!\?]+/g) || [];

split.forEach(sentence => {

if(sentence.length > 40){

fragments.push({

text: sentence.trim(),

x: Math.random() * canvas.width,
y: Math.random() * canvas.height,

vx:(Math.random()-0.5)*0.3,
vy:(Math.random()-0.5)*0.3,

type:"theory"

});

}

});

}catch(err){

console.log("PDF ERROR:", err);

}

}

}





async function fetchLiveData(){

try{

const res = await fetch(
"https://en.wikipedia.org/api/rest_v1/page/summary/Social_sculpture"
);

const data = await res.json();

if(!data.extract) return;

const split =
data.extract.match(/[^\.!\?]+[\.!\?]+/g) || [];

split.forEach(sentence => {

fragments.push({

text: sentence,

x: Math.random() * canvas.width,
y: Math.random() * canvas.height,

vx:(Math.random()-0.5)*0.5,
vy:(Math.random()-0.5)*0.5,

type:"live"

});

});

}catch(err){

console.log("LIVE DATA ERROR:", err);

}

}





function applyNatureMotion(p){

const t = Date.now() * 0.001;





/* WASSER */

p.x += Math.sin(t + p.y * 0.01) * 0.15;





/* LUFT */

p.y += Math.cos(t + p.x * 0.01) * 0.08;





/* FEUER */

p.vx += (Math.random()-0.5) * 0.002;
p.vy += (Math.random()-0.5) * 0.002;





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

ctx.lineTo(b.x, b.y);

ctx.stroke();

}

}

}

}





function render(){

ctx.clearRect(0,0,canvas.width,canvas.height);





if(!fragments.length){

ctx.fillStyle = "#777";

ctx.font = "14px Arial";

ctx.fillText(
"HANDLUNGSRAUM INITIALISIERT...",
40,
40
);

requestAnimationFrame(render);

return;

}





drawConnections();





fragments.forEach(p => {

applyNatureMotion(p);

ctx.font = "13px Arial";

ctx.fillStyle =
p.type === "live"
? "#d6c94a"
: "#f3f3f3";

ctx.fillText(
p.text.substring(0,120),
p.x,
p.y
);

});





if(fragments.length > 80){

fragments = fragments.slice(-80);

}





requestAnimationFrame(render);

}





async function boot(){

await initPDFs();

await fetchLiveData();

render();

}





boot();
