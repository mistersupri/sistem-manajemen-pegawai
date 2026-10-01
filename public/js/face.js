/* global faceapi */
// Utilitas kamera & deteksi wajah (face-api.js). Model dimuat dari /models (lokal, tanpa internet).
(function () {
  let loaded = null;

  const FaceKit = {
    MODEL_URL: '/models',

    esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    load() {
      if (!loaded) {
        loaded = Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(this.MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(this.MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(this.MODEL_URL),
        ]);
      }
      return loaded;
    },

    async startCamera(video, facingMode = 'user') {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser tidak mendukung kamera. Gunakan Chrome/Firefox terbaru melalui HTTPS.');
      }
      this.stopCamera(video);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      video.muted = true;
      await video.play();
      if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
      return stream;
    },

    stopCamera(video) {
      const s = video && video.srcObject;
      if (s) s.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    },

    options(inputSize = 320) {
      return new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.45 });
    },

    /**
     * Deteksi wajah + descriptor. Mengembalikan { detection, count } dengan
     * detection = wajah terbesar (atau null bila tidak ada wajah).
     */
    async detect(input, inputSize = 320) {
      // Coba beberapa ukuran input: detektor tiny sensitif terhadap skala & sudut wajah.
      const sizes = [inputSize, ...[224, 416].filter((s) => s !== inputSize)];
      let all = [];
      for (const size of sizes) {
        all = await faceapi.detectAllFaces(input, this.options(size)).withFaceLandmarks().withFaceDescriptors();
        if (all.length) break;
      }
      if (!all.length) return { detection: null, count: 0 };
      all.sort((a, b) => b.detection.box.area - a.detection.box.area);
      return { detection: all[0], count: all.length };
    },

    /** Gambar kotak wajah pada canvas overlay yang menutupi video. */
    draw(canvas, video, detection, color = '#00e676', label = '') {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      if (!detection) return;
      const { x, y, width, height } = detection.detection.box;
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, width, height);
      if (label) {
        // Overlay dicerminkan lewat CSS, jadi teks digambar terbalik agar terbaca normal.
        ctx.save();
        ctx.scale(-1, 1);
        ctx.font = 'bold 18px sans-serif';
        const tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = color;
        ctx.fillRect(-(x + width), y - 26, tw, 24);
        ctx.fillStyle = '#000';
        ctx.fillText(label, -(x + width) + 6, y - 8);
        ctx.restore();
      }
    },

    /** Ambil frame video ke canvas (opsional dicerminkan agar seperti selfie). */
    capture(video, { maxWidth = 640, mirror = true } = {}) {
      const scale = Math.min(1, maxWidth / video.videoWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(video.videoWidth * scale);
      c.height = Math.round(video.videoHeight * scale);
      const ctx = c.getContext('2d');
      if (mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0, c.width, c.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return c;
    },

    toArray(descriptor) {
      return Array.from(descriptor, (v) => Math.round(v * 1e6) / 1e6);
    },

    /**
     * Deteksi kedipan mata sederhana (eye aspect ratio) sebagai pemeriksaan keaktifan (liveness)
     * untuk mengurangi kecurangan memakai foto. Panggil update(detection) tiap frame.
     */
    blinkDetector() {
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const ear = (p) => (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]));
      let open = 0;
      let closed = false;
      let blinked = false;
      return {
        update(det) {
          if (!det) return blinked;
          const lm = det.landmarks;
          const v = (ear(lm.getLeftEye()) + ear(lm.getRightEye())) / 2;
          open = Math.max(open * 0.98, v);
          if (open > 0 && v < open * 0.72) closed = true;
          else if (closed && v > open * 0.88) { blinked = true; closed = false; }
          return blinked;
        },
        get blinked() { return blinked; },
        reset() { open = 0; closed = false; blinked = false; },
      };
    },

    /** Ambil lokasi GPS. */
    getLocation(timeout = 15000) {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Perangkat tidak mendukung GPS.'));
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
          (err) => reject(new Error(err.code === 1 ? 'Izin lokasi ditolak. Aktifkan izin lokasi pada browser.' : 'Gagal mendapatkan lokasi GPS.')),
          { enableHighAccuracy: true, timeout, maximumAge: 0 },
        );
      });
    },

    /** Alamat dari koordinat (OpenStreetMap Nominatim). Gagal = string kosong. */
    async reverseGeocode(lat, lng) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&accept-language=id&lat=${lat}&lon=${lng}`, { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) return '';
        const j = await r.json();
        return j.display_name || '';
      } catch {
        return '';
      }
    },

    /**
     * Jam server. Mengembalikan fungsi now() yang menghasilkan Date "bergeser" ke zona waktu server:
     * baca dengan getUTC*() (getUTCHours, getUTCDay, ...) agar tampilan sama dengan waktu server,
     * apa pun zona waktu perangkat.
     */
    async serverClock() {
      let offset = 0;
      let tz = -new Date().getTimezoneOffset();
      try {
        const t0 = Date.now();
        const r = await fetch('/api/time');
        const j = await r.json();
        const t1 = Date.now();
        offset = j.now - (t0 + t1) / 2;
        if (Number.isFinite(j.tzOffsetMinutes)) tz = j.tzOffsetMinutes;
      } catch { /* pakai jam perangkat */ }
      return () => new Date(Date.now() + offset + tz * 60000);
    },

    /** Format jam server: HH:MM:SS */
    fmtClock(d) {
      const p = (n) => String(n).padStart(2, '0');
      return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
    },

    async postJson(url, body) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      let data = {};
      try { data = await r.json(); } catch { /* abaikan */ }
      if (!r.ok) {
        const err = new Error(data.error || `Gagal (${r.status})`);
        err.data = data;
        err.status = r.status;
        throw err;
      }
      return data;
    },
  };

  window.FaceKit = FaceKit;
}());
