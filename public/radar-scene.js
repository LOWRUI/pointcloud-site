/* 独立的点云背景：绘制失败不影响下载页，经典脚本兼容 file://。 */
"use strict";

(() => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const tau = Math.PI * 2;

  class RadarScene {
    constructor(scene) {
      this.scene = scene;
      this.canvas = scene.querySelector("canvas");
      this.ctx = this.canvas?.getContext("2d");
      if (!this.ctx) return;
      this.media = matchMedia("(prefers-reduced-motion: reduce)");
      this.pointer = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, inside: false };
      this.visible = true;
      this.time = 0.9;
      this.raf = 0;
      this.last = 0;
      this.projected = { x: 0, y: 0, depth: 0 };
      this.bind();
      this.resize();
      this.resume();
    }

    bind() {
      const hero = this.scene.closest(".hero");
      if (matchMedia("(pointer: fine)").matches) {
        hero?.addEventListener("pointermove", (event) => {
          const rect = this.scene.getBoundingClientRect();
          this.pointer.x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
          this.pointer.y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
          this.pointer.inside = true;
        }, { passive: true });
        hero?.addEventListener("pointerleave", () => { this.pointer.inside = false; });
      }
      document.addEventListener("visibilitychange", () => this.resume());
      this.media.addEventListener("change", () => {
        this.stop();
        this.draw();
        this.resume();
      });
      if (typeof ResizeObserver === "function") {
        new ResizeObserver(() => this.resize()).observe(this.scene);
      } else window.addEventListener("resize", () => this.resize());
      if (typeof IntersectionObserver === "function") {
        new IntersectionObserver((entries) => {
          this.visible = entries.some((entry) => entry.isIntersecting);
          this.resume();
        }).observe(this.scene);
      }
    }

    resume() {
      if (this.media.matches || document.hidden || !this.visible) {
        this.stop();
        return;
      }
      if (this.raf) return;
      this.last = performance.now();
      this.raf = requestAnimationFrame((now) => this.frame(now));
    }

    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    resize() {
      const rect = this.scene.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      if (width === this.width && height === this.height && ratio === this.ratio) return;
      Object.assign(this, { width, height, ratio });
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.buildPoints();
      this.draw();
    }

    buildPoints() {
      const nx = this.width < 720 ? 52 : 90;
      const nz = this.width < 720 ? 36 : 58;
      this.points = new Float32Array(nx * nz * 4);
      let index = 0;
      for (let zIndex = 0; zIndex < nz; zIndex += 1) {
        const z = (zIndex / (nz - 1) - 0.5) * 20;
        for (let xIndex = 0; xIndex < nx; xIndex += 1) {
          const x = (xIndex / (nx - 1) - 0.5) * 30;
          this.points[index++] = x;
          this.points[index++] = z;
          this.points[index++] = Math.sin(x * 12.3 + z * 4.7) * Math.PI;
          this.points[index++] = Math.atan2(x, z);
        }
      }
    }

    frame(now) {
      this.raf = 0;
      if (this.media.matches || document.hidden || !this.visible) return;
      this.time += Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.pointer.sx += (this.pointer.x - this.pointer.sx) * 0.05;
      this.pointer.sy += (this.pointer.y - this.pointer.sy) * 0.05;
      try {
        this.draw();
        this.raf = requestAnimationFrame((time) => this.frame(time));
      } catch (error) {
        console.warn("点云背景停止绘制：", error.message);
      }
    }

    view() {
      const pitch = 0.5 - (this.pointer.sy - 0.5) * 0.055;
      const yaw = Math.sin(this.time * 0.05) * 0.08 + (this.pointer.sx - 0.5) * 0.22;
      return {
        sinYaw: Math.sin(yaw), cosYaw: Math.cos(yaw),
        sinPitch: Math.sin(pitch), cosPitch: Math.cos(pitch),
        focal: this.height * 0.62, cx: this.width * 0.56, cy: this.height * 0.44,
      };
    }

    project(x, y, z, view) {
      const rx = x * view.cosYaw - z * view.sinYaw;
      const rz = x * view.sinYaw + z * view.cosYaw;
      const py = y - 5.2;
      const pz = rz + 9.5;
      const depth = -py * view.sinPitch + pz * view.cosPitch;
      if (depth < 0.4) return null;
      this.projected.x = view.cx + view.focal * rx / depth;
      this.projected.y = view.cy - view.focal * (py * view.cosPitch + pz * view.sinPitch) / depth;
      this.projected.depth = depth;
      return this.projected;
    }

    draw() {
      const view = this.view();
      const sweep = (this.time * 0.55) % tau;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 1;
      this.drawRings(view);
      this.drawSweep(view, sweep);
      this.drawPoints(view, sweep);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    drawRings(view) {
      this.ctx.strokeStyle = "rgba(126,165,240,0.16)";
      this.ctx.lineWidth = 1;
      for (const radius of [3.5, 7, 10.5, 14]) {
        this.ctx.beginPath();
        let started = false;
        for (let k = 0; k <= 72; k += 1) {
          const angle = k / 72 * tau;
          const point = this.project(Math.sin(angle) * radius, 0, Math.cos(angle) * radius, view);
          if (!point) { started = false; continue; }
          if (started) this.ctx.lineTo(point.x, point.y);
          else this.ctx.moveTo(point.x, point.y);
          started = true;
        }
        this.ctx.stroke();
      }
    }

    drawSweep(view, sweep) {
      const center = this.project(0, 0, 0, view);
      if (!center) return;
      const { x, y } = center;
      const ctx = this.ctx;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, this.height * 0.62);
      gradient.addColorStop(0, "rgba(255,190,92,0.03)");
      gradient.addColorStop(0.55, "rgba(255,190,92,0.14)");
      gradient.addColorStop(1, "rgba(255,190,92,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k <= 22; k += 1) {
        const angle = sweep - 0.3 + k / 22 * 0.6;
        const point = this.project(Math.sin(angle) * 15, 0, Math.cos(angle) * 15, view);
        if (point) ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
      ctx.fill();
    }

    pointBoost(point, delta) {
      let boost = Math.abs(delta) < 0.26 ? (1 - Math.abs(delta) / 0.26) ** 2 : 0;
      if (this.pointer.inside && !this.media.matches) {
        const dx = point.x - this.pointer.x * this.width;
        const dy = point.y - this.pointer.y * this.height;
        const radius = clamp(Math.min(this.width, this.height) * 0.34, 150, 340);
        boost = Math.max(boost, Math.max(0, 1 - Math.hypot(dx, dy) / radius) ** 3);
      }
      return boost;
    }

    drawPoints(view, sweep) {
      const time = this.time;
      for (let i = 0; i < this.points.length; i += 4) {
        const x = this.points[i];
        const z = this.points[i + 1];
        const height = 0.55 * Math.sin(x * 0.55 + time * 0.22) * Math.cos(z * 0.48 - time * 0.16)
          + 0.3 * Math.sin((x + z) * 0.36 + time * 0.11)
          + 0.16 * Math.sin(x * 1.9 + time * 0.07) * Math.sin(z * 1.6);
        const point = this.project(x, height, z, view);
        if (!point) continue;
        const delta = Math.atan2(Math.sin(this.points[i + 3] - sweep), Math.cos(this.points[i + 3] - sweep));
        const boost = this.pointBoost(point, delta);
        const fog = clamp(1 - (point.depth - 4) / 19, 0, 1);
        const twinkle = 0.03 * Math.sin(time * 1.6 + this.points[i + 2]);
        this.ctx.globalAlpha = clamp(0.1 + 0.62 * fog ** 2 + 0.55 * boost + twinkle * fog, 0, 0.95);
        this.ctx.fillStyle = boost > 0.16 ? "rgb(255,198,112)" : "rgb(122,164,238)";
        const size = clamp(1.1 + fog * 1.6 + boost * 1.2, 1.1, 3.8);
        this.ctx.fillRect(point.x, point.y, size, size);
      }
    }
  }

  function init() {
    const scene = document.querySelector(".hero__scene");
    if (!scene) return;
    try { new RadarScene(scene); }
    catch (error) { console.warn("点云背景不可用：", error.message); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
