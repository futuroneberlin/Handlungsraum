const space = document.getElementById("space");

const onMove = (event) => {
  const x = (event.clientX / window.innerWidth - 0.5) * 8;
  const y = (event.clientY / window.innerHeight - 0.5) * -8;
  space.style.transform = `rotateY(${x}deg) rotateX(${y}deg)`;
};

window.addEventListener("pointermove", onMove);

window.addEventListener("pointerleave", () => {
  space.style.transform = "rotateY(0deg) rotateX(0deg)";
});
