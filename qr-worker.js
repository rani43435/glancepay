// Reads QR codes off the main thread so the display stays smooth.
importScripts('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js');

self.onmessage = (e) => {
  const { id, data, w, h } = e.data;
  const found = self.jsQR(new Uint8ClampedArray(data), w, h, { inversionAttempts: 'dontInvert' });
  self.postMessage({ id, text: found ? found.data : null });
};
