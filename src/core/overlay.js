// overlay.js — reusable canvas that draws glowing hand skeletons.
// Mirroring is done by CSS on the parent stage, so we always draw in raw coordinates.

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // index
  [5, 9], [9, 10], [10, 11], [11, 12],     // middle
  [9, 13], [13, 14], [14, 15], [15, 16],   // ring
  [13, 17], [17, 18], [18, 19], [19, 20],  // pinky
  [0, 17],                                  // palm edge
];
const TIPS = [4, 8, 12, 16, 20];
const COLORS = ['#19f3ff', '#ff2fd0'];

export function createOverlay(canvas, video) {
  const ctx = canvas.getContext('2d');

  function fit() {
    const w = video.videoWidth || 640, h = video.videoHeight || 480;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  return {
    clear() { fit(); ctx.clearRect(0, 0, canvas.width, canvas.height); },

    /** Draw every hand. `hands` is the array from HandTracker results. */
    draw(hands) {
      this.clear();
      const W = canvas.width, H = canvas.height;
      const scale = W / 640;
      hands.forEach((hand, idx) => {
        const color = COLORS[idx % COLORS.length];
        const p = hand.landmarks.map((l) => [l.x * W, l.y * H]);

        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 18 * scale;
        ctx.lineWidth = 3 * scale;
        ctx.beginPath();
        CONNECTIONS.forEach(([a, b]) => { ctx.moveTo(...p[a]); ctx.lineTo(...p[b]); });
        ctx.stroke();

        ctx.fillStyle = '#fff';
        p.forEach(([x, y], i) => {
          ctx.beginPath();
          ctx.arc(x, y, (TIPS.includes(i) ? 6 : 3.5) * scale, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.shadowBlur = 0;
      });
    },
  };
}
