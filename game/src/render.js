// The renderer: a chase view over the terrain. The world is drawn in a
// canvas 2D scene with a small 3D projector (lateral/forward from the
// plane, then a perspective divide), then the aircraft, the cockpit panel
// and the HUD are painted on top. Screens: title, play, paused, over.
import {
  GROUND_FAR, GROUND_NEAR, RINGS, RUNWAY, SKY_HORIZON, SKY_TOP,
  VIEW_H, VIEW_W,
} from './config.js';
import { riverX } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const KT = 1.6878; // feet per second in one knot

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();
  window.addEventListener('resize', fit);

  function draw(world, screen, best) {
    const W = canvas.clientWidth || window.innerWidth;
    const H = canvas.clientHeight || window.innerHeight;
    const p = world.state.plane;
    const cx = W / 2;
    const horizonY = H * 0.46 - p.pitch * H * 0.3;
    const f = H * 1.05;

    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(1, SKY_HORIZON);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizonY + 40);

    // Sun and its glow.
    const sunX = W * 0.82;
    const sunY = H * 0.14;
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 90);
    glow.addColorStop(0, 'rgba(255, 236, 170, 0.95)');
    glow.addColorStop(1, 'rgba(255, 236, 170, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 90, sunY - 90, 180, 180);
    ctx.fillStyle = '#ffdf8a';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, horizonY);
    ctx.rotate(-p.bank * 0.45);
    ctx.translate(-cx, -horizonY);

    // Far mountains, two ridges that drift with heading.
    drawRidges(W, H, horizonY, p.heading);
    // Ground.
    const ground = ctx.createLinearGradient(0, horizonY, 0, H);
    ground.addColorStop(0, GROUND_FAR);
    ground.addColorStop(1, GROUND_NEAR);
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    const project = (wx, wy, wz) => {
      const dx = wx - p.x;
      const dz = wz - p.z;
      const cosH = Math.cos(p.heading);
      const sinH = Math.sin(p.heading);
      const lateral = dx * cosH - dz * sinH;
      const forward = dx * sinH + dz * cosH;
      if (forward < 10) return null;
      return {
        x: cx + (lateral * f) / forward,
        y: horizonY - ((wy - p.y) * f) / forward,
        s: f / forward,
        forward,
      };
    };

    drawGrid(project, W, H, horizonY, p);
    drawRiver(project, p);
    drawTown(project, world);
    drawTrees(project, world);
    drawRunway(project, p);
    drawRings(project, world, p);
    drawClouds(project, world);

    ctx.restore();

    drawAircraft(W, H, p);
    drawPanel(W, H, world, screen);
    drawTopBar(W, H, world);
    if (screen === SCREEN_TITLE) drawTitle(W, H, best);
    if (screen === SCREEN_PAUSED) drawCenter(W, H, 'PAUSED', 'Press P to keep flying');
    if (screen === SCREEN_OVER) drawOver(W, H, world, best);
  }

  function drawRidges(W, H, horizonY, heading) {
    for (let layer = 0; layer < 2; layer++) {
      const base = horizonY - 18 - layer * 46;
      const amp = 34 + layer * 30;
      const shift = (-heading * (220 + layer * 160)) % (W * 1.4);
      ctx.fillStyle = layer === 0 ? 'rgba(96, 116, 150, 0.75)' : 'rgba(70, 90, 128, 0.85)';
      ctx.beginPath();
      ctx.moveTo(-20, horizonY + 2);
      for (let x = -20; x <= W + 20; x += 40) {
        const xx = x + shift;
        const y = base - Math.abs(Math.sin((xx + layer * 300) * 0.006)) * amp
          - Math.sin((xx + layer * 700) * 0.011) * amp * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W + 20, horizonY + 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGrid(project, W, H, horizonY, p) {
    ctx.lineWidth = 1;
    const zStart = Math.ceil((p.z + 60) / 100) * 100;
    for (let z = zStart; z < p.z + 1600; z += 100) {
      const a = project(-900, 0, z);
      const b = project(900, 0, z);
      if (!a || !b) continue;
      const fade = Math.max(0, 1 - (z - p.z) / 1600);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.10 + 0.12 * fade})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let x = -800; x <= 800; x += 200) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      let started = false;
      for (let z = p.z + 60; z < p.z + 1600; z += 100) {
        const pt = project(x, 0, z);
        if (!pt) continue;
        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }
  }

  function drawRiver(project, p) {
    ctx.strokeStyle = '#4d8fd1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    let started = false;
    for (let z = p.z - 100; z < p.z + 2200; z += 100) {
      const pt = project(riverX(z), -2, z);
      if (!pt) continue;
      if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  }

  function drawTown(project, world) {
    for (const b of world.town) {
      const base = project(b.x, 0, b.z);
      if (!base || base.forward > 2200) continue;
      const w = Math.max(2, b.w * base.s * 0.5);
      const h = b.h * base.s;
      ctx.fillStyle = '#8a7f72';
      ctx.fillRect(base.x - w / 2, base.y - h, w, h);
      ctx.fillStyle = '#5d5348';
      ctx.fillRect(base.x - w / 2, base.y - h, w, Math.max(2, h * 0.18));
    }
  }

  function drawTrees(project, world) {
    for (const t of world.trees) {
      const pt = project(t.x, 0, t.z);
      if (!pt || pt.forward > 1500) continue;
      const s = Math.max(1.5, t.s * pt.s * 0.5);
      ctx.fillStyle = '#2f6b2a';
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - s * 1.6);
      ctx.lineTo(pt.x - s * 0.7, pt.y);
      ctx.lineTo(pt.x + s * 0.7, pt.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawRunway(project, p) {
    const hw = RUNWAY.width / 2;
    const z0 = RUNWAY.z;
    const z1 = RUNWAY.z + RUNWAY.length;
    const corners = [
      project(-hw, 1, z0), project(hw, 1, z0),
      project(hw, 1, z1), project(-hw, 1, z1),
    ];
    if (corners.some((c) => !c)) return;
    ctx.fillStyle = '#3c3f45';
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (const c of corners.slice(1)) ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f5f5f5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let z = z0 + 30; z < z1 - 20; z += 60) {
      const a = project(0, 1.5, z);
      const b = project(0, 1.5, z + 30);
      if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    }
    ctx.stroke();
  }

  function drawRings(project, world, p) {
    for (let i = world.state.ringIndex; i < RINGS.length; i++) {
      const ring = RINGS[i];
      if (ring.z < p.z - 20 || ring.z > p.z + 2600) continue;
      const c = project(ring.x, ring.y, ring.z);
      if (!c) continue;
      const r = ring.r * c.s;
      const next = i === world.state.ringIndex;
      ctx.save();
      ctx.shadowColor = next ? '#ffd23f' : '#59d6e6';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = next ? '#ffd23f' : 'rgba(89, 214, 230, 0.85)';
      ctx.lineWidth = Math.max(2, r * 0.09);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, r, r * 0.92, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = next ? '#ffd23f' : '#bfeef5';
      ctx.font = `bold ${Math.max(12, Math.round(r * 0.32))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), c.x, c.y + r * 0.12);
    }
  }

  function drawClouds(project, world) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (const c of world.clouds) {
      const pt = project(c.x, c.y, c.z);
      if (!pt || pt.forward > 3000) continue;
      const rx = Math.max(4, c.s * pt.s * 0.6);
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y, rx, rx * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAircraft(W, H, p) {
    const ax = W / 2;
    const ay = H * 0.60 - p.pitch * H * 0.10;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(p.bank * 1.1);
    // Wings.
    ctx.fillStyle = '#e8b13c';
    ctx.beginPath();
    ctx.moveTo(-118, 6);
    ctx.lineTo(-96, -8);
    ctx.lineTo(96, -8);
    ctx.lineTo(118, 6);
    ctx.lineTo(96, 16);
    ctx.lineTo(-96, 16);
    ctx.closePath();
    ctx.fill();
    // Fuselage, seen from behind.
    ctx.fillStyle = '#f4f6f8';
    ctx.beginPath();
    ctx.moveTo(-16, 44);
    ctx.lineTo(-20, -34);
    ctx.quadraticCurveTo(0, -52, 20, -34);
    ctx.lineTo(16, 44);
    ctx.quadraticCurveTo(0, 52, -16, 44);
    ctx.closePath();
    ctx.fill();
    // Tail fin.
    ctx.fillStyle = '#c8442c';
    ctx.beginPath();
    ctx.moveTo(-10, 34);
    ctx.lineTo(0, -6);
    ctx.lineTo(10, 34);
    ctx.closePath();
    ctx.fill();
    // Cockpit hump and navigation lights.
    ctx.fillStyle = '#274b6d';
    ctx.beginPath();
    ctx.ellipse(0, -16, 11, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(-118, 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#37d67a';
    ctx.beginPath();
    ctx.arc(118, 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPanel(W, H, world, screen) {
    const p = world.state.plane;
    const panelY = H * 0.82;
    ctx.fillStyle = 'rgba(18, 24, 34, 0.92)';
    ctx.fillRect(0, panelY, W, H - panelY);
    ctx.fillStyle = '#2c3646';
    ctx.fillRect(0, panelY, W, 3);

    // Artificial horizon.
    const hx = 74;
    const hy = panelY + (H - panelY) / 2;
    const hr = 44;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(hx, hy);
    ctx.rotate(-p.bank);
    ctx.translate(0, p.pitch * 60);
    ctx.fillStyle = '#4d8fd1';
    ctx.fillRect(-hr - 2, -hr - 2, hr * 2 + 4, hr + 2);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-hr - 2, 0, hr * 2 + 4, hr + 2);
    ctx.restore();
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(hx - 22, hy);
    ctx.lineTo(hx + 22, hy);
    ctx.stroke();

    const font = (size, bold) => `${bold ? 'bold ' : ''}${size}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9fb2c8';
    ctx.font = font(13);
    ctx.fillText('ALTITUDE', 150, panelY + 30);
    ctx.fillText('AIRSPEED', 150, panelY + 66);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(26, true);
    ctx.fillText(`${Math.max(0, Math.round(p.y))} ft`, 150, panelY + 58);
    ctx.fillText(`${Math.max(0, Math.round(p.speed / KT))} kt`, 150, panelY + 94);

    // Compass strip.
    const headingDeg = ((p.heading * 180) / Math.PI % 360 + 360) % 360;
    ctx.fillStyle = '#9fb2c8';
    ctx.font = font(13);
    ctx.fillText('HEADING', 360, panelY + 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(26, true);
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dir = dirs[Math.round(headingDeg / 45) % 8];
    ctx.fillText(`${String(Math.round(headingDeg)).padStart(3, '0')}° ${dir}`, 360, panelY + 58);
    ctx.fillStyle = '#9fb2c8';
    ctx.font = font(13);
    ctx.fillText('THROTTLE  Shift up / X down', 360, panelY + 88);
    ctx.fillStyle = '#2c3646';
    ctx.fillRect(360, panelY + 96, 180, 10);
    ctx.fillStyle = '#37d67a';
    ctx.fillRect(360, panelY + 96, 180 * p.throttle, 10);

    // Fuel gauge.
    const fx = W - 300;
    ctx.fillStyle = '#9fb2c8';
    ctx.font = font(13);
    ctx.fillText('FUEL', fx, panelY + 30);
    ctx.fillStyle = '#2c3646';
    ctx.fillRect(fx, panelY + 40, 180, 12);
    ctx.fillStyle = p.fuel < 25 ? '#ff5a4d' : '#ffd23f';
    ctx.fillRect(fx, panelY + 40, 180 * (p.fuel / 100), 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(22, true);
    ctx.fillText(`${Math.round(p.fuel)}%`, fx + 190, panelY + 54);
    ctx.fillStyle = '#9fb2c8';
    ctx.font = font(13);
    ctx.fillText('RINGS  ' + world.state.ringsHit + ' / ' + RINGS.length, fx, panelY + 88);
  }

  function drawTopBar(W, H, world) {
    const s = world.state;
    ctx.textAlign = 'left';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(10, 16, 26, 0.55)';
    ctx.fillRect(14, 12, 250, 40);
    ctx.fillRect(W - 264, 12, 250, 40);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE  ${s.score}`, 26, 40);
    const t = Math.max(0, Math.ceil(s.timeLeft));
    const timeText = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    ctx.textAlign = 'right';
    ctx.fillText(`TIME  ${timeText}`, W - 26, 40);
    ctx.textAlign = 'left';
    // Ring dots, centred.
    const total = RINGS.length;
    const startX = W / 2 - (total * 26) / 2;
    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i < s.ringIndex ? '#ffd23f' : 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(startX + i * 26 + 13, 32, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTitle(W, H, best) {
    ctx.fillStyle = 'rgba(8, 14, 24, 0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText('SKY COURIER', W / 2, H * 0.30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('Fly the rings, then land on the runway', W / 2, H * 0.38);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = '#dfe7f0';
    ctx.fillText('Arrows / WASD: steer and climb  •  Shift: throttle up  •  X: throttle down  •  P: pause', W / 2, H * 0.48);
    ctx.fillText('Five rings, then a runway landing. Fuel and the clock are both against you.', W / 2, H * 0.53);
    if (best > 0) {
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText(`Best score: ${best}`, W / 2, H * 0.60);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('Press Space or click to fly', W / 2, H * 0.70);
  }

  function drawCenter(W, H, title, sub) {
    ctx.fillStyle = 'rgba(8, 14, 24, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px system-ui, sans-serif';
    ctx.fillText(title, W / 2, H * 0.44);
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillStyle = '#dfe7f0';
    ctx.fillText(sub, W / 2, H * 0.52);
  }

  function drawOver(W, H, world, best) {
    const s = world.state;
    const title = s.landed ? 'LANDED!' : s.status === 'timeout' ? 'TIME UP' : 'CRASHED';
    ctx.fillStyle = 'rgba(8, 14, 24, 0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = s.landed ? '#37d67a' : '#ff5a4d';
    ctx.font = 'bold 56px system-ui, sans-serif';
    ctx.fillText(title, W / 2, H * 0.34);
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText(s.message || '', W / 2, H * 0.42);
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText(`Score ${s.score}   •   Rings ${s.ringsHit} / ${RINGS.length}   •   Best ${best}`, W / 2, H * 0.50);
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillStyle = '#dfe7f0';
    ctx.fillText('Press Space or click to fly again', W / 2, H * 0.60);
  }

  return { draw, fit };
}
