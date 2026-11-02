/**
 * =====================================================================
 * ROCK3T WEB OS — CANVAS STUDIO
 * =====================================================================
 */

const ROCK3T_CANVAS = {
  canvas: null,
  ctx: null,
  isDrawing: false,
  currentColor: '#0f172a',
  brushSize: 5,
  undoStack: [],

  onAppOpened() {
    this.canvas = document.getElementById('drawingCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // Ensure high-DPI crisp rendering
    const rect = this.canvas.getBoundingClientRect();
    if (this.canvas.width !== 340) {
      this.canvas.width = 340;
      this.canvas.height = 340;
    }

    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.saveState();

    this.setupEvents();
  },

  setupEvents() {
    if (!this.canvas) return;

    const startDraw = (e) => {
      this.isDrawing = true;
      const pos = this.getPos(e);
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
      this.saveState();
    };

    const draw = (e) => {
      if (!this.isDrawing) return;
      const pos = this.getPos(e);
      this.ctx.strokeStyle = this.currentColor;
      this.ctx.lineWidth = this.brushSize;
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
    };

    const stopDraw = () => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      this.ctx.closePath();
    };

    // Pointer events for unified touch and mouse support
    this.canvas.onpointerdown = startDraw;
    this.canvas.onpointermove = draw;
    this.canvas.onpointerup = stopDraw;
    this.canvas.onpointerleave = stopDraw;
  },

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  },

  setColor(color, element) {
    this.currentColor = color;
    document.querySelectorAll('.color-swatch').forEach((sw) => sw.classList.remove('active'));
    if (element) element.classList.add('active');
  },

  saveState() {
    if (!this.ctx) return;
    this.undoStack.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
    if (this.undoStack.length > 15) this.undoStack.shift();
  },

  undo() {
    if (this.undoStack.length > 1) {
      this.undoStack.pop(); // discard current state
      const prev = this.undoStack[this.undoStack.length - 1];
      this.ctx.putImageData(prev, 0, 0);
    }
  },

  clear() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.undoStack = [];
    this.saveState();
  },

  async saveDrawing() {
    if (!this.canvas) return;
    const dataUrl = this.canvas.toDataURL('image/png');
    try {
      const res = await fetch('/api/rock3t/canvas/save', {
        method: 'POST',
        headers: ROCK3T_OS.getAuthHeaders(),
        body: JSON.stringify({
          title: `Sketch ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          thumbnailUrl: dataUrl,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        ROCK3T_COMPANION?.say("Saved your masterpiece to the archive! 🎨✨");
      }
    } catch (err) {
      console.warn('Save drawing error:', err);
    }
  },

  /**
   * Programmatic drawing by Rocket AI
   */
  drawProgrammaticShape({ shape = 'star', color = '#ff9f1c', x = 170, y = 170, size = 50 }) {
    if (!this.ctx) return;
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.lineWidth = 3;

    if (shape === 'circle') {
      this.ctx.beginPath();
      this.ctx.arc(x, y, size, 0, Math.PI * 2);
      this.ctx.fill();
    } else if (shape === 'rectangle') {
      this.ctx.fillRect(x - size, y - size, size * 2, size * 2);
    } else if (shape === 'pizza') {
      // Draw a delicious pizza slice!
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x - size, y - size * 1.5);
      this.ctx.quadraticCurveTo(x, y - size * 1.7, x + size, y - size * 1.5);
      this.ctx.closePath();
      this.ctx.fillStyle = '#ff9f1c';
      this.ctx.fill();
      // Pepperoni spots
      this.ctx.fillStyle = '#e63946';
      this.ctx.beginPath();
      this.ctx.arc(x, y - size, size * 0.18, 0, Math.PI * 2);
      this.ctx.arc(x - size * 0.3, y - size * 1.2, size * 0.15, 0, Math.PI * 2);
      this.ctx.arc(x + size * 0.3, y - size * 1.2, size * 0.15, 0, Math.PI * 2);
      this.ctx.fill();
    } else if (shape === 'star') {
      // 5-point star
      this.ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const outerAngle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const px = x + Math.cos(outerAngle) * size;
        const py = y + Math.sin(outerAngle) * size;
        if (i === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.closePath();
      this.ctx.fill();
    } else if (shape === 'heart') {
      this.ctx.beginPath();
      this.ctx.moveTo(x, y + size * 0.4);
      this.ctx.bezierCurveTo(x - size, y - size * 0.5, x - size * 0.5, y - size, x, y - size * 0.3);
      this.ctx.bezierCurveTo(x + size * 0.5, y - size, x + size, y - size * 0.5, x, y + size * 0.4);
      this.ctx.fill();
    }

    this.ctx.restore();
    this.saveState();
  },

  async askRocketToDraw() {
    ROCK3T_COMPANION?.say("Hold my pizza! I'm drawing something special with my claws! 🦝🎨");
    const shapes = ['pizza', 'star', 'heart'];
    const randomShape = shapes[Math.floor(Math.random() * shapes.length)];
    const colors = ['#ff9f1c', '#ff006e', '#00b4d8', '#38b000'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    setTimeout(() => {
      this.drawProgrammaticShape({
        shape: randomShape,
        color: randomColor,
        x: 100 + Math.random() * 140,
        y: 100 + Math.random() * 140,
        size: 35 + Math.random() * 25,
      });
      ROCK3T_COMPANION?.say(`Ta-da! Drawn a fresh ${randomShape} for you! 🐾✨`);
    }, 600);
  },
};
