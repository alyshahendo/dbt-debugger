class Viewport {
  constructor(model){
    this.model = model;
    this.canvas = document.getElementById('canvas');
    this.wrap = document.getElementById('canvaswrap');
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this._setup();
  }

  apply(){
    this.canvas.style.transform = 'translate('+this.panX+'px,'+this.panY+'px) scale('+this.zoom+')';
    document.getElementById('zoomReset').textContent = Math.round(this.zoom*100)+'%';
  }

  zoomTo(z, ox, oy){
    z = Math.max(ZMIN, Math.min(ZMAX, z));
    const r = this.wrap.getBoundingClientRect();
    if(ox==null){ ox = r.width/2; oy = r.height/2; }
    const cx = (ox-this.panX)/this.zoom, cy = (oy-this.panY)/this.zoom;
    this.zoom = z;
    this.panX = ox - cx*this.zoom;
    this.panY = oy - cy*this.zoom;
    this.apply();
  }

  panToNode(id){
    const p = this.model.pos[id];
    if(!p) return;
    const r = this.wrap.getBoundingClientRect();
    const PAD = 32, usable = Math.max(240, r.width-320);
    const contentW = this.model.width*this.zoom, contentH = this.model.height*this.zoom;
    let px = usable/2 - (p.x+NODE_W/2)*this.zoom;
    px = contentW<=usable-PAD ? PAD : Math.max(usable-PAD-contentW, Math.min(PAD, px));
    let py = r.height/2 - (p.y+NODE_H/2)*this.zoom;
    py = contentH<=r.height-PAD ? PAD : Math.max(r.height-PAD-contentH, Math.min(PAD, py));
    this.panX = px;
    this.panY = py;
    this.apply();
  }

  _setup(){
    const self = this, wrap = this.wrap;
    wrap.addEventListener('wheel', e => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      self.zoomTo(self.zoom*Math.exp(-e.deltaY*0.002), e.clientX-r.left, e.clientY-r.top);
    }, {passive:false});
    document.getElementById('zoomIn').onclick = () => self.zoomTo(self.zoom*1.2);
    document.getElementById('zoomOut').onclick = () => self.zoomTo(self.zoom/1.2);
    document.getElementById('zoomReset').onclick = () => self.zoomTo(1);

    const PAN_SPEED = 0.6;
    let sx=0, sy=0, spx=0, spy=0, down=false, dragged=false;
    wrap.addEventListener('pointerdown', e => {
      if(e.button!==0) return;
      down = true; dragged = false;
      sx = e.clientX; sy = e.clientY; spx = self.panX; spy = self.panY;
    });
    window.addEventListener('pointermove', e => {
      if(!down) return;
      const dx = e.clientX-sx, dy = e.clientY-sy;
      if(!dragged && Math.hypot(dx,dy) < 4) return;
      dragged = true; wrap.classList.add('panning');
      self.panX = spx + dx*PAN_SPEED;
      self.panY = spy + dy*PAN_SPEED;
      self.apply();
      e.preventDefault();
    });
    window.addEventListener('pointerup', () => { down = false; wrap.classList.remove('panning'); });
    wrap.addEventListener('click', e => { if(dragged){ e.stopPropagation(); dragged = false; } }, true);
  }
}
