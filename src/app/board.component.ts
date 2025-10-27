import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BoardMoveEvent, BoardPlaceEvent, PlacedBuilding } from './types';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule],
  template: `
    <canvas #cv (contextmenu)="$event.preventDefault()" tabindex="0"></canvas>
  `,
  styles: [`
  :host{
    display:block;
    width:100%;
    height:100%;      /* хост <app-board> тянется по flex */
  }
  canvas{
    width:100%;
    height:100%;      /* сам <canvas> заполняет хост */
    display:block;
    outline:none;
  }
`]

})
export class BoardComponent implements OnInit, OnDestroy, OnChanges {
  @Input() gridSize = 60;
  @Input() tile = 15;
  @Input() placed: PlacedBuilding[] = [];
  @Input() dragGhost: PlacedBuilding | null = null;

  @Output() place = new EventEmitter<BoardPlaceEvent>();
  @Output() move = new EventEmitter<BoardMoveEvent>();
  @Output() remove = new EventEmitter<string>();
  @Output() select = new EventEmitter<string>();
  @Output() cancelDrag = new EventEmitter<void>();
  @Output() expand = new EventEmitter<{ id: string; dir: 'N' | 'E' | 'S' | 'W' }>();

  @ViewChild('cv', { static: true }) cvRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private raf = 0;
  private dpr = Math.max(1, window.devicePixelRatio || 1);
  // hover по стрелке возле выбранной стены
  private arrowHover: { id: string; dir: 'N' | 'E' | 'S' | 'W' } | null = null;
  // чтобы печатать enter/leave ровно один раз
  private lastArrowHoverKey: string | null = null; // формат `${id}:${dir}`


  // interaction
  private hoveringId: string | null = null;
  private draggingId: string | null = null; // building being moved; 'ghost' when placing new

  // occupancy grid
  private occ: (string | null)[][] = [];

  ngOnInit() {
    this.ctx = this.cvRef.nativeElement.getContext('2d')!;
    this.resizeCanvas();
    this.initOcc();
    this.loop();

    window.addEventListener('resize', this.resizeCanvas);
  }

  ngOnChanges(ch: SimpleChanges) {
    if (ch['gridSize']) this.initOcc();
    // rebuild occupancy from placed array
    this.rebuildOcc();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resizeCanvas);
  }

  private resizeCanvas = () => {
    const el = this.cvRef.nativeElement;
    const rect = el.getBoundingClientRect();
    // физический размер холста в device pixels
    el.width = Math.max(300, rect.width) * this.dpr;
    el.height = Math.max(300, rect.height) * this.dpr;
    // рисуем в координатах CSS-пикселей
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };


  private initOcc() {
    this.occ = Array.from({ length: this.gridSize }, () => Array(this.gridSize).fill(null));
  }
  private rebuildOcc() {
    this.initOcc();
    for (const b of this.placed) { this.markOcc(b, b.id); }
  }

  private loop = () => { this.draw(); this.raf = requestAnimationFrame(this.loop); };

  private gridToScreen(x: number, y: number) {
    const t = this.tile; // половина ширины тайла
    const cwCss = this.cvRef.nativeElement.width / this.dpr; // CSS-пиксели
    const topPad = 50; // CSS-пиксели (без умножения на dpr)
    const sx = (x - y) * t + cwCss / 2;
    const sy = (x + y) * t * 0.5 + topPad;
    return { x: sx, y: sy };
  }

  private screenToGrid(px: number, py: number) {
    const t = this.tile;
    const cwCss = this.cvRef.nativeElement.width / this.dpr; // CSS-пиксели
    const topPad = 50; // CSS-пиксели
    const sx = px - cwCss / 2;
    const sy = py - topPad;
    const gx = (sx / t + (sy / (t * 0.5))) / 2;
    const gy = ((sy / (t * 0.5)) - sx / t) / 2;
    return { x: gx, y: gy };
  }


  // ===== Occupancy =====
  private canPlace(x: number, y: number, size: number, skipId?: string) {
    if (x < 0 || y < 0 || x + size > this.gridSize || y + size > this.gridSize) return false;
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
      const id = this.occ[y + j][x + i];
      if (id && id !== skipId) return false;
    }
    return true;
  }
  private markOcc(b: PlacedBuilding, id: string | null) {
    for (let i = 0; i < b.size; i++) for (let j = 0; j < b.size; j++) {
      this.occ[b.y + j][b.x + i] = id;
    }
  }

  // ===== Mouse handling =====
  @HostListener('mousemove', ['$event'])
  onMoveMouse(ev: MouseEvent) {
    const { left, top } = this.cvRef.nativeElement.getBoundingClientRect();
    const mx = (ev.clientX - left);  // CSS-пиксели
    const my = (ev.clientY - top);   // CSS-пиксели

    // 0) hover по стрелкам у выбранной 1×1 стены
    const selectedWall = this.placed.find(bb => bb.selected && bb.cls === 'wall' && bb.size === 1);
    if (selectedWall) {
      const rects = this.wallArrowRects(selectedWall);
      const hit = rects.find(r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h);
      const newKey = hit ? `${selectedWall.id}:${hit.dir}` : null;

      if (newKey !== this.lastArrowHoverKey) {
        if (this.lastArrowHoverKey && !newKey) {
          console.log('[arrows] leave', this.lastArrowHoverKey);
        }
        if (newKey && !this.lastArrowHoverKey) {
          console.log('[arrows] enter', newKey);
        }
        this.lastArrowHoverKey = newKey;
      }

      this.arrowHover = hit ? { id: selectedWall.id, dir: hit.dir } : null;
      // курсор-указатель над стрелкой
      (this.cvRef.nativeElement as HTMLCanvasElement).style.cursor = hit ? 'pointer' : (this.draggingId ? 'grabbing' : 'default');
    } else {
      if (this.lastArrowHoverKey) {
        console.log('[arrows] leave', this.lastArrowHoverKey);
        this.lastArrowHoverKey = null;
      }
      this.arrowHover = null;
      (this.cvRef.nativeElement as HTMLCanvasElement).style.cursor = this.draggingId ? 'grabbing' : 'default';
    }

    if (this.draggingId) {
      // moving existing or ghost
      const src = this.draggingId === 'ghost' && this.dragGhost ? this.dragGhost : this.placed.find(b => b.id === this.draggingId)!;
      const size = src.size;
      const g = this.screenToGrid(mx, my);
      const nx = Math.max(0, Math.min(this.gridSize - size, Math.round(g.x - size / 2)));
      const ny = Math.max(0, Math.min(this.gridSize - size, Math.round(g.y - size / 2)));

      const moving: PlacedBuilding = { ...src, x: nx, y: ny };
      this.move.emit(moving);
      return;
    }

    // hover detection
    this.hoveringId = this.findAt(mx, my);
  }

  @HostListener('mousedown', ['$event'])
  onDown(ev: MouseEvent) {
    const { left, top } = this.cvRef.nativeElement.getBoundingClientRect();
    const mx = (ev.clientX - left);
    const my = (ev.clientY - top);

    // 0) клик по стрелке (если есть hover)
    if (this.arrowHover) {
      console.log('[arrows] click', this.arrowHover.id, this.arrowHover.dir);
      this.expand.emit({ id: this.arrowHover.id, dir: this.arrowHover.dir });
      // не запускаем drag, не трогаем здания
      return;
    }


    if (ev.button === 2) { // right click -> delete if on building
      const id = this.findAt(mx, my);
      if (id) { this.remove.emit(id); this.cancelDrag.emit(); }
      return;
    }

    if (this.dragGhost && this.dragGhost.id === 'ghost') {
      // реально ставим новый из инвентаря
      this.draggingId = 'ghost';
      return;
    }

    // если выделена стена и клик попал по стрелке — шлём expand
    const selectedWall = this.placed.find(bb => bb.selected && bb.cls === 'wall' && bb.size === 1);
    if (selectedWall) {
      const rects = this.wallArrowRects(selectedWall);
      const hit = rects.find(r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h);
      if (hit) {
        this.expand.emit({ id: selectedWall.id, dir: hit.dir });
        // не начинаем drag
        return;
      }
    }


    // start dragging existing if clicked on it
    const id = this.findAt(mx, my);
    if (id) {
      this.draggingId = id;
      this.select.emit(id);
      // mark its cells free while moving
      const b = this.placed.find(bb => bb.id === id)!;
      this.markOcc(b, null);
    }
  }

  @HostListener('mouseup', ['$event'])
  onUp(ev: MouseEvent) {
    if (!this.draggingId) return;

    const src = this.draggingId === 'ghost' && this.dragGhost ? this.dragGhost : this.placed.find(b => b.id === this.draggingId)!;
    const target = this.dragGhost!; // last move preview
    const skipId = this.draggingId === 'ghost' ? undefined : src.id;

    if (target && this.canPlace(target.x, target.y, src.size, skipId)) {
      // finalize
      if (this.draggingId !== 'ghost') this.markOcc({ ...target, id: src.id }, src.id);
      this.place.emit({ ...target, id: this.draggingId, key: src.key, size: src.size, radius: src.radius, cls: src.cls });
    } else {
      // revert if moving existing
      if (this.draggingId !== 'ghost') this.markOcc(src, src.id);
      this.cancelDrag.emit();
    }

    this.cancelDrag.emit(); // очистить dragGhost у родителя
    this.draggingId = null;
  }

  @HostListener('mouseleave') onLeave() { if (this.draggingId) { this.draggingId = null; this.cancelDrag.emit(); this.rebuildOcc(); } }

  private findAt(px: number, py: number): string | null {
    // идём с конца массива, чтобы попадать по верхним объектам
    for (let i = this.placed.length - 1; i >= 0; i--) {
      const b = this.placed[i];

      const halfW = this.tile * b.size;
      const halfH = this.tile * b.size * 0.5;
      const c = this.gridToScreen(b.x + b.size / 2, b.y + b.size / 2);

      // грубая AABB вокруг ромба — достаточно точно для кликов/hover
      if (px > c.x - halfW && px < c.x + halfW && py > c.y - halfH && py < c.y + halfH) {
        return b.id;
      }
    }
    return null;
  }


  // ===== Draw =====
  private draw() {
    const ctx = this.ctx; const cw = this.cvRef.nativeElement.width; const ch = this.cvRef.nativeElement.height;
    ctx.clearRect(0, 0, cw, ch);

    // grid
    this.drawGrid();

    // placed buildings
    for (const b of this.placed) { this.drawBuilding(b, false); if (b.selected && b.radius > 0) this.drawRadius(b); }

    // dragging preview (ghost)
    if (this.dragGhost) { this.drawBuilding(this.dragGhost, true); if (this.draggingId === 'ghost' && this.dragGhost.radius > 0) this.drawRadius(this.dragGhost, true); }
  }

  private drawGrid() {

    const ctx = this.ctx; const N = this.gridSize; const t = this.tile; ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = '#1b2230';
    for (let y = 0; y < N; y++) {
      const a = this.gridToScreen(0, y); const b = this.gridToScreen(N, y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let x = 0; x < N; x++) {
      const a = this.gridToScreen(x, 0); const b = this.gridToScreen(x, N);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  private drawBuilding(b: PlacedBuilding, ghost: boolean) {
    const ctx = this.ctx;
    const t = this.tile;

    // полуразмеры ромба footprint'а size×size в изометрии (соотношение 2:1)
    const halfW = t * b.size;         // полу-ширина по X
    const halfH = t * b.size * 0.5;   // полу-высота по Y (ВАЖНО!)

    // центр footprint'а — середина квадрата size×size в координатах сетки
    const c = this.gridToScreen(b.x + b.size / 2, b.y + b.size / 2);

    ctx.save();
    ctx.globalAlpha = ghost ? 0.6 : 1.0;

    // Рисуем ромб по четырём вершинам (верх-право-низ-лево)
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - halfH);         // верх
    ctx.lineTo(c.x + halfW, c.y);         // право
    ctx.lineTo(c.x, c.y + halfH);         // низ
    ctx.lineTo(c.x - halfW, c.y);         // лево
    ctx.closePath();
    ctx.fillStyle = this.colorFor(b.cls);
    ctx.strokeStyle = '#202a38';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // маленькая «вышка» в центре для наглядности
    const towerH = Math.max(8, t * b.size * 0.6)
    const towerW = t * b.size * 0.72;
    ctx.fillStyle = '#0b1018';
    ctx.fillRect(c.x - towerW / 2, c.y - towerH * 0.4, towerW, towerH * 0.3);

    // аббревиатура
    ctx.fillStyle = '#e7ebf3';
    ctx.font = `12px ui-sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.abbrev(b), c.x, c.y);

    // hover-обводка
    if (this.hoveringId === b.id) {
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - halfH);
      ctx.lineTo(c.x + halfW, c.y);
      ctx.lineTo(c.x, c.y + halfH);
      ctx.lineTo(c.x - halfW, c.y);
      ctx.closePath();
      ctx.strokeStyle = '#57dcfd';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    if (b.selected && b.cls === 'wall' && b.size === 1) {
      this.drawWallArrows(b);
    }

    ctx.restore();
  }


  private drawRadius(b: PlacedBuilding, ghost = false) {
    if (b.radius <= 0) return;

    const t = this.tile;
    const center = this.gridToScreen(b.x + b.size / 2, b.y + b.size / 2);

    // Эллипс: горизонтальный радиус = R*t, вертикальный = R*t*0.5
    const rx = b.radius * t * 1.414;
    const ry = b.radius * t * 0.5 * 1.414;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = ghost ? 0.35 : 0.18;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#57dcfd';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2aa5c7';
    ctx.stroke();
    ctx.restore();
  }

  private colorFor(cls: string) {
    switch (cls) {
      case 'wall': return '#394050';
      case 'tower': return '#3a6ff2';
      case 'cannon': return '#c95b3d';
      case 'mortar': return '#8a6cff';
      case 'sorcery': return '#e46ad2';
      case 'tesla': return '#38e0b9';
      case 'mine': return '#8b9aa7';
      case 'th': return '#fdcb57';
      case 'aa': return '#57dcfd';
      default: return '#6b7c8f';
    }
  }
  private abbrev(b: PlacedBuilding) { return b.key.split(' ').map(s => s[0]).join('').toUpperCase(); }

  // экранные прямоугольники для хит-теста стрелок
  private wallArrowRects(b: PlacedBuilding) {
    // центр 1×1 стены
    const c = this.gridToScreen(b.x + 0.5, b.y + 0.5);
    const halfW = this.tile;         // полу-ширина ромба 1×1 по X
    const halfH = this.tile * 0.5;   // полу-высота по Y

    // куда рисуем хит-зоны (прямоугольники), немного отступив от ромба
    const padX = halfW + 10;
    const padY = halfH + 10;

    const size = 24; // размер квадрата хит-зоны, чтобы легко попасть
    return [
      { dir: 'N' as const, x: c.x - size / 2, y: c.y - padY - size, w: size, h: size },
      { dir: 'E' as const, x: c.x + padX, y: c.y - size / 2, w: size, h: size },
      { dir: 'S' as const, x: c.x - size / 2, y: c.y + padY, w: size, h: size },
      { dir: 'W' as const, x: c.x - padX - size, y: c.y - size / 2, w: size, h: size },
    ];
  }


  private drawWallArrows(b: PlacedBuilding) {
    const ctx = this.ctx;
    const rects = this.wallArrowRects(b);

    ctx.save();
    for (const r of rects) {
      const hovering = this.arrowHover && this.arrowHover.id === b.id && this.arrowHover.dir === r.dir;

      // фон хит-зоны (полупрозрачный, чтобы было видно куда целиться)
      ctx.globalAlpha = hovering ? 0.35 : 0.15;
      ctx.fillStyle = '#2aa5c7';
      ctx.fillRect(r.x, r.y, r.w, r.h);

      // треугольник-стрелка
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, s = Math.min(r.w, r.h) * 0.9;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      if (r.dir === 'N') {
        ctx.moveTo(cx, cy - s * 0.45);
        ctx.lineTo(cx - s * 0.35, cy + s * 0.25);
        ctx.lineTo(cx + s * 0.35, cy + s * 0.25);
      } else if (r.dir === 'E') {
        ctx.moveTo(cx + s * 0.45, cy);
        ctx.lineTo(cx - s * 0.25, cy - s * 0.35);
        ctx.lineTo(cx - s * 0.25, cy + s * 0.35);
      } else if (r.dir === 'S') {
        ctx.moveTo(cx, cy + s * 0.45);
        ctx.lineTo(cx - s * 0.35, cy - s * 0.25);
        ctx.lineTo(cx + s * 0.35, cy - s * 0.25);
      } else { // W
        ctx.moveTo(cx - s * 0.45, cy);
        ctx.lineTo(cx + s * 0.25, cy - s * 0.35);
        ctx.lineTo(cx + s * 0.25, cy + s * 0.35);
      }
      ctx.closePath();
      ctx.fillStyle = hovering ? '#57dcfd' : '#2aa5c7';
      ctx.fill();
    }
    ctx.restore();
  }


}
