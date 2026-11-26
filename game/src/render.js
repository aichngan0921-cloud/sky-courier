// The renderer: a chase view over the terrain. The world is drawn in a
// canvas 2D scene with a small 3D projector (lateral/forward from the
// plane, then a perspective divide), then the aircraft, the cockpit panel
// and the HUD are painted on top. Screens: title, play, paused, over.
import {
  GROUND_FAR, GROUND_NEAR, RINGS, RUNWAY, SKY_HORIZON, SKY_TOP,
  VIEW_H, VIEW_W,
} from './config.js';
import { riverX, terrainHeight } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const KT = 1.6878; // feet per second in one knot

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const t0 = performance.now();

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
    const time = (performance.now() - t0) / 1000;
    const p = world.state.plane;
    const cx = W / 2;
    const horizonY = H * 0.46 - p.pitch * H * 0.3;
    const f = H * 1.05;

    // Sky: deep blue to warm dusk at the horizon.
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
    sky.addColorStop(0, '#1d4a7c');
    sky.addColorStop(0.55, '#5a8fc0');
    sky.addColorStop(0.85, '#e8a56b');
    sky.addColorStop(1, SKY_HORIZON);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizonY + 40);

    // Sun with a wide halo.
    const sunX = W * 0.82;
    const sunY = H * 0.14;
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 150);
    glow.addColorStop(0, 'rgba(255, 236, 170, 0.95)');
    glow.addColorStop(0.4, 'rgba(255, 214, 130, 0.45)');
    glow.addColorStop(1, 'rgba(255, 236, 170, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 150, sunY - 150, 300, 300);
    ctx.fillStyle = '#ffdf8a';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();

    // Birds drifting across the sky.
    ctx.strokeStyle = 'rgba(40, 50, 70, 0.8)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const bx = ((time * 14 + i * 430) % (W + 120)) - 60;
      const by = H * 0.20 + i * 26 + Math.sin(time + i * 2) * 6;
      ctx.beginPath();
      ctx.moveTo(bx - 9, by);
      ctx.quadraticCurveTo(bx - 3, by - 6, bx, by);
      ctx.quadraticCurveTo(bx + 3, by - 6, bx + 9, by);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, horizonY);
    ctx.rotate(-p.bank * 0.45);
    ctx.translate(-cx, -horizonY);

    // Far mountains with snow caps, two ridges that drift with heading.
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

    drawFields(project, world, p);
    drawGrid(project, p);
    drawRiver(project, p);
    drawTown(project, world);
    drawTrees(project, world);
    drawAirfield(project, world);
    drawRunway(project, p);
    drawRings(project, world, p, time);
    drawClouds(project, world);
    drawPlaneShadow(project, p);

    ctx.restore();

    // Speed lines at the screen edges when fast.
    if (p.speed > 240) drawSpeedLines(W, H, p.speed);

    drawAircraft(W, H, p, time);
    drawPanel(W, H, world, screen);
    drawTopBar(W, H, world);
    if (screen === SCREEN_TITLE) drawTitle(W, H, best);
    if (screen === SCREEN_PAUSED) drawCenter(W, H, 'PAUSED', 'Press P to keep flying');
    if (screen === SCREEN_OVER) drawOver(W, H, world, best);
  }

  function drawRidges(W, H, horizonY, heading) {
    for (let layer = 0; layer < 2; layer++) {
      const base = horizonY - 14 - layer * 48;
      const amp = 36 + layer * 32;
      const shift = (-heading * (220 + layer * 160)) % (W * 1.4);
      const pts = [];
      for (let x = -20; x <= W + 20; x += 40) {
        const xx = x + shift;
        const y = base - Math.abs(Math.sin((xx + layer * 300) * 0.006)) * amp
          - Math.sin((xx + layer * 700) * 0.011) * amp * 0.4;
        pts.push([x, y]);
      }
      ctx.fillStyle = layer === 0 ? 'rgba(112, 132, 166, 0.7)' : 'rgba(74, 94, 132, 0.9)';
      ctx.beginPath();
      ctx.moveTo(-20, horizonY + 2);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(W + 20, horizonY + 2);
      ctx.closePath();
      ctx.fill();
      // Snow caps on the tallest peaks of the nearer ridge.
      if (layer === 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        for (let i = 1; i < pts.length - 1; i += 4) {
          const [x, y] = pts[i];
          if (y < pts[i - 1][1] - 4 && y < pts[i + 1][1] - 4) {
            ctx.beginPath();
            ctx.moveTo(x - 16, y + 12);
            ctx.lineTo(x, y - 2);
            ctx.lineTo(x + 16, y + 12);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }
  }

  function drawFields(project, world, p) {
    for (const fld of world.fields) {
      const hw = fld.w / 2;
      const hd = fld.d / 2;
      const corners = [
        project(fld.x - hw, 0, fld.z - hd), project(fld.x + hw, 0, fld.z - hd),
        project(fld.x + hw, 0, fld.z + hd), project(fld.x - hw, 0, fld.z + hd),
      ];
      if (corners.some((c) => !c)) continue;
      if (corners[0].forward > 2400) continue;
      ctx.fillStyle = fld.color;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (const c of corners.slice(1)) ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawGrid(project, p) {
    ctx.lineWidth = 1;
    const zStart = Math.ceil((p.z + 60) / 100) * 100;
    for (let z = zStart; z < p.z + 1600; z += 100) {
      const a = project(-900, 0, z);
      const b = project(900, 0, z);
      if (!a || !b) continue;
      const fade = Math.max(0, 1 - (z - p.z) / 1600);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 + 0.07 * fade})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let x = -800; x <= 800; x += 200) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
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
    // Wide pale band, then a deeper blue centre.
    for (const [width, color] of [[7, 'rgba(140, 190, 230, 0.8)'], [3.5, '#4d8fd1']]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
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
  }

  function drawTown(project, world) {
    const roofs = ['#a34d3d', '#7a5a34', '#5d6b7a', '#8a6d4b'];
    for (let i = 0; i < world.town.length; i++) {
      const b = world.town[i];
      const base = project(b.x, 0, b.z);
      if (!base || base.forward > 2200) continue;
      const w = Math.max(2, b.w * base.s * 0.5);
      const h = b.h * base.s;
      ctx.fillStyle = '#d9c9a8';
      ctx.fillRect(base.x - w / 2, base.y - h, w, h);
      ctx.fillStyle = roofs[i % roofs.length];
      ctx.fillRect(base.x - w / 2, base.y - h, w, Math.max(2, h * 0.22));
      // Windows.
      ctx.fillStyle = 'rgba(40, 60, 90, 0.8)';
      const rows = Math.max(1, Math.floor(h / 14));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 2; c++) {
          ctx.fillRect(base.x - w / 2 + w * (0.22 + c * 0.4), base.y - h * 0.75 + r * 14, Math.max(1.5, w * 0.14), Math.max(1.5, h * 0.08));
        }
      }
    }
  }

  function drawTrees(project, world) {
    for (const t of world.trees) {
      const pt = project(t.x, 0, t.z);
      if (!pt || pt.forward > 1500) continue;
      const s = Math.max(1.5, t.s * pt.s * 0.5);
      ctx.strokeStyle = '#6b4a2a';
      ctx.lineWidth = Math.max(1, s * 0.12);
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x, pt.y - s * 0.5);
      ctx.stroke();
      ctx.fillStyle = '#2f6b2a';
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - s * 1.9);
      ctx.lineTo(pt.x - s * 0.75, pt.y - s * 0.3);
      ctx.lineTo(pt.x + s * 0.75, pt.y - s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#4d8a3f';
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - s * 1.9);
      ctx.lineTo(pt.x - s * 0.45, pt.y - s * 0.9);
      ctx.lineTo(pt.x + s * 0.45, pt.y - s * 0.9);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawAirfield(project, world) {
    // Control tower.
    const tw = world.tower;
    const base = project(tw.x, 0, tw.z);
    if (base && base.forward < 2400) {
      const w = Math.max(3, 14 * base.s);
      const h = tw.h * base.s;
      ctx.fillStyle = '#c8c2b4';
      ctx.fillRect(base.x - w / 2, base.y - h, w, h);
      ctx.fillStyle = '#274b6d';
      ctx.fillRect(base.x - w, base.y - h - Math.max(4, 10 * base.s), w * 2, Math.max(4, 10 * base.s));
    }
    // Hangars: low wide boxes with pale roofs.
    for (const hg of world.hangars) {
      const hb = project(hg.x, 0, hg.z);
      if (!hb || hb.forward > 2400) continue;
      const w = Math.max(3, hg.w * hb.s * 0.5);
      const h = hg.h * hb.s;
      ctx.fillStyle = '#b8b0a0';
      ctx.fillRect(hb.x - w / 2, hb.y - h, w, h);
      ctx.fillStyle = '#e8e2d2';
      ctx.fillRect(hb.x - w / 2, hb.y - h, w, Math.max(2, h * 0.3));
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
    // Grass shoulder, then the strip.
    const shoulder = [
      project(-hw - 26, 0.5, z0), project(hw + 26, 0.5, z0),
      project(hw + 26, 0.5, z1), project(-hw - 26, 0.5, z1),
    ];
    if (!shoulder.some((c) => !c)) {
      ctx.fillStyle = '#3f7a34';
      ctx.beginPath();
      ctx.moveTo(shoulder[0].x, shoulder[0].y);
      for (const c of shoulder.slice(1)) ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#3c3f45';
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (const c of corners.slice(1)) ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes.
    ctx.strokeStyle = '#f5f5f5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let z = z0 + 30; z < z1 - 20; z += 60) {
      const a = project(0, 1.5, z);
      const b = project(0, 1.5, z + 30);
      if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    }
    ctx.stroke();
    // Threshold bars at both ends.
    ctx.fillStyle = '#f5f5f5';
    for (const zt of [z0 + 8, z1 - 8]) {
      for (let k = -2; k <= 2; k++) {
        const a = project(k * 8 - 3, 1.5, zt);
        const b = project(k * 8 + 3, 1.5, zt + 12);
        if (a && b) ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x) || 2, Math.abs(b.y - a.y) || 2);
      }
    }
    // Edge lights.
    ctx.fillStyle = '#ffd23f';
    for (let z = z0; z <= z1; z += 70) {
      for (const sx of [-hw, hw]) {
        const pt = project(sx, 1.5, z);
        if (pt) { ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  }

  function drawRings(project, world, p, time) {
    for (let i = world.state.ringIndex; i < RINGS.length; i++) {
      const ring = RINGS[i];
      if (ring.z < p.z - 20 || ring.z > p.z + 2600) continue;
      const c = project(ring.x, ring.y, ring.z);
      if (!c) continue;
      const next = i === world.state.ringIndex;
      const pulse = next ? 1 + 0.03 * Math.sin(time * 3) : 1;
      const r = ring.r * c.s * pulse;
      // Light beam above the next ring so it is easy to find.
      if (next) {
        const top = project(ring.x, ring.y + 420, ring.z);
        if (top) {
          const grad = ctx.createLinearGradient(c.x, c.y, top.x, top.y);
          grad.addColorStop(0, 'rgba(255, 210, 63, 0.4)');
          grad.addColorStop(1, 'rgba(255, 210, 63, 0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = Math.max(3, r * 0.22);
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(top.x, top.y);
          ctx.stroke();
        }
      }
      ctx.save();
      ctx.shadowColor = next ? '#ffd23f' : '#59d6e6';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = next ? '#ffd23f' : 'rgba(89, 214, 230, 0.85)';
      ctx.lineWidth = Math.max(2, r * 0.09);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, r, r * 0.92, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // Dashed inner ring.
      ctx.save();
      ctx.setLineDash([Math.max(4, r * 0.18), Math.max(4, r * 0.18)]);
      ctx.strokeStyle = next ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = Math.max(1.5, r * 0.045);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, r * 0.78, r * 0.72, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = next ? '#ffd23f' : '#bfeef5';
      ctx.font = `bold ${Math.max(12, Math.round(r * 0.32))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), c.x, c.y + r * 0.12);
    }
  }

  function drawClouds(project, world) {
    for (const c of world.clouds) {
      const pt = project(c.x, c.y, c.z);
      if (!pt || pt.forward > 3000) continue;
      const rx = Math.max(4, c.s * pt.s * 0.6);
      // Soft grey underside, then bright white puffs.
      ctx.fillStyle = 'rgba(200, 210, 225, 0.7)';
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y + rx * 0.08, rx, rx * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      for (const [dx, dy, k] of [[-0.45, 0, 0.62], [0, -0.14, 0.8], [0.45, 0.02, 0.6]]) {
        ctx.beginPath();
        ctx.ellipse(pt.x + dx * rx, pt.y + dy * rx, rx * k, rx * k * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPlaneShadow(project, p) {
    const g = terrainHeight(p.x, p.z);
    const pt = project(p.x, g + 2, p.z);
    if (!pt || pt.forward > 2000) return;
    const alt = Math.max(0, p.y - g);
    const alpha = Math.max(0.05, 0.3 - alt / 1800);
    const rx = Math.max(4, 55 * pt.s);
    ctx.fillStyle = `rgba(20, 30, 20, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, rx, rx * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSpeedLines(W, H, speed) {
    const strength = Math.min(1, (speed - 240) / 130);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 * strength})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + 0.3;
      const x1 = W / 2 + Math.cos(angle) * W * 0.42;
      const y1 = H * 0.45 + Math.sin(angle) * H * 0.4;
      const x2 = W / 2 + Math.cos(angle) * W * 0.52;
      const y2 = H * 0.45 + Math.sin(angle) * H * 0.52;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  function drawAircraft(W, H, p, time) {
    const ax = W / 2;
    const ay = H * 0.60 - p.pitch * H * 0.10;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(p.bank * 1.1);
    // Spinning propeller at the nose (far end, seen edge-on).
    const propAngle = time * 28;
    ctx.save();
    ctx.translate(0, -52);
    ctx.rotate(propAngle);
    ctx.strokeStyle = 'rgba(40, 40, 50, 0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(0, 16);
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#2c3440';
    ctx.beginPath();
    ctx.arc(0, -52, 5, 0, Math.PI * 2);
    ctx.fill();
    // Wings with dihedral and shaded gold.
    const wingGrad = ctx.createLinearGradient(0, -14, 0, 18);
    wingGrad.addColorStop(0, '#f6c453');
    wingGrad.addColorStop(1, '#dd931a');
    ctx.fillStyle = wingGrad;
    ctx.strokeStyle = '#8a6d1f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-118, 2);
    ctx.lineTo(-96, -12);
    ctx.lineTo(96, -12);
    ctx.lineTo(118, 2);
    ctx.lineTo(96, 16);
    ctx.lineTo(-96, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Red wingtip stripes.
    ctx.fillStyle = '#c8442c';
    ctx.fillRect(-118, -4, 14, 14);
    ctx.fillRect(104, -4, 14, 14);
    // Fuselage with side shading.
    const bodyGrad = ctx.createLinearGradient(-20, 0, 20, 0);
    bodyGrad.addColorStop(0, '#c9d2da');
    bodyGrad.addColorStop(0.45, '#ffffff');
    bodyGrad.addColorStop(1, '#aeb8c2');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#7d8894';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-16, 46);
    ctx.lineTo(-20, -36);
    ctx.quadraticCurveTo(0, -54, 20, -36);
    ctx.lineTo(16, 46);
    ctx.quadraticCurveTo(0, 54, -16, 46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Red cheatline along the fuselage.
    ctx.strokeStyle = '#c8442c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-17, 18);
    ctx.quadraticCurveTo(0, 26, 17, 18);
    ctx.stroke();
    // Tail fin with a white stripe.
    ctx.fillStyle = '#c8442c';
    ctx.beginPath();
    ctx.moveTo(-10, 36);
    ctx.lineTo(0, -4);
    ctx.lineTo(10, 36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-7, 22, 14, 4);
    // Horizontal stabilizers.
    ctx.fillStyle = '#e8b13c';
    ctx.beginPath();
    ctx.moveTo(-34, 40);
    ctx.lineTo(34, 40);
    ctx.lineTo(26, 48);
    ctx.lineTo(-26, 48);
    ctx.closePath();
    ctx.fill();
    // Cockpit canopy with a glint.
    const canopyGrad = ctx.createLinearGradient(0, -32, 0, -2);
    canopyGrad.addColorStop(0, '#7fc0ee');
    canopyGrad.addColorStop(1, '#1e3a5f');
    ctx.fillStyle = canopyGrad;
    ctx.beginPath();
    ctx.ellipse(0, -17, 11, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -26);
    ctx.quadraticCurveTo(-2, -30, 2, -26);
    ctx.stroke();
    // Navigation lights with a glow.
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff4d4d';
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(-118, -2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#37d67a';
    ctx.fillStyle = '#37d67a';
    ctx.beginPath();
    ctx.arc(118, -2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function drawPanel(W, H, world, screen) {
    const p = world.state.plane;
    const panelY = H * 0.82;
    ctx.fillStyle = 'rgba(16, 22, 32, 0.94)';
    ctx.fillRect(0, panelY, W, H - panelY);
    ctx.fillStyle = '#2c3646';
    ctx.fillRect(0, panelY, W, 3);

    // Artificial horizon with a glass bezel.
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
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-hr, 0);
    ctx.lineTo(hr, 0);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#c8ccd2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - 22, hy);
    ctx.lineTo(hx + 22, hy);
    ctx.stroke();
    // Glass glint.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx - 26, hy - 22);
    ctx.lineTo(hx - 8, hy - 34);
    ctx.stroke();

    const font = (size, bold) => `${bold ? 'bold ' : ''}${size}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    // Column A: altitude and airspeed, each with its own row.
    ctx.fillStyle = '#9fb2c8';
    ctx.font = font(13);
    ctx.fillText('ALTITUDE', 150, panelY + 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(26, true);
    ctx.fillText(`${Math.max(0, Math.round(p.y))} ft`, 150, panelY + 54);
    ctx.fillStyle = '#9fb2c8';
    ctx.font = font(13);
    ctx.fillText('AIRSPEED', 150, panelY + 82);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(26, true);
    ctx.fillText(`${Math.max(0, Math.round(p.speed / KT))} kt`, 150, panelY + 108);
    // Vertical speed, beside the altitude value.
    const vsi = Math.round((p.vy || 0) * 60);
    ctx.fillStyle = '#9fb2c8';
    ctx.font = font(13);
    ctx.fillText(vsi > 60 ? `CLIMB ${vsi} ft/min` : vsi < -60 ? `SINK ${-vsi} ft/min` : 'LEVEL', 300, panelY + 54);

    // Column B: heading with a scrolling compass ribbon.
    const headingDeg = ((p.heading * 180) / Math.PI % 360 + 360) % 360;
    ctx.fillStyle = '#9fb2c8';
    ctx.font = font(13);
    ctx.fillText('HEADING', 340, panelY + 26);
    const ribbonX = 340;
    const ribbonW = 220;
    const ribbonY = panelY + 34;
    const ribbonH = 28;
    ctx.fillStyle = '#0e141f';
    ctx.fillRect(ribbonX, ribbonY, ribbonW, ribbonH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ribbonX, ribbonY, ribbonW, ribbonH);
    ctx.clip();
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let off = -60; off <= 60; off += 15) {
      let deg = Math.round(headingDeg + off);
      deg = ((deg % 360) + 360) % 360;
      const x = ribbonX + ribbonW / 2 + off * (ribbonW / 120);
      const major = deg % 45 === 0;
      ctx.strokeStyle = major ? '#ffffff' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, ribbonY + ribbonH - (major ? 12 : 7));
      ctx.lineTo(x, ribbonY + ribbonH);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#ffffff';
        ctx.font = font(13, true);
        ctx.textAlign = 'center';
        ctx.fillText(dirs[Math.round(deg / 45) % 8], x, ribbonY + 13);
        ctx.textAlign = 'left';
      }
    }
    ctx.restore();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ribbonX + ribbonW / 2, ribbonY);
    ctx.lineTo(ribbonX + ribbonW / 2 - 5, ribbonY - 6);
    ctx.lineTo(ribbonX + ribbonW / 2 + 5, ribbonY - 6);
    ctx.closePath();
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(22, true);
    ctx.fillText(`${String(Math.round(headingDeg)).padStart(3, '0')}°`, ribbonX, panelY + 92);
    // Throttle bar, segmented.
    ctx.fillStyle = '#9fb2c8';
    ctx.font = font(13);
    ctx.fillText('THROTTLE  Shift up / X down', 340, panelY + 112);
    drawSegments(340, panelY + 118, 220, 8, 10, p.throttle, '#37d67a');

    // Column C: fuel and rings.
    const fx = W - 300;
    ctx.fillStyle = '#9fb2c8';
    ctx.font = font(13);
    ctx.fillText('FUEL', fx, panelY + 26);
    drawSegments(fx, panelY + 34, 180, 12, 10, p.fuel / 100, p.fuel < 25 ? '#ff5a4d' : '#ffd23f');
    ctx.fillStyle = '#ffffff';
    ctx.font = font(22, true);
    ctx.fillText(`${Math.round(p.fuel)}%`, fx + 190, panelY + 48);
    ctx.fillStyle = '#9fb2c8';
    ctx.font = font(13);
    ctx.fillText(`RINGS  ${world.state.ringsHit} / ${RINGS.length}`, fx, panelY + 82);
    const ring = world.ring();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(15, true);
    ctx.fillText(ring ? `NEXT RING ${world.state.ringIndex + 1} — ${Math.max(0, Math.round(ring.z - p.z))} ft` : 'RUNWAY AHEAD', fx, panelY + 108);
  }

  function drawSegments(x, y, w, h, count, frac, color) {
    const gap = 2;
    const segW = (w - gap * (count - 1)) / count;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = i / count < frac ? color : '#2c3646';
      ctx.fillRect(x + i * (segW + gap), y, segW, h);
    }
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
    // Vignette to lift the title off the scene.
    const vig = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.2, W / 2, H * 0.42, H * 0.75);
    vig.addColorStop(0, 'rgba(8, 14, 24, 0.25)');
    vig.addColorStop(1, 'rgba(8, 14, 24, 0.72)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 68px system-ui, sans-serif';
    ctx.fillText('SKY COURIER', W / 2, H * 0.30);
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('Fly the rings, then land on the runway', W / 2, H * 0.38);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = '#e8eef4';
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
