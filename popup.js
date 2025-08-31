let mediaRecorder;
let chunks = [];

// Elements
const captureBtn = document.getElementById("captureBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const themeToggle = document.getElementById("themeToggle");
const muteToggle = document.getElementById("muteToggle");

// Load theme preference
browser.storage.local.get("theme").then(({ theme }) => {
  if (theme === "light") {
    document.body.classList.remove("dark");
    document.body.classList.add("light");
    themeToggle.checked = true;
  }
});

// Theme toggle
themeToggle.addEventListener("change", () => {
  if (themeToggle.checked) {
    document.body.classList.remove("dark");
    document.body.classList.add("light");
    browser.storage.local.set({ theme: "light" });
  } else {
    document.body.classList.remove("light");
    document.body.classList.add("dark");
    browser.storage.local.set({ theme: "dark" });
  }
});

// Start capture
captureBtn.addEventListener("click", () => {
  statusEl.textContent = "Capturing tab audio...";
  browser.tabCapture.capture({ audio: true, video: false }, (stream) => {
    if (!stream) {
      statusEl.textContent = "Error: could not capture audio.";
      return;
    }

    // If mute toggle is OFF → play stream back to speakers
    if (!muteToggle.checked) {
      const audio = new Audio();
      audio.srcObject = stream;
      audio.play();
    }

    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    chunks = [];

    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: "audio/webm" });

      // Convert WebM → WAV using Web Audio API
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new AudioContext();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);

      // Encode WAV
      const wavBuffer = encodeWAV(decoded);
      const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });

      const url = URL.createObjectURL(wavBlob);

      browser.downloads.download({
        url,
        filename: "muteone_capture.wav",
        saveAs: true
      });

      statusEl.textContent = "Saved as muteone_capture.wav";
    };

    mediaRecorder.start();
    captureBtn.disabled = true;
    stopBtn.disabled = false;
  });
});

// Stop capture
stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    statusEl.textContent = "Stopped. Processing file...";
  }
  captureBtn.disabled = false;
  stopBtn.disabled = true;
});

// WAV encoder helper
function encodeWAV(decoded) {
  const numChannels = decoded.numberOfChannels;
  const sampleRate = decoded.sampleRate;
  const numFrames = decoded.length;

  const buffer = new ArrayBuffer(44 + numFrames * numChannels * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + numFrames * numChannels * 2, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, numFrames * numChannels * 2, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = decoded.getChannelData(ch)[i];
      const s = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return buffer;
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
