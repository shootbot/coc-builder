import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InventoryPanelComponent } from './inventory-panel.component';
import { BoardComponent } from './board.component';
import { BuildingSpec, DEFAULT_SPECS, InventoryState, PlacedBuilding } from './types';
import { BoardPlaceEvent, BoardMoveEvent } from './types';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, InventoryPanelComponent, BoardComponent],
  template: `
    <div class="app">
      <div class="panel">
        <h2>Здания</h2>
        <app-inventory-panel
          [inventory]="inventory()"
          (dragStart)="onStartDrag($event)"></app-inventory-panel>
        <div class="hint">ЛКМ — поставить/переместить; ПКМ по зданию — удалить; Клик — показать радиус.</div>
      </div>
      <div class="panel board-wrap">
        <div class="toolbar">
          <button (click)="reset()">Очистить</button>
          <button (click)="exportLayout()">Экспорт</button>
          <button (click)="importLayout()">Импорт</button>
        </div>
        <app-board class="canvas"
          [gridSize]="60"
          [tile]="tile"
          [placed]="placed()"
          [dragGhost]="dragGhost()"
          (place)="onPlace($event)"
          (move)="onMove($event)"
          (remove)="onRemove($event)"
          (select)="onSelect($event)"
          (cancelDrag)="dragGhost.set(null)"
          (expand)="onExpand($event)">
        </app-board>
      </div>
    </div>
  `,
})
export class AppComponent {
  tile = 22; // base tile pixel size (half-width of a diamond)

  specs: Record<string, BuildingSpec> = DEFAULT_SPECS;
  inventory = signal<InventoryState>(this.initInventory());
  placed = signal<PlacedBuilding[]>([]);
  dragGhost = signal<PlacedBuilding | null>(null);
  // id стены, от которой будем достраивать дальше
private currentWallAnchorId: string | null = null;


  gridSize = 60;

  onExpand(ev: { id: string; dir: 'N'|'E'|'S'|'W' }) {
  console.log('[expand] requested', ev);

  // базовая стена: сперва пробуем текущий якорь, иначе — та, по которой пришло событие
  const getById = (id: string | null) => this.placed().find(b => b.id === id);
  let base = getById(this.currentWallAnchorId) || this.placed().find(b => b.id === ev.id);

  if (!base || base.cls !== 'wall' || base.size !== 1) {
    console.log('[expand] base not a 1x1 wall, ignore');
    return;
  }

  const inv = structuredClone(this.inventory());
  const left = inv['wall100']?.count ?? 0;
  if (left <= 0) { console.log('[expand] no walls left'); return; }

  let dx = 0, dy = 0;
  if (ev.dir === 'N') dy = -1;
  else if (ev.dir === 'S') dy = 1;
  else if (ev.dir === 'E') dx = 1;
  else dx = -1;

  // Пытаемся поставить до 2 стен от ТЕКУЩЕГО base
  const placedNow: PlacedBuilding[] = [];
  let nx = base.x, ny = base.y;

  for (let step = 1; step <= 2; step++) {
    nx += dx;
    ny += dy;
    if (placedNow.length < left && this.isFree(nx, ny, 1)) {
      const wall: PlacedBuilding = {
        id: crypto.randomUUID(),
        key: 'wall100',
        x: nx, y: ny,
        size: 1, radius: 0, cls: 'wall',
        selected: false,
      };
      placedNow.push(wall);
    } else {
      console.log('[expand] blocked or no stock at step', step, 'at', nx, ny);
      break;
    }
  }

  if (!placedNow.length) { console.log('[expand] nothing placed'); return; }

  // Добавляем стены на поле
  this.placed.set([...this.placed(), ...placedNow]);

  // Обновляем инвентарь
  inv['wall100'].count = Math.max(0, left - placedNow.length);
  this.inventory.set(inv);

  // Новый якорь — ПОСЛЕДНЯЯ поставленная стена
  const newAnchor = placedNow[placedNow.length - 1].id;
  this.currentWallAnchorId = newAnchor;

  // Перевыделяем «текущую стену», чтобы стрелки были вокруг неё
  this.placed.set(this.placed().map(b => ({
    ...b,
    selected: b.id === newAnchor,
  })));

  console.log('[expand] placed', placedNow.length, 'wall(s). new anchor =', newAnchor);
}


  // вспомогательная проверка занятости
  private isFree(x: number, y: number, size: number) {
    if (x < 0 || y < 0 || x + size > this.gridSize || y + size > this.gridSize) return false;
    for (const b of this.placed()) {
      if (x < b.x + b.size && x + size > b.x && y < b.y + b.size && y + size > b.y) {
        return false;
      }
    }
    return true;
  }

  initInventory(): InventoryState {
    return {
      wall100: { name: 'wall100', size: 1, count: 100, radius: 0, cls: 'wall' },
      tower: { name: 'tower', size: 3, count: 4, radius: 7, cls: 'tower' },
      cannon: { name: 'cannon', size: 3, count: 4, radius: 5, cls: 'cannon' },
      mortar: { name: 'mortar', size: 3, count: 3, radius: 11, cls: 'mortar' },
      sorcery: { name: 'sorcery tower', size: 3, count: 2, radius: 4, cls: 'sorcery' },
      tesla: { name: 'tesla tower', size: 2, count: 2, radius: 3, cls: 'tesla' },
      mine: { name: 'mine', size: 3, count: 10, radius: 0, cls: 'mine' },
      townhall: { name: 'townhall', size: 4, count: 1, radius: 0, cls: 'th' },
      antiair: { name: 'anti air', size: 3, count: 3, radius: 8, cls: 'aa' },
    };
  }

  onStartDrag(specKey: string) {
    const inv = structuredClone(this.inventory());
    const spec = inv[specKey];
    if (!spec || spec.count <= 0) return;
    // create a ghost at (0,0) initially; actual position is set by board mousemove
    this.dragGhost.set({ id: 'ghost', key: specKey, x: 0, y: 0, size: spec.size, radius: spec.radius, cls: spec.cls, selected: false });
  }

  onPlace(evt: BoardPlaceEvent) {
    // If placing a new ghost, decrement inventory, then persist as PlacedBuilding
    if (evt.id.startsWith('ghost')) {
      const inv = structuredClone(this.inventory());
      inv[evt.key].count -= 1;
      this.inventory.set(inv);

      const pb: PlacedBuilding = {
        id: crypto.randomUUID(),
        key: evt.key,
        x: evt.x,
        y: evt.y,
        size: evt.size,
        radius: evt.radius,
        cls: evt.cls,
        selected: false,
      };
      this.placed.set([...this.placed(), pb]);
      this.dragGhost.set(null);
      return;
    }

    const updated: PlacedBuilding = {
      id: evt.id,
      key: evt.key,
      x: evt.x,
      y: evt.y,
      size: evt.size,
      radius: evt.radius,
      cls: evt.cls,
      selected: this.placed().find(b => b.id === evt.id)?.selected ?? false,
    };
    this.placed.set(this.placed().map(b => (b.id === updated.id ? updated : b)));
    this.dragGhost.set(null);

  }

  onMove(evt: BoardMoveEvent) {
    // live preview while dragging existing or ghost
    const selected =
      (this.dragGhost()?.selected) ??
      this.placed().find(b => b.id === evt.id)?.selected ??
      false;

    const ghost: PlacedBuilding = {
      id: evt.id,
      key: evt.key,
      x: evt.x,
      y: evt.y,
      size: evt.size,
      radius: evt.radius,
      cls: evt.cls,
      selected,
    };
    this.dragGhost.set(ghost);
  }

  onRemove(id: string){
  const list = this.placed();
  const idx = list.findIndex(b => b.id === id);
  if (idx >= 0){
    const b = list[idx];
    const inv = structuredClone(this.inventory());
    inv[b.key].count += 1;
    this.inventory.set(inv);

    const next = [...list];
    next.splice(idx, 1);
    this.placed.set(next);

    // если удалили текущий якорь — сбросить
    if (this.currentWallAnchorId === id) this.currentWallAnchorId = null;
  }
}


 onSelect(id: string){
  // переключаем выделение (как и раньше)
  const next = this.placed().map(b => ({ ...b, selected: b.id === id ? !b.selected : false }));
  this.placed.set(next);

  // найдём тот, что сейчас выделен
  const sel = next.find(b => b.selected);
  if (sel && sel.cls === 'wall' && sel.size === 1) {
    // выбранная стена становится якорем
    this.currentWallAnchorId = sel.id;
  } else {
    // сняли выделение — сбрасываем якорь
    this.currentWallAnchorId = null;
  }
}


  reset() {
    // return everything
    this.inventory.set(this.initInventory());
    this.placed.set([]);
    this.dragGhost.set(null);
  }

  exportLayout() {
    const data = { placed: this.placed() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'layout.json'; a.click();
    URL.revokeObjectURL(url);
  }

  importLayout() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = () => {
      const f = input.files?.[0]; if (!f) return;
      f.text().then(t => {
        const data = JSON.parse(t);
        if (Array.isArray(data.placed)) {
          // rebuild inventory counts based on placed
          const inv = this.initInventory();
          for (const b of data.placed) { inv[b.key].count -= 1; }
          this.inventory.set(inv);
          this.placed.set(data.placed.map((b: any) => ({ ...b, selected: false })));
        }
      });
    };
    input.click();
  }
}
