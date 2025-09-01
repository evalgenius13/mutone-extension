let mediaRecorder;
let chunks = [];
let wavBlob = null;

// Elements
const captureBtn = document.getElementById("captureBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const themeToggle = document.getElementById("themeToggle");
const muteToggle = document.getElementById("muteToggle");

// ------------------------------
// Theme Persistence
// ------------------------------
browser.storage.local.get("theme").then(({ theme }) => {
  if (theme === "light") {
    document.body.classList.remove("dark");
    document.body.classList.add("light");
    themeToggle.checked = true;
  }
});

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

// ------------------------------
// Start Capture
// ------------------------------
captureBtn.addEventListener("click", () => {
  statusEl.textContent = "Capturing tab audio...";
  browser.tabCapture.capture({ audio: true, video: false }, (stream) => {
    if (!stream) {
      statusEl.textContent = "Error: could not capture audio.";
      return;
    }

    if (!muteToggle.checked) {
      const audio = new Audio();
      audio.srcObject = stream;
      audio.play().catch(err => console.warn("Audio playback failed:", err));
    }

    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    chunks = [];

    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

    mediaRecorder.onstop = async () => {
      try {
        statusEl.textContent = "Processing recording...";

        // Convert WebM → WAV
        const blob = new Blob(chunks, { type: "audio/webm" });
        const arrayBuffer = await blob.arrayBuffer();
        const audioCtx = new AudioContext();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);

        const wavBuffer = encodeWAV(decoded);
        wavBlob = new Blob([wavBuffer], { type: "audio/wav" });

        showActionButtons(decoded.duration);
      } catch (err) {
        console.error("Conversion error:", err);
        statusEl.textContent = "Error processing recording.";
      }
    };

    mediaRecorder.start();
    captureBtn.disabled = true;
    stopBtn.disabled = false;
  });
});

// ------------------------------
// Stop Capture
// ------------------------------
stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  captureBtn.disabled = false;
  stopBtn.disabled = true;
});

// ------------------------------
// Show Save / Send Buttons
// ------------------------------
function showActionButtons(durationSeconds) {
  const appEl = document.getElementById("app");
  appEl.querySelectorAll(".action-btn").forEach(el => el.remove());

  statusEl.textContent = "Recording stopped. Choose an option:";

  // --- Save to Computer ---
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "💾 Save to Computer";
  saveBtn.className = "action-btn";
  saveBtn.addEventListener("click", () => {
    if (!wavBlob) return;
    const url = URL.createObjectURL(wavBlob);
    browser.downloads.download({
      url,
      filename: "muteone_capture.wav",
      saveAs: true
    });
    statusEl.textContent = "Saved as muteone_capture.wav";
    console.log("Saved to computer");
  });
  appEl.appendChild(saveBtn);

  // --- Send to MuteOne Web ---
  const sendBtn = document.createElement("button");
  sendBtn.textContent = "☁️ Send to MuteOne Web";
  sendBtn.className = "action-btn";
  sendBtn.addEventListener("click", async () => {
    if (!wavBlob) return;
    statusEl.textContent = "Uploading to MuteOne Web...";

    try {
      const fileSize = wavBlob.size;
      const formData = new FormData();
      formData.append("file", wavBlob, "muteone_capture.wav");
      formData.append("filename", "muteone_capture.wav");
      formData.append("fileSize", fileSize);
      formData.append("estimatedDuration", Math.round(durationSeconds));

      const resp = await fetch("https://muteone.com/api/receive", {
        method: "POST",
        body: formData
      });

      if (!resp.ok) {
        const msg = `Upload failed: ${resp.status}`;
        console.error(msg);
        statusEl.textContent = msg;
        return;
      }

      const { uploadId } = await resp.json();
      if (!uploadId) throw new Error("No uploadId returned");

      statusEl.textContent = "Opening MuteOne Web...";
      browser.tabs.create({
        url: `https://muteone.com?upload=${uploadId}`
      });
    } catch (err) {
      console.error("Send to Web error:", err);
      statusEl.textContent = "Error sending to MuteOne Web.";
    }
  });
  appEl.appendChild(sendBtn);
}

// ------------------------------
// WAV Encoder
// ------------------------------
function encodeWAV(decoded) {
  const numChannels = decoded.numberOfChannels;
  const sampleRate = decoded.sampleRate;
  const numFrames = decoded.length;

  const buffer = new ArrayBuffer(44 + numFrames * numChannels * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + numFrames * numChannels * 2, true);
  writeString(view, 8, "WAVE");

  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);

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