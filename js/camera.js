(function(){
  const startBtn = document.getElementById('startBtn');
  // these may not exist in the trimmed-down HTML, make them mutable so we can create them dynamically
  let stopBtn = document.getElementById('stopBtn');
  let preview = document.getElementById('preview');
  let syncOverlay = document.getElementById('syncOverlay');
  let syncPreview = document.getElementById('syncPreview');
  let syncRoomCode = document.getElementById('syncRoomCode');
  let syncCopy = document.getElementById('syncCopy');
  let exitSync = document.getElementById('exitSync');

  let pc;
  let ws;
  let localStream;
  let room;
  let dc; // data channel

  function makeRTCConfig() {
    return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  }

  function createPeer() {
    pc = new RTCPeerConnection(makeRTCConfig());

    // create a data channel for commands (viewer -> camera)
    try {
      dc = pc.createDataChannel('cmd');
      dc.onopen = () => console.log('DataChannel open');
      dc.onmessage = async (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg && msg.type === 'take-photo') {
            // schedule capture when requested (use provided timestamp if present)
            const when = typeof msg.when === 'number' ? msg.when : Date.now();
            const delay = Math.max(0, when - Date.now());
            setTimeout(async () => {
              try {
                if (!localStream) return;
                // prefer the visible overlay preview if present, otherwise use a hidden temporary video
                let videoEl = syncPreview && syncPreview.srcObject ? syncPreview : preview;
                // if videoEl has no dimensions or is not ready, create a temporary offscreen video
                if (!videoEl || !videoEl.videoWidth) {
                  videoEl = document.createElement('video');
                  videoEl.style.display = 'none';
                  videoEl.muted = true;
                  videoEl.playsInline = true;
                  document.body.appendChild(videoEl);
                  videoEl.srcObject = localStream;
                  try { await videoEl.play(); } catch (e) { /* play may be blocked but drawing may still work after metadata */ }
                }

                const w = videoEl.videoWidth || 640;
                const h = videoEl.videoHeight || 480;
                const maxW = 1280;
                const scale = Math.min(1, maxW / w);
                const cw = Math.max(1, Math.floor(w * scale));
                const ch = Math.max(1, Math.floor(h * scale));
                const canvas = document.createElement('canvas');
                canvas.width = cw;
                canvas.height = ch;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(videoEl, 0, 0, cw, ch);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                const out = JSON.stringify({ type: 'photo', payload: dataUrl });
                if (dc && dc.readyState === 'open') dc.send(out);

                // cleanup temporary video element if we created one
                if (videoEl && videoEl !== syncPreview && videoEl !== preview) {
                  videoEl.pause();
                  videoEl.srcObject = null;
                  videoEl.remove();
                }
              } catch (err) { console.error('Error capturing/sending photo', err); }
            }, delay);
          }
        } catch (err) { console.error('DataChannel message error', err); }
      };
    } catch (err) { console.warn('DataChannel not supported or failed', err); }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        ws.send(JSON.stringify({ type: 'ice', room, payload: e.candidate }));
      }
    };

    // no remote tracks for camera, but still keep handlers
    pc.onconnectionstatechange = () => console.log('PC state', pc.connectionState);
  }

  async function start() {
  room = makeRoomCode();
  if (syncRoomCode) syncRoomCode.textContent = room;

    ws = new WebSocket(wsUrl());
    ws.addEventListener('open', async () => {
      console.log('WS open');
      createPeer();

  localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  // attach streams to any preview elements that exist (pages may be minimal)
  if (preview) {
    preview.srcObject = localStream;
    preview.style.display = 'block';
  }
  // also show the live feed inside the overlay preview if present
  if (syncPreview) syncPreview.srcObject = localStream;

  // If the page has no preview or overlay (we stripped them to keep the HTML minimal),
  // create a fullscreen overlay with a video so the user sees the camera after clicking start.
  if (!preview && !syncPreview) {
    syncOverlay = document.createElement('div');
    syncOverlay.id = 'syncOverlay';
    syncOverlay.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;display:block;background:#000;';

    syncPreview = document.createElement('video');
    syncPreview.id = 'syncPreview';
    syncPreview.autoplay = true;
    syncPreview.playsInline = true;
    syncPreview.muted = true;
    syncPreview.style.cssText = 'width:100%;height:100%;object-fit:cover;background:#000;display:block';
    syncOverlay.appendChild(syncPreview);

    // close button
    exitSync = document.createElement('button');
    exitSync.id = 'exitSync';
    exitSync.className = 'btn';
    exitSync.textContent = '✕';
    exitSync.style.cssText = 'position:absolute;left:12px;top:12px;z-index:10001;background:rgba(0,0,0,0.4);color:#fff;border:none;padding:6px 8px;border-radius:6px;';
    syncOverlay.appendChild(exitSync);

    // room-code display & copy button (centered near top)
    const roomWrap = document.createElement('div');
    roomWrap.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);top:18%;z-index:10001;color:#fff;text-align:center;';
    const roomLabel = document.createElement('div');
    roomLabel.style.cssText = 'font-size:14px;opacity:0.9';
    roomLabel.textContent = 'Room code';
    roomWrap.appendChild(roomLabel);

    syncRoomCode = document.createElement('div');
    syncRoomCode.id = 'syncRoomCode';
    syncRoomCode.style.cssText = 'font-size:28px;letter-spacing:4px;margin-top:8px;font-weight:600';
    syncRoomCode.textContent = room || '------';
    roomWrap.appendChild(syncRoomCode);

    const copyHolder = document.createElement('div');
    copyHolder.style.marginTop = '12px';
    syncCopy = document.createElement('button');
    syncCopy.id = 'syncCopy';
    syncCopy.className = 'btn';
    syncCopy.textContent = 'Copy Key';
    copyHolder.appendChild(syncCopy);
    roomWrap.appendChild(copyHolder);
    syncOverlay.appendChild(roomWrap);

    // attach copy handler for the dynamic copy button
    syncCopy.addEventListener('click', () => {
      const code = room || (syncRoomCode && syncRoomCode.textContent) || '';
      // copyToClipboard is defined in main.js
      copyToClipboard(code).then(() => {
        syncCopy.textContent = 'Copied!';
        setTimeout(() => { if (syncCopy) syncCopy.textContent = 'Copy Key'; }, 1500);
      });
    });

    document.body.appendChild(syncOverlay);

    // assign the stream to the newly created video
    syncPreview.srcObject = localStream;

    // attach close handler
    exitSync.addEventListener('click', () => {
      stop();
      if (syncOverlay) syncOverlay.style.display = 'none';
      if (syncPreview) syncPreview.srcObject = null;
      if (preview) preview.style.display = '';
    });
  }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      ws.send(JSON.stringify({ type: 'offer', room, payload: offer }));
  // show the sync overlay (fullscreen live feed) when camera starts, if present
  if (syncOverlay) syncOverlay.style.display = 'block';
  if (preview) preview.style.display = 'none';
    });

    ws.addEventListener('message', async (ev) => {
      try {
        const { type, payload } = JSON.parse(ev.data);
          if (type === 'answer') {
            await pc.setRemoteDescription(payload);
          } else if (type === 'ice') {
            await pc.addIceCandidate(payload);
          } else if (type === 'join') {
            // A viewer has joined after we started - (re)create an offer so the new peer receives it.
            try {
              console.log('Remote joined room, creating/sending offer');
              if (!pc) createPeer();
              if (!localStream) {
                localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
                localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                if (preview) preview.srcObject = localStream;
              }

              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              ws.send(JSON.stringify({ type: 'offer', room, payload: offer }));
            } catch (err) { console.error('Error creating offer for joined peer', err); }
          }
      } catch (e) { console.error(e); }
    });

    startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
  }

  function stop() {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    if (pc) {
      pc.close(); pc = null;
    }
    if (ws) {
      ws.close(); ws = null;
    }
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }

  // overlay copy handler (copies same viewer link)
  if (syncCopy) {
    syncCopy.addEventListener('click', () => {
      // copy only the room code (not the full viewer URL)
      const code = room || syncRoomCode && syncRoomCode.textContent || '';
      copyToClipboard(code).then(() => {
        syncCopy.textContent = 'Copied!';
        setTimeout(() => syncCopy.textContent = 'Copy Key', 1500);
      });
    });
  }

  if (exitSync) {
    exitSync.addEventListener('click', () => {
      // stop camera and hide overlay
      stop();
      if (syncOverlay) syncOverlay.style.display = 'none';
      if (syncPreview) syncPreview.srcObject = null;
      if (preview) preview.style.display = '';
    });
  }

  // Only attach event listeners if the elements exist in the simplified markup
  if (startBtn) startBtn.addEventListener('click', start);
  if (stopBtn) stopBtn.addEventListener('click', stop);

  // if opened with ?room= already, fill it
  const pre = getParam('room');
  if (pre) {
    room = pre;
    if (syncRoomCode) syncRoomCode.textContent = pre;
  }
})();
